from __future__ import annotations

import json
import os
import re
from pathlib import Path

from playwright.sync_api import ConsoleMessage, Page, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / ".artifacts" / "production-qa"
BASE_URL = os.environ.get(
    "LIFE_LEDGER_BASE_URL",
    "https://life-ledger-web.ishallnotwant123.workers.dev",
).rstrip("/")
PASSWORD = os.environ.get("LIFE_LEDGER_TEST_PASSWORD")


def assert_response(response, expected: int = 200) -> dict:
    assert response.status == expected, (
        f"{response.url} returned {response.status}: {response.text()}"
    )
    return response.json()


def assert_no_overflow(page: Page, selector: str = "html") -> None:
    dimensions = page.locator(selector).evaluate(
        "(element) => ({ client: element.clientWidth, scroll: element.scrollWidth })"
    )
    assert dimensions["scroll"] <= dimensions["client"] + 1, (
        selector,
        dimensions,
    )


def sign_in(page: Page) -> None:
    assert PASSWORD, "Set LIFE_LEDGER_TEST_PASSWORD before running production QA"
    page.goto(f"{BASE_URL}/auth/login")
    page.locator("#password").fill(PASSWORD)
    page.get_by_role("button", name=re.compile("进入私人账本")).click()
    page.wait_for_url(lambda url: "/auth/login" not in url)
    page.wait_for_load_state("networkidle")


def capture_console_errors(page: Page, errors: list[str]) -> None:
    def on_console(message: ConsoleMessage) -> None:
        if message.type == "error":
            errors.append(message.text)

    page.on("console", on_console)
    page.on("pageerror", lambda error: errors.append(str(error)))


def main() -> int:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    console_errors: list[str] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, channel="chrome")
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()
        capture_console_errors(page, console_errors)
        sign_in(page)

        assert "Life Ledger" in page.title()
        page.get_by_role("heading", name=re.compile("今天想留下什么")).wait_for()
        assert_no_overflow(page)
        assert page.locator("select").count() == 0
        page.screenshot(path=OUTPUT / "timeline-desktop.png", full_page=True)

        health = assert_response(page.request.get(f"{BASE_URL}/api/v1/health"))
        assert health["ok"] is True
        bootstrap = assert_response(page.request.get(f"{BASE_URL}/api/v1/bootstrap"))
        anime = bootstrap["anime"]
        assert len(anime) == 27, len(anime)
        assert len({work["id"] for work in anime}) == 27
        assert all(work["overallScore"] is None for work in anime)
        assert all(
            work["coverUrl"].startswith("/assets/anime-covers/") for work in anime
        )

        for work in anime:
            cover = page.request.get(f"{BASE_URL}{work['coverUrl']}")
            assert cover.status == 200, (work["title"], cover.status)
            assert cover.headers["content-type"].startswith("image/")

        screens = assert_response(
            page.request.get(
                f"{BASE_URL}/api/v1/media-works?mediaType=screen&limit=100"
            )
        )
        assert screens["items"] == []

        re_zero = next(
            work for work in anime if work["title"] == "Re从零开始的异世界生活"
        )
        detail = assert_response(
            page.request.get(f"{BASE_URL}/api/v1/media-works/{re_zero['id']}")
        )
        assert len(detail["seasons"]) == 3
        assert [season["label"] for season in detail["seasons"]] == [
            "第1季",
            "第2季",
            "第3季",
        ]
        assert detail["overallScore"] is None
        assert all(season["score"] is None for season in detail["seasons"])

        page.goto(f"{BASE_URL}/anime")
        page.locator(".anime-card").first.wait_for()
        assert page.locator(".anime-card").count() == 27
        page.wait_for_function(
            """() => [...document.querySelectorAll('.anime-card img')]
                .every((image) => image.complete && image.naturalWidth > 0)"""
        )
        page.wait_for_timeout(1600)
        assert_no_overflow(page)
        assert page.locator("select").count() == 0
        page.screenshot(path=OUTPUT / "anime-library-desktop.png", full_page=True)

        page.goto(f"{BASE_URL}/anime/{re_zero['id']}")
        page.locator(".season-catalog-card").first.wait_for()
        assert page.locator(".season-catalog-card").count() == 3
        assert page.get_by_text("尚未评分", exact=True).count() == 3
        assert_no_overflow(page)
        page.screenshot(path=OUTPUT / "re-zero-seasons-desktop.png", full_page=True)

        page.goto(f"{BASE_URL}/movies")
        page.get_by_role("heading", name="影视", exact=True).wait_for()
        assert page.get_by_text("0 部作品", exact=True).is_visible()
        assert page.get_by_role("button", name="电影", exact=True).is_visible()
        assert page.get_by_role("button", name="电视剧", exact=True).is_visible()
        assert_no_overflow(page)
        page.screenshot(path=OUTPUT / "movies-desktop.png", full_page=True)

        page.get_by_role("button", name=re.compile("^新建记录")).click()
        dialog = page.get_by_role("dialog", name="新建私人记录")
        dialog.wait_for()
        dialog.get_by_role("button", name="动漫", exact=True).click()
        work_select = dialog.get_by_role("combobox", name=re.compile("关联作品"))
        work_select.click()
        dialog.get_by_role(
            "option", name="Re从零开始的异世界生活", exact=True
        ).click()
        dialog.get_by_role("button", name="季度", exact=True).click()
        season_select = dialog.get_by_role("combobox", name=re.compile("^季度"))
        season_select.wait_for()
        assert "第1季" in season_select.inner_text()
        assert dialog.get_by_label(re.compile("^单集")).count() == 0
        dialog.get_by_role("button", name="添加单集", exact=True).click()
        assert dialog.get_by_label(re.compile("^单集")).is_visible()
        assert_no_overflow(page)
        assert_no_overflow(page, ".capture-dialog")
        page.screenshot(path=OUTPUT / "capture-anime-desktop.png")

        dialog.get_by_role("button", name="影视", exact=True).click()
        assert dialog.get_by_text("影视类型", exact=True).is_visible()
        dialog.get_by_role("button", name="电视剧", exact=True).click()
        assert dialog.get_by_role("button", name="单集", exact=True).is_visible()
        assert_no_overflow(page, ".capture-dialog")
        page.screenshot(path=OUTPUT / "capture-screen-desktop.png")
        dialog.get_by_role("button", name="关闭", exact=True).click()

        page.goto(f"{BASE_URL}/settings")
        page.get_by_role("heading", name="设置", exact=True).wait_for()
        assert page.locator(".settings-index").count() == 0
        assert_no_overflow(page)
        page.screenshot(path=OUTPUT / "settings-desktop.png", full_page=True)

        page.get_by_role("button", name="收起侧栏").click()
        page.wait_for_timeout(120)
        intermediate_width = page.locator(".sidebar").evaluate(
            "(element) => element.getBoundingClientRect().width"
        )
        assert 82 < intermediate_width < 286, intermediate_width
        page.wait_for_timeout(520)
        brand_copy = page.locator(".brand-copy").evaluate(
            """(element) => ({
                display: getComputedStyle(element).display,
                opacity: getComputedStyle(element).opacity
            })"""
        )
        assert brand_copy["display"] != "none"
        assert float(brand_copy["opacity"]) < 0.1
        page.screenshot(path=OUTPUT / "sidebar-collapsed.png", full_page=True)

        storage_state = context.storage_state()
        mobile_context = browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=1,
            storage_state=storage_state,
        )
        mobile = mobile_context.new_page()
        capture_console_errors(mobile, console_errors)
        mobile.goto(BASE_URL)
        mobile.get_by_role("heading", name=re.compile("今天想留下什么")).wait_for()
        assert_no_overflow(mobile)
        mobile.locator('.mobile-header button[aria-label="新建记录"]').click()
        mobile_dialog = mobile.get_by_role("dialog", name="新建私人记录")
        mobile_dialog.wait_for()
        assert_no_overflow(mobile)
        assert_no_overflow(mobile, ".capture-dialog")
        assert mobile.locator("select").count() == 0
        mobile.screenshot(path=OUTPUT / "capture-mobile.png")
        mobile_context.close()

        context.close()
        browser.close()

    ignored_fragments = ("favicon", "Download the React DevTools")
    actionable = [
        error
        for error in console_errors
        if not any(fragment in error for fragment in ignored_fragments)
    ]
    assert not actionable, "\n".join(actionable)

    print(
        json.dumps(
            {
                "ok": True,
                "animeWorks": 27,
                "verifiedCovers": 27,
                "reZeroSeasons": 3,
                "screenWorks": 0,
                "screenshots": sorted(str(path) for path in OUTPUT.glob("*.png")),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
