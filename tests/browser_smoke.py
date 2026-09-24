from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import ConsoleMessage, Page, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / ".artifacts"
# `__Host-` session cookies are Secure. Chromium and Playwright consistently
# apply the localhost secure-context exception to both page and API requests,
# while the raw 127.0.0.1 host can diverge between those two request paths.
BASE_URL = os.environ.get("LIFE_LEDGER_BASE_URL", "http://localhost:5173")
TEST_PASSWORD = os.environ.get("LIFE_LEDGER_TEST_PASSWORD", "visual-test-only")


def assert_response(response, expected: int = 200) -> dict:
    assert response.status == expected, (
        f"{response.url} returned {response.status}: {response.text()}"
    )
    return response.json()


def visible_button(page: Page, label: str):
    return page.locator("button:visible", has_text=label).first


def open_authenticated(page: Page) -> None:
    page.goto(BASE_URL)
    page.wait_for_load_state("domcontentloaded")
    password = page.locator("#password")
    if password.count():
        password.fill(TEST_PASSWORD)
        page.get_by_role("button", name=re.compile("进入私人账本")).click()
        page.wait_for_url(lambda url: "/auth/login" not in url)
    page.wait_for_load_state("networkidle")


def main() -> int:
    ARTIFACTS.mkdir(exist_ok=True)
    console_errors: list[str] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, channel="chrome")
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()

        def capture_console(message: ConsoleMessage) -> None:
            if message.type == "error":
                console_errors.append(message.text)

        page.on("console", capture_console)
        page.on("pageerror", lambda error: console_errors.append(str(error)))
        open_authenticated(page)

        assert "Life Ledger" in page.title()
        page.get_by_role("heading", name=re.compile("今天想留下什么")).wait_for()
        page.screenshot(path=str(ARTIFACTS / "desktop-timeline.png"), full_page=True)

        health = assert_response(page.request.get(f"{BASE_URL}/api/v1/health"))
        assert health["ok"] is True
        bootstrap = assert_response(page.request.get(f"{BASE_URL}/api/v1/bootstrap"))
        assert bootstrap["entries"] and bootstrap["anime"]
        public_response = page.request.get(f"{BASE_URL}/public/v1/anime")
        public_payload = assert_response(public_response)
        assert public_response.headers.get("cache-control") == "no-store"
        assert "bodyRaw" not in json.dumps(public_payload)

        message_id = f"e2e_{datetime.now(timezone.utc).timestamp()}"
        capture_payload = {
            "rawText": "浏览器集成测试：这条记录应保持私人并可幂等写入。",
            "type": "note",
            "title": "E2E API 私人记录",
            "occurredAt": datetime.now(timezone.utc).isoformat(),
            "timezone": "Asia/Tokyo",
            "temporalUncertain": False,
            "tags": ["e2e"],
            "source": {
                "channel": "web",
                "messageId": message_id,
                "conversationId": None,
            },
            "visibility": "private",
        }
        first_capture = assert_response(
            page.request.post(
                f"{BASE_URL}/api/v1/entries",
                data=json.dumps(capture_payload),
                headers={"Content-Type": "application/json"},
            ),
            201,
        )
        assert first_capture["entry"]["visibility"] == "private"
        duplicate_capture = assert_response(
            page.request.post(
                f"{BASE_URL}/api/v1/entries",
                data=json.dumps(capture_payload),
                headers={"Content-Type": "application/json"},
            ),
            201,
        )
        assert duplicate_capture["deduplicated"] is True
        api_entry_id = first_capture["entry"]["id"]
        assert_response(page.request.delete(f"{BASE_URL}/api/v1/entries/{api_entry_id}"))
        assert_response(
            page.request.post(
                f"{BASE_URL}/api/v1/entries/{api_entry_id}/purge",
                data=json.dumps({"confirmationId": api_entry_id}),
                headers={"Content-Type": "application/json"},
            )
        )

        visible_button(page, "新建记录").click()
        dialog = page.get_by_role("dialog", name="新建私人记录")
        dialog.wait_for()
        dialog.get_by_role("button", name="笔记", exact=True).click()
        dialog.get_by_label(re.compile("原始表达")).fill(
            "浏览器验收：保存一条私人笔记，再验证发布、撤回和恢复。"
        )
        dialog.get_by_label(re.compile("标题")).fill("浏览器验收记录")
        dialog.get_by_role("button", name="保存记录").click()
        page.wait_for_url(re.compile(r"/entries/"))
        ui_entry_id = page.url.rsplit("/", 1)[-1]
        page.get_by_role("heading", name="浏览器验收记录").wait_for()
        assert page.get_by_text("私人", exact=True).first.is_visible()

        page.get_by_role("button", name="生成公开预览").click()
        publish_dialog = page.get_by_role("dialog", name="确认最终公开内容")
        publish_dialog.wait_for()
        publish_dialog.get_by_role("button", name="保持私人").click()
        publish_dialog.wait_for(state="detached")
        page.get_by_text("私人", exact=True).first.wait_for()

        page.get_by_role("button", name="生成公开预览").click()
        publish_dialog.wait_for()
        confirmation_label = publish_dialog.locator("label").filter(
            has_text="确认公开"
        ).inner_text()
        code_match = re.search(r"LL-\d+", confirmation_label)
        assert code_match, confirmation_label
        publish_dialog.locator("#publish-confirmation").fill(
            f"确认公开 {code_match.group(0)}"
        )
        publish_dialog.get_by_role("button", name="确认并公开").click()
        publish_dialog.wait_for(state="detached")
        page.get_by_text("公开", exact=True).first.wait_for()
        published_timeline_response = page.request.get(
            f"{BASE_URL}/public/v1/timeline"
        )
        published_timeline = assert_response(published_timeline_response)
        published_timeline_etag = published_timeline_response.headers.get("etag")
        published_item = next(
            item for item in published_timeline["items"] if item["id"] == ui_entry_id
        )
        assert published_item["body"]
        assert "bodyRaw" not in published_item
        assert "sourceMessageId" not in published_item
        page.get_by_role("button", name="取消公开").click()
        page.get_by_text("私人", exact=True).first.wait_for()
        unpublished_timeline_response = page.request.get(
            f"{BASE_URL}/public/v1/timeline"
        )
        unpublished_timeline = assert_response(unpublished_timeline_response)
        assert all(item["id"] != ui_entry_id for item in unpublished_timeline["items"])
        assert unpublished_timeline_response.headers.get("etag") != published_timeline_etag

        page.get_by_role("button", name="移到回收站").click()
        page.wait_for_url(f"{BASE_URL}/")
        page.get_by_role("button", name=re.compile("回收站")).first.click()
        page.wait_for_url(f"{BASE_URL}/trash")
        page.get_by_text("浏览器验收记录", exact=True).wait_for()
        page.locator("article.trash-card", has_text="浏览器验收记录").get_by_role(
            "button", name="恢复为私人", exact=True
        ).click()
        page.get_by_text("浏览器验收记录", exact=True).wait_for(state="detached")
        assert_response(page.request.delete(f"{BASE_URL}/api/v1/entries/{ui_entry_id}"))
        assert_response(
            page.request.post(
                f"{BASE_URL}/api/v1/entries/{ui_entry_id}/purge",
                data=json.dumps({"confirmationId": ui_entry_id}),
                headers={"Content-Type": "application/json"},
            )
        )

        page.keyboard.press("Control+K")
        command = page.get_by_role("dialog", name="全局搜索与导航")
        command.wait_for()
        command.get_by_role("searchbox").fill("Re:Zero")
        command.get_by_role("searchbox").press("ArrowDown")
        command.get_by_role("searchbox").press("Enter")
        command.wait_for(state="detached")

        page.goto(f"{BASE_URL}/imports")
        page.wait_for_load_state("networkidle")
        page.locator('input[type="file"]').set_input_files(
            str(ROOT / "tests" / "fixtures" / "anime-import.json")
        )
        page.get_by_role("button", name="运行 dry-run").click()
        page.get_by_role("heading", name="预览完成，尚未写入").wait_for()
        page.get_by_text(re.compile(r"源文件 3 条 = 1 新增 .* 1 重复 .* 1 错误")).wait_for()
        page.get_by_role("button", name="确认写入资料库").click()
        page.get_by_role("heading", name="资料库写入完成").wait_for()

        mobile_context = browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=1,
        )
        mobile = mobile_context.new_page()
        open_authenticated(mobile)
        mobile.get_by_role("button", name="打开导航").click()
        mobile.locator("#primary-sidebar").wait_for()
        mobile.wait_for_timeout(350)
        mobile.screenshot(
            path=str(ARTIFACTS / "mobile-navigation.png"), full_page=True
        )
        assert mobile.locator("body").evaluate(
            "(body) => body.scrollWidth <= body.clientWidth"
        )
        mobile_context.close()

        page.screenshot(path=str(ARTIFACTS / "desktop-final.png"), full_page=True)
        context.close()
        browser.close()

    ignored = (
        "Download the React DevTools",
        "favicon",
    )
    actionable = [
        message for message in console_errors if not any(item in message for item in ignored)
    ]
    if actionable:
        raise AssertionError("Browser console errors:\n" + "\n".join(actionable))

    print(
        json.dumps(
            {
                "ok": True,
                "screenshots": [
                    str(ARTIFACTS / "desktop-timeline.png"),
                    str(ARTIFACTS / "desktop-final.png"),
                    str(ARTIFACTS / "mobile-navigation.png"),
                ],
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
