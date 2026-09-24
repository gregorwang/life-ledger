"""Prepare private Life Ledger cover art for Cloudflare R2.

Existing catalog images are read from the web public directory only as ingest
sources. New season artwork is downloaded from AniList. Every output is a
single-frame WebP sized for the UI and capped near 100 KiB. The generated
staging directory is intentionally ignored by Git and is never bundled into
the Worker assets.
"""

from __future__ import annotations

import io
import json
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image, ImageDraw, ImageOps


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_ROOT = PROJECT_ROOT / ".r2-media-staging" / "covers"
TARGET_MAX_BYTES = 102_400
MAX_WIDTH = 640
MAX_HEIGHT = 960

REMOTE_ANIME_COVERS = {
    "kokoro-connect": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx11887-ypZTwcRqopiL.jpg",
    "sentenced-to-be-a-hero": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx167152-O1pm6DWwifBD.jpg",
    "hyouka": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx12189-zj5AWUYO53Fv.jpg",
    "marriage-toxin": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx199547-LAaG3cmKCGhr.jpg",
    "re-zero-season-1": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21355-wRVUrGxpvIQQ.jpg",
    "re-zero-season-2": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx108632-lQWnmw7XaNOK.jpg",
    "re-zero-season-3": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx163134-yieRFbvUOH9a.jpg",
    "re-zero-season-4": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx189046-yaHWtS5FII46.jpg",
    "this-art-club-has-a-problem": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21457-MzWktnoD67PO.png",
    "k-on": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx5680-r3AI3Cwfv0Aq.png",
    "tamako-market": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/nx16417-r8Njy5UnwvDE.png",
    "dangers-in-my-heart-season-2": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx166216-vCMkF4e3x5FB.jpg",
    "saekano-season-2": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/nx21180-6ob7MFdjttYe.jpg",
    "takagi-san-season-2": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx107068-KJq0eFP0GTjL.jpg",
    "takagi-san-season-3": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx138424-97Nz1P7M3O2d.png",
    "date-a-live-season-2": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/nx19163-eHXj3mNRaOXt.jpg",
    "date-a-live-season-3": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/nx100722-M5nXzDkuGOLC.png",
    "date-a-live-season-4": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx116605-uzDakXnaZ1OW.jpg",
    "date-a-live-season-5": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx151380-gvN5PjrybTw2.jpg",
    "attack-on-titan-season-2": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx20958-HuFJyr54Mmir.jpg",
    "attack-on-titan-season-3": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx99147-AiPDD8cwlCfi.jpg",
    "attack-on-titan-season-4": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx110277-sKUNXAsWMNFw.jpg",
    "solo-leveling-season-2": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx176496-9BDMjAZGEbq4.png",
    "tower-of-god-season-2": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx153406-dU2RLKgMUF2U.jpg",
    "k-on-season-2": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx7791-4tnomla2mMDp.png",
    "medalist-season-2": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx189275-eHsK0lNnFfXH.jpg",
    "fog-hill-season-2": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx122585-y2uQETSGj66X.png",
    "demon-slayer-mugen-train": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx129874-g6ZKXB94Hui1.jpg",
    "demon-slayer-entertainment-district": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx142329-kET1PIXJv2eW.jpg",
    "demon-slayer-swordsmith-village": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx145139-rRimpHGWLhym.png",
    "demon-slayer-hashira-training": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx166240-PBV7zukIHW7V.png",
}

ANILIST_SEARCH_COVERS = {
    "blue-box": "Blue Box",
    "medalist": "Medalist",
    "saekano": "Saekano: How to Raise a Boring Girlfriend",
    "takagi-san": "Teasing Master Takagi-san",
    "shikimori": "Shikimori's Not Just a Cutie",
    "kubo-san": "Kubo Won't Let Me Be Invisible",
    "date-a-live": "Date A Live",
    "iroduku": "Iroduku: The World in Colors",
    "summer-pockets": "Summer Pockets",
    "summertime-rendering": "Summer Time Rendering",
    "makeine": "Makeine: Too Many Losing Heroines!",
    "dangers-in-my-heart": "The Dangers in My Heart",
    "madoka-magica": "Puella Magi Madoka Magica",
    "demon-slayer": "Demon Slayer: Kimetsu no Yaiba",
    "attack-on-titan": "Attack on Titan",
    "fate-series": "Fate/stay night: Unlimited Blade Works",
    "chainsaw-man": "Chainsaw Man",
    "darling-franxx": "DARLING in the FRANXX",
    "sakurasou": "The Pet Girl of Sakurasou",
    "bocchi-the-rock": "BOCCHI THE ROCK!",
    "henneko": "The Hentai Prince and the Stony Cat",
    "oresuki": "ORESUKI Are you the only one who loves me?",
    "lycoris-recoil": "Lycoris Recoil",
    "solo-leveling": "Solo Leveling",
    "tower-of-god": "Tower of God",
    "fog-hill": "Fog Hill of Five Elements",
}

REMOTE_SCREEN_COVERS = {
    "interstellar": "https://media.themoviedb.org/t/p/w780/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg",
    "demon-slayer-infinity-castle": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx178788-zm3gtpB9TpRt.jpg",
    "persian-lessons": "https://media.themoviedb.org/t/p/w780/ppReRGszmdZC2194keN4cGoLIPQ.jpg",
    "ip-man": "https://media.themoviedb.org/t/p/w780/9bUIrDKnesNbBL1nAl1nt7gtocE.jpg",
    "ip-man-2": "https://media.themoviedb.org/t/p/w780/wMcyFfKcJneVgcHxWYiQNUNHUsq.jpg",
    "ip-man-3": "https://media.themoviedb.org/t/p/w780/8PvinaGEqzf1rrfFAxiXujJnCtI.jpg",
    "ip-man-4": "https://media.themoviedb.org/t/p/w780/b5cz6BoyHrgBnhfDHOW5hXRWbln.jpg",
    "catch-me-if-you-can": "https://media.themoviedb.org/t/p/w780/ctjEj2xM32OvBXCq8zAdK3ZrsAj.jpg",
    "ant-man-and-the-wasp": "https://media.themoviedb.org/t/p/w780/cFQEO687n1K6umXbInzocxcnAQz.jpg",
    "avengers-doomsday": "https://lumiere-a.akamaihd.net/v1/images/p_movies_avengersdoomsday_drdoom_poster_v1_96f5df50.jpeg?region=0%2C0%2C540%2C810",
    "iron-man": "https://media.themoviedb.org/t/p/w780/78lPtwv72eTNqFW9COBYI0dWDJa.jpg",
}


def load_remote_image(url: str) -> Image.Image:
    request = Request(
        url,
        headers={
            "Accept": "image/avif,image/webp,image/png,image/jpeg,*/*",
            "User-Agent": "Life-Ledger-private-media-ingest/3.0",
        },
    )
    with urlopen(request, timeout=45) as response:
        content_type = response.headers.get("content-type", "")
        if not content_type.startswith("image/"):
            raise RuntimeError(f"Expected image from {url}, got {content_type!r}")
        return Image.open(io.BytesIO(response.read())).copy()

def resolve_anilist_search_covers() -> dict[str, str]:
    fields = "coverImage { extraLarge large }"
    aliases = "\n".join(
        f"m{index}: Media(type: ANIME, search: {json.dumps(query)}) {{ {fields} }}"
        for index, query in enumerate(ANILIST_SEARCH_COVERS.values())
    )
    request = Request(
        "https://graphql.anilist.co",
        method="POST",
        data=json.dumps({"query": f"query LifeLedgerCovers {{ {aliases} }}"}).encode(),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "Life-Ledger-private-media-ingest/3.0",
        },
    )
    with urlopen(request, timeout=45) as response:
        payload = json.loads(response.read())
    if payload.get("errors"):
        raise RuntimeError(f"AniList cover query failed: {payload['errors']}")

    resolved: dict[str, str] = {}
    for index, slug in enumerate(ANILIST_SEARCH_COVERS):
        cover = payload["data"][f"m{index}"]["coverImage"]
        url = cover.get("extraLarge") or cover.get("large")
        if not url:
            raise RuntimeError(f"AniList returned no cover for {slug}")
        resolved[slug] = url
    return resolved


def normalize_image(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image)
    if getattr(image, "is_animated", False):
        image.seek(0)
    if image.mode in {"RGBA", "LA"}:
        background = Image.new("RGB", image.size, "white")
        alpha = image.getchannel("A")
        background.paste(image.convert("RGB"), mask=alpha)
        image = background
    else:
        image = image.convert("RGB")
    image.thumbnail((MAX_WIDTH, MAX_HEIGHT), Image.Resampling.LANCZOS)
    return image


def encode_webp(image: Image.Image) -> tuple[bytes, int]:
    quality = 84
    while quality >= 48:
        buffer = io.BytesIO()
        image.save(
            buffer,
            format="WEBP",
            quality=quality,
            method=6,
            optimize=True,
        )
        payload = buffer.getvalue()
        if len(payload) <= TARGET_MAX_BYTES:
            return payload, quality
        quality -= 4

    resized = image
    while True:
        resized = resized.resize(
            (
                max(320, round(resized.width * 0.9)),
                max(450, round(resized.height * 0.9)),
            ),
            Image.Resampling.LANCZOS,
        )
        buffer = io.BytesIO()
        resized.save(buffer, format="WEBP", quality=48, method=6, optimize=True)
        payload = buffer.getvalue()
        if len(payload) <= TARGET_MAX_BYTES or resized.width <= 320:
            return payload, 48


def create_catalog_placeholder() -> Image.Image:
    image = Image.new("RGB", (460, 650), "#07162f")
    draw = ImageDraw.Draw(image, "RGBA")
    draw.ellipse((-150, -90, 420, 480), fill=(36, 167, 239, 90))
    draw.ellipse((120, 210, 680, 780), fill=(255, 70, 159, 78))
    draw.polygon(
        [(0, 460), (460, 205), (460, 650), (0, 650)],
        fill=(6, 20, 48, 190),
    )
    for offset in range(-220, 760, 80):
        draw.line(
            ((offset, 650), (offset + 390, 0)),
            fill=(255, 255, 255, 34),
            width=2,
        )
    return image


def write_cover(
    category: str,
    slug: str,
    image: Image.Image,
    source: str,
) -> dict[str, object]:
    normalized = normalize_image(image)
    payload, quality = encode_webp(normalized)
    relative_key = f"covers/{category}/{slug}-v1.webp"
    destination = PROJECT_ROOT / ".r2-media-staging" / relative_key
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(payload)
    return {
        "key": relative_key,
        "url": f"/media/{relative_key}",
        "source": source,
        "bytes": len(payload),
        "width": normalized.width,
        "height": normalized.height,
        "quality": quality,
    }


def main() -> None:
    results: list[dict[str, object]] = []
    anime_sources = {
        **resolve_anilist_search_covers(),
        **REMOTE_ANIME_COVERS,
    }
    for slug, url in sorted(anime_sources.items()):
        results.append(write_cover("anime", slug, load_remote_image(url), url))
    for slug, url in sorted(REMOTE_SCREEN_COVERS.items()):
        results.append(write_cover("screen", slug, load_remote_image(url), url))
    results.append(
        write_cover(
            "anime",
            "catalog-placeholder",
            create_catalog_placeholder(),
            "generated:life-ledger-catalog-placeholder-v1",
        ),
    )

    manifest_path = PROJECT_ROOT / ".r2-media-staging" / "manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    total_bytes = sum(int(item["bytes"]) for item in results)
    largest = max(results, key=lambda item: int(item["bytes"]))
    print(
        json.dumps(
            {
                "count": len(results),
                "total_bytes": total_bytes,
                "largest": largest,
                "manifest": str(manifest_path),
            },
            ensure_ascii=False,
            indent=2,
        ),
    )


if __name__ == "__main__":
    main()
