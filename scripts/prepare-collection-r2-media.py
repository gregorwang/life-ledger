"""Prepare PlayStation covers and figure references for the private R2 bucket."""

from __future__ import annotations

import io
import json
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image, ImageOps


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_ROOT = PROJECT_ROOT / ".r2-media-staging" / "covers"
TARGET_MAX_BYTES = 102_400
MAX_WIDTH = 720
MAX_HEIGHT = 960


def read_remote(url: str) -> Image.Image:
    request = Request(
        url,
        headers={
            "Accept": "image/avif,image/webp,image/png,image/jpeg,*/*",
            "User-Agent": "Life-Ledger-private-collection-ingest/1.0",
        },
    )
    with urlopen(request, timeout=45) as response:
        content_type = response.headers.get("content-type", "")
        if not content_type.startswith("image/"):
            raise RuntimeError(f"Expected an image from {url}, received {content_type!r}")
        return Image.open(io.BytesIO(response.read())).copy()


def normalize(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image)
    if getattr(image, "is_animated", False):
        image.seek(0)
    if image.mode in {"RGBA", "LA"}:
        background = Image.new("RGB", image.size, "white")
        background.paste(image.convert("RGB"), mask=image.getchannel("A"))
        image = background
    else:
        image = image.convert("RGB")
    image.thumbnail((MAX_WIDTH, MAX_HEIGHT), Image.Resampling.LANCZOS)
    return image


def encode_webp(image: Image.Image) -> tuple[bytes, int]:
    quality = 86
    while quality >= 46:
        buffer = io.BytesIO()
        image.save(buffer, "WEBP", quality=quality, method=6, optimize=True)
        payload = buffer.getvalue()
        if len(payload) <= TARGET_MAX_BYTES:
            return payload, quality
        quality -= 4
    while image.width > 360:
        image = image.resize(
            (round(image.width * 0.9), round(image.height * 0.9)),
            Image.Resampling.LANCZOS,
        )
        buffer = io.BytesIO()
        image.save(buffer, "WEBP", quality=46, method=6, optimize=True)
        payload = buffer.getvalue()
        if len(payload) <= TARGET_MAX_BYTES:
            return payload, 46
    return payload, 46


def write_image(category: str, slug: str, image: Image.Image, source: str) -> dict:
    normalized = normalize(image)
    payload, quality = encode_webp(normalized)
    key = f"covers/{category}/{slug}-v1.webp"
    destination = PROJECT_ROOT / ".r2-media-staging" / key
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(payload)
    return {
        "key": key,
        "url": f"/media/{key}",
        "source": source,
        "bytes": len(payload),
        "width": normalized.width,
        "height": normalized.height,
        "quality": quality,
    }


def main() -> None:
    library = json.loads(
        (PROJECT_ROOT / "data" / "playstation-library.json").read_text("utf-8")
    )
    results: list[dict] = []
    for game in library["items"]:
        slug = f"game-{int(game['sourceId']):03d}"
        results.append(
            write_image(
                "game",
                slug,
                read_remote(game["sourceCoverUrl"]),
                game["sourceCoverUrl"],
            )
        )

    references = PROJECT_ROOT / "recon" / "sakura-angel-figure" / "references"
    for slug, filename in (
        ("sakura-angel-front-wide", "front-wide.jpg"),
        ("sakura-angel-front-close", "front-close.jpg"),
        ("sakura-angel-back", "back.jpg"),
    ):
        source = references / filename
        results.append(
            write_image(
                "collectible",
                slug,
                Image.open(source).copy(),
                f"user-supplied:{filename}",
            )
        )

    manifest = PROJECT_ROOT / ".r2-media-staging" / "collection-manifest.json"
    manifest.write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "count": len(results),
                "totalBytes": sum(item["bytes"] for item in results),
                "largestBytes": max(item["bytes"] for item in results),
                "manifest": str(manifest),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
