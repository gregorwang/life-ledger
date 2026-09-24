import type { CollectibleItem } from "@life-ledger/contracts";
import { Box, Image as ImageIcon, ScanLine, Sparkles } from "lucide-react";
import {
  type CSSProperties,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";

import { loadCollectibles } from "./api";

const SakuraFigureViewer = lazy(() => import("./SakuraFigureViewer"));

type CollectionCategory = CollectibleItem["category"];

const CATEGORY_LABELS: Record<CollectionCategory, string> = {
  figure: "手办",
  merch: "谷子",
  plush: "公仔",
};

export function CyberCollectionPage() {
  const [items, setItems] = useState<CollectibleItem[]>([]);
  const [category, setCategory] = useState<CollectionCategory>("figure");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const clayMode = new URLSearchParams(window.location.search).get("review") === "blockout";

  useEffect(() => {
    const controller = new AbortController();
    void loadCollectibles(controller.signal)
      .then((result) => {
        setItems(result);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadState("error");
      });
    return () => controller.abort();
  }, []);

  const visibleItems = useMemo(
    () => items.filter((item) => item.category === category),
    [category, items],
  );
  const featured = visibleItems[0] ?? null;

  return (
    <div className="page cyber-collection-page">
      <section className="cyber-collection-hero">
        <div className="cyber-collection-copy">
          <p className="eyebrow">PRIVATE OBJECT ARCHIVE / 01</p>
          <h1>
            赛博
            <span>收藏室</span>
          </h1>
          <p>
            把现实中的手办、谷子和公仔保存成可环绕、可拆解的数字藏品。
            每个模型都保留来源视角与几何置信度，不把推断冒充扫描。
          </p>
        </div>
        <div className="cyber-collection-seal" aria-hidden="true">
          <Sparkles size={18} />
          <span>ONE OWNER</span>
          <strong>私藏</strong>
        </div>
      </section>

      <nav className="collection-tabs" aria-label="收藏分类">
        {(Object.keys(CATEGORY_LABELS) as CollectionCategory[]).map((key) => {
          const count = items.filter((item) => item.category === key).length;
          return (
            <button
              key={key}
              className={category === key ? "is-active" : ""}
              type="button"
              aria-pressed={category === key}
              onClick={() => setCategory(key)}
            >
              <span>{CATEGORY_LABELS[key]}</span>
              <small>{String(count).padStart(2, "0")}</small>
            </button>
          );
        })}
      </nav>

      {loadState === "loading" ? (
        <div className="collection-load-state" role="status">
          <ScanLine aria-hidden="true" />
          正在读取私人藏品与模型清单…
        </div>
      ) : loadState === "error" ? (
        <div className="collection-load-state is-error" role="alert">
          收藏事实层暂时不可用，请稍后重试。
        </div>
      ) : featured ? (
        <section className="collection-feature">
          <div className="collection-viewer-stage">
            <Suspense
              fallback={
                <div className="viewer-loading" role="status">
                  <span />
                  正在按需加载 Three.js 与模型组件…
                </div>
              }
            >
              <SakuraFigureViewer clayMode={clayMode} />
            </Suspense>
          </div>

          <aside className="collection-object-panel">
            <div className="collection-index">
              <span>ARCHIVE ITEM</span>
              <strong>001</strong>
            </div>
            <p className="eyebrow">PROCEDURAL THREE.JS SCULPT</p>
            <h2>{featured.title}</h2>
            <dl className="collection-metadata">
              <div>
                <dt>作品</dt>
                <dd>{featured.franchise ?? "未记录"}</dd>
              </div>
              <div>
                <dt>角色</dt>
                <dd>{featured.characterName ?? "未记录"}</dd>
              </div>
              <div>
                <dt>厂牌</dt>
                <dd>{featured.manufacturer ?? "未记录"}</dd>
              </div>
              <div>
                <dt>建模方式</dt>
                <dd>代码重建 · 多视角约束</dd>
              </div>
            </dl>
            <div className="confidence-bars">
              <label>
                <span>可见结构置信度</span>
                <strong>{Math.round(featured.geometryConfidence * 100)}%</strong>
                <i style={{"--confidence": featured.geometryConfidence} as CSSProperties} />
              </label>
              <label>
                <span>隐藏区域置信度</span>
                <strong>{Math.round(featured.hiddenRegionConfidence * 100)}%</strong>
                <i style={{"--confidence": featured.hiddenRegionConfidence} as CSSProperties} />
              </label>
            </div>
            <p className="collection-notes">{featured.notes}</p>
          </aside>

          <div className="collection-reference-strip">
            <div>
              <ImageIcon aria-hidden="true" size={17} />
              <span>建模约束图</span>
              <small>FRONT / CLOSE / BACK</small>
            </div>
            <div className="collection-reference-images">
              {featured.sourceImageUrls.map((url, index) => (
                <figure key={url}>
                  <img
                    src={url}
                    alt={`${featured.title} 建模参考图 ${index + 1}`}
                    loading="eager"
                    decoding="async"
                    width="180"
                    height="180"
                  />
                  <figcaption>{["正面全景", "正面近景", "背面"][index] ?? `视角 ${index + 1}`}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section className="collection-empty">
          <Box aria-hidden="true" size={32} />
          <p className="eyebrow">{category.toUpperCase()} ARCHIVE</p>
          <h2>这个陈列层还没有藏品</h2>
          <p>这里不会用虚构商品填空；录入现实藏品并补齐照片后才会生成 3D 档案。</p>
        </section>
      )}
    </div>
  );
}
