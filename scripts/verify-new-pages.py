"""Browser verification for the game library route."""

from __future__ import annotations

import json
from pathlib import Path

from playwright.sync_api import sync_playwright


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "http://127.0.0.1:5173"
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

        page.goto(f"{BASE_URL}/games", wait_until="networkidle")
        if "/auth/login" in page.url:
            page.locator('input[name="password"]').fill("emt520")
            page.locator('button[type="submit"]').click()
            page.wait_for_load_state("networkidle")

        page.wait_for_selector(".game-card", timeout=30_000)
        all_games = page.locator(".game-card").count()
        page.get_by_role("button", name="已完成").click()
        page.wait_for_timeout(150)
        completed_games = page.locator(".game-card").count()
        page.get_by_role("button", name="全部").click()
        page.screenshot(path=str(GAME_SCREENSHOT), full_page=True)

        report = {
            "allGames": all_games,
            "completedGames": completed_games,
            "consoleErrors": console_errors,
            "pageErrors": page_errors,
            "failedResponses": failed_responses,
            "screenshots": {
                "games": str(GAME_SCREENSHOT),
            },
        }
        print(json.dumps(report, ensure_ascii=False, indent=2))
        browser.close()


if __name__ == "__main__":
    main()
