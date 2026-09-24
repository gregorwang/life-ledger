import { Pause, Play, RotateCcw, ScanSearch } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import {
  createSakuraAngelFigureModel,
  type SakuraFigureRuntime,
} from "./three/createSakuraAngelFigureDetailed";

interface SakuraFigureViewerProps {
  clayMode?: boolean;
}

export default function SakuraFigureViewer({
  clayMode = false,
}: SakuraFigureViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<SakuraFigureRuntime | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const [autoRotate, setAutoRotate] = useState(!clayMode);
  const [explode, setExplode] = useState(0);
  const [selectedPart, setSelectedPart] = useState<string | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 100);
    camera.position.set(-0.08, 1.06, 13.2);

    const renderer = new THREE.WebGLRenderer({
      antialias: window.devicePixelRatio <= 1.5,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.domElement.setAttribute(
      "aria-label",
      "木之本樱天使羽翼手办三维查看器，可拖动旋转和滚轮缩放",
    );
    renderer.domElement.tabIndex = 0;
    mount.append(renderer.domElement);

    const model = createSakuraAngelFigureModel({
      clayMode,
      quality: window.innerWidth < 760 ? "mobile" : "desktop",
    });
    scene.add(model);
    runtimeRef.current = model.userData.sculptRuntime as SakuraFigureRuntime;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.minDistance = 7.5;
    controls.maxDistance = 19;
    controls.minPolarAngle = 0.42;
    controls.maxPolarAngle = Math.PI - 0.3;
    controls.target.set(-0.08, 0.63, 0);
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.72;
    controls.saveState();
    controlsRef.current = controls;

    const ambient = new THREE.HemisphereLight(0xd9f3ff, 0x41374d, 1.85);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xfff4e9, 4.2);
    key.position.set(-4.4, 7.8, 6.6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -4;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x95cfff, 1.35);
    fill.position.set(5, 3, 4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xc6efff, 2.2);
    rim.position.set(1.5, 4, -6);
    scene.add(rim);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(3.8, 64),
      new THREE.ShadowMaterial({color: 0x536878, opacity: 0.19}),
    );
    ground.name = "shadow-ground";
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2.18;
    ground.receiveShadow = true;
    scene.add(ground);

    const pointer = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const handlePointer = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster
        .intersectObject(model, true)
        .find((item) => typeof item.object.userData.partId === "string");
      const partId = (hit?.object.userData.partId as string | undefined) ?? null;
      runtimeRef.current?.setSelected(partId);
      setSelectedPart(partId);
    };
    renderer.domElement.addEventListener("pointerup", handlePointer);

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    let frame = 0;
    let visible = true;
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? true;
      },
      {rootMargin: "120px"},
    );
    visibilityObserver.observe(mount);

    const render = () => {
      frame = requestAnimationFrame(render);
      if (!visible) return;
      controls.update();
      renderer.render(scene, camera);
    };
    render();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      renderer.domElement.removeEventListener("pointerup", handlePointer);
      controls.dispose();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const item of materials) item.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
      runtimeRef.current = null;
      controlsRef.current = null;
    };
  }, [clayMode]);

  useEffect(() => {
    if (controlsRef.current) controlsRef.current.autoRotate = autoRotate;
  }, [autoRotate]);

  const updateExplode = (value: number) => {
    setExplode(value);
    runtimeRef.current?.setExplode(value);
  };

  const reset = () => {
    controlsRef.current?.reset();
    runtimeRef.current?.reset();
    setExplode(0);
    setSelectedPart(null);
  };

  return (
    <div className="figure-viewer">
      <div className="figure-viewer-canvas" ref={mountRef}>
        <span className="figure-viewer-orbit" aria-hidden="true" />
        <div className="figure-viewer-mode">
          <ScanSearch aria-hidden="true" size={14} />
          {clayMode ? "BLOCKOUT REVIEW" : "REAL-TIME SCULPT"}
        </div>
        <div className="figure-viewer-selected" aria-live="polite">
          {selectedPart ? `已选部件 · ${selectedPart}` : "点击模型检查独立部件"}
        </div>
      </div>
      <div className="figure-viewer-toolbar">
        <button
          type="button"
          onClick={() => setAutoRotate((value) => !value)}
          aria-pressed={autoRotate}
        >
          {autoRotate ? <Pause aria-hidden="true" size={15} /> : <Play aria-hidden="true" size={15} />}
          {autoRotate ? "暂停环绕" : "继续环绕"}
        </button>
        <label>
          <span>拆解</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={explode}
            onChange={(event) => updateExplode(Number(event.target.value))}
          />
        </label>
        <button type="button" onClick={reset}>
          <RotateCcw aria-hidden="true" size={15} />
          复位
        </button>
      </div>
    </div>
  );
}
