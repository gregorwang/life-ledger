from __future__ import annotations

import json
import re
from pathlib import Path

from playwright.sync_api import ConsoleMessage, Page, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "http://localhost:5173"
PASSWORD = "life-ledger-local-browser-check"
SCREENSHOT = ROOT / ".artifacts" / "anime-timeline-order.png"
MOBILE_SCREENSHOT = ROOT / ".artifacts" / "anime-timeline-order-mobile.png"


def open_authenticated(page: Page) -> None:
    page.goto(BASE_URL)
    page.wait_for_load_state("domcontentloaded")
    password = page.locator("#password")
    if password.count():
        password.fill(PASSWORD)
        page.get_by_role("button", name=re.compile("进入私人账本")).click()
        page.wait_for_url(lambda url: "/auth/login" not in url)
    page.wait_for_load_state("networkidle")


def main() -> int:
    SCREENSHOT.parent.mkdir(exist_ok=True)
    console_errors: list[str] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, channel="chrome")
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()

        def capture_console(message: ConsoleMessage) -> None:
            if (
                message.type == "error"
                and not message.text.startswith("Failed to load resource:")
            ):
                console_errors.append(message.text)

        page.on("console", capture_console)
        page.on("pageerror", lambda error: console_errors.append(str(error)))
        open_authenticated(page)

        bootstrap_response = page.request.get(f"{BASE_URL}/api/v1/bootstrap")
        assert bootstrap_response.ok, bootstrap_response.text()
        anime = bootstrap_response.json()["anime"]
        ids = [work["id"] for work in anime]
        expected_relative_order = [
            "media_seed_anime_hyouka",
            "browser_seirei",
            "media_seed_anime_kokoro_connect",
            "browser_haihara",
            "media_seed_anime_madoka",
            "browser_no_date",
        ]
        positions = [ids.index(work_id) for work_id in expected_relative_order]
        assert positions == sorted(positions), positions
        deleted_only = next(
            work for work in anime if work["id"] == "browser_deleted_only"
        )
        assert deleted_only["logCount"] == 0, deleted_only
        assert deleted_only["lastLoggedAt"] is None, deleted_only
        first_null = next(
            index for index, work in enumerate(anime) if work["lastLoggedAt"] is None
        )
        assert all(
            work["lastLoggedAt"] is not None for work in anime[:first_null]
        )
        assert all(
            work["lastLoggedAt"] is None for work in anime[first_null:]
        )
        madoka = next(
            work for work in anime if work["id"] == "media_seed_anime_madoka"
        )
        assert madoka["lastLoggedDatePrecision"] == "month", madoka

        page.goto(f"{BASE_URL}/anime")
        page.wait_for_load_state("networkidle")
        page.get_by_role("heading", name="动漫库").wait_for()
        body_text = page.locator("body").inner_text()
        for forbidden in (
            "completed; followed weekly as aired",
            "completed; watched twice",
        ):
            assert forbidden not in body_text
        assert not re.search(r"(^|\s)completed($|\s)", body_text)

        rendered_titles = page.locator(".anime-card .anime-card-copy > strong").all_text_contents()
        api_titles = [work["title"] for work in anime[: len(rendered_titles)]]
        assert rendered_titles == api_titles, {
            "rendered": rendered_titles,
            "api": api_titles,
        }
        assert page.get_by_text("未记录观看时间", exact=True).count() == 1
        page.get_by_text("作品时间线 · 约2026年2月", exact=True).wait_for()
        page.get_by_text(
            re.compile(r"\d+ 部有作品时间线 · \d+ 部暂无作品时间线")
        ).wait_for()

        sort_button = page.locator(
            ".library-select .anime-select-trigger"
        ).nth(1)
        assert "作品时间线：最近优先" in sort_button.inner_text()
        page.screenshot(path=str(SCREENSHOT), full_page=True)

        sort_button.click()
        page.get_by_role("option", name="作品时间线：最早优先").click()
        assert "作品时间线：最早优先" in sort_button.inner_text()

        page.goto(f"{BASE_URL}/anime/media_seed_anime_madoka")
        page.wait_for_load_state("networkidle")
        page.get_by_role("heading", name="魔法少女小圆").wait_for()
        page.get_by_text("最后作品时间线 约2026年2月", exact=True).wait_for()

        page.goto(f"{BASE_URL}/anime")
        page.wait_for_load_state("networkidle")
        page.set_viewport_size({"width": 390, "height": 844})
        page.get_by_role("heading", name="动漫库").wait_for()
        assert page.evaluate(
            "document.documentElement.scrollWidth <= window.innerWidth"
        )
        page.screenshot(path=str(MOBILE_SCREENSHOT), full_page=True)

        assert not console_errors, json.dumps(console_errors, ensure_ascii=False)
        browser.close()

    print(
        json.dumps(
            {
                "ok": True,
                "animeCount": len(anime),
                "fixturePositions": dict(
                    zip(expected_relative_order, positions, strict=True)
                ),
                "firstNullIndex": first_null,
                "screenshot": str(SCREENSHOT),
                "mobileScreenshot": str(MOBILE_SCREENSHOT),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
