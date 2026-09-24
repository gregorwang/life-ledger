"""Browser verification for the game library and cyber collection routes."""

from __future__ import annotations

import json
from pathlib import Path

from playwright.sync_api import sync_playwright


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "http://127.0.0.1:5173"
BLOCKOUT_RENDER = (
    PROJECT_ROOT
    / "recon"
    / "sakura-angel-figure"
    / "blockout-render.png"
)
FINAL_RENDER = (
    PROJECT_ROOT
    / "recon"
    / "sakura-angel-figure"
    / "final-material-render.png"
)
COLLECTION_SCREENSHOT = PROJECT_ROOT / ".tmp" / "collection-page.png"
GAME_SCREENSHOT = PROJECT_ROOT / ".tmp" / "game-page.png"


def main() -> None:
    PROJECT_ROOT.joinpath(".tmp").mkdir(exist_ok=True)
    console_errors: list[str] = []
    page_errors: list[str] = []
    failed_responses: list[dict[str, object]] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1440, "height": 1000},
            device_scale_factor=1,
        )
        page = context.new_page()
        page.on(
            "console",
            lambda message: (
                console_errors.append(message.text)
                if message.type == "error"
                else None
            ),
        )
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.on(
            "response",
            lambda response: (
                failed_responses.append(
                    {"status": response.status, "url": response.url}
                )
                if response.status >= 400
                else None
            ),
        )

        page.goto(
            f"{BASE_URL}/collection?review=blockout",
            wait_until="networkidle",
        )
        if "/auth/login" in page.url:
            page.locator('input[name="password"]').fill("emt520")
            page.locator('button[type="submit"]').click()
            page.wait_for_load_state("networkidle")

        page.wait_for_selector(".figure-viewer canvas", timeout=30_000)
        page.wait_for_timeout(1_200)
        collection_items = page.locator(".collection-object-panel h2").count()
        reference_images = page.locator(".collection-reference-images img").count()
        page.screenshot(path=str(COLLECTION_SCREENSHOT), full_page=True)

        slider = page.locator('.figure-viewer-toolbar input[type="range"]')
        slider.evaluate(
            """element => {
              element.value = '0.55';
              element.dispatchEvent(new Event('input', { bubbles: true }));
              element.dispatchEvent(new Event('change', { bubbles: true }));
            }"""
        )
        page.wait_for_timeout(300)
        exploded_value = slider.input_value()
        page.get_by_role("button", name="复位").click()

        # The reconstruction review requires a clean, square canvas that can be
        # compared with the square front reference without UI chrome or cropping.
        page.add_style_tag(
            content="""
              .collection-feature { display: block !important; }
              .collection-object-panel,
              .collection-reference-strip,
              .figure-viewer-toolbar,
              .figure-viewer-status { display: none !important; }
              .collection-viewer-stage,
              .figure-viewer,
              .figure-viewer-canvas {
                width: 900px !important;
                height: 900px !important;
                min-height: 900px !important;
              }
              .figure-viewer canvas {
                background:
                  linear-gradient(
                    to bottom,
                    #ffffff 0 11%,
                    #c9efff 11% 86%,
                    #ffffff 86% 100%
                  ) !important;
              }
            """
        )
        page.wait_for_timeout(600)
        page.locator(".figure-viewer canvas").screenshot(path=str(BLOCKOUT_RENDER))

        page.goto(f"{BASE_URL}/collection", wait_until="networkidle")
        page.wait_for_selector(".figure-viewer canvas", timeout=30_000)
        page.get_by_role("button", name="暂停环绕").click()
        page.add_style_tag(
            content="""
              .collection-feature { display: block !important; }
              .collection-object-panel,
              .collection-reference-strip,
              .figure-viewer-toolbar,
              .figure-viewer-status { display: none !important; }
              .collection-viewer-stage,
              .figure-viewer,
              .figure-viewer-canvas {
                width: 900px !important;
                height: 900px !important;
                min-height: 900px !important;
              }
            """
        )
        page.wait_for_timeout(600)
        page.locator(".figure-viewer canvas").screenshot(path=str(FINAL_RENDER))

        page.goto(f"{BASE_URL}/games", wait_until="networkidle")
        page.wait_for_selector(".game-card", timeout=30_000)
        all_games = page.locator(".game-card").count()
        page.get_by_role("button", name="已完成").click()
        page.wait_for_timeout(150)
        completed_games = page.locator(".game-card").count()
        page.get_by_role("button", name="全部").click()
        page.screenshot(path=str(GAME_SCREENSHOT), full_page=True)

        report = {
            "collectionItems": collection_items,
            "referenceImages": reference_images,
            "explodeSliderValue": exploded_value,
            "allGames": all_games,
            "completedGames": completed_games,
            "consoleErrors": console_errors,
            "pageErrors": page_errors,
            "failedResponses": failed_responses,
            "screenshots": {
                "blockout": str(BLOCKOUT_RENDER),
                "finalMaterial": str(FINAL_RENDER),
                "collection": str(COLLECTION_SCREENSHOT),
                "games": str(GAME_SCREENSHOT),
            },
        }
        print(json.dumps(report, ensure_ascii=False, indent=2))
        browser.close()


if __name__ == "__main__":
    main()
