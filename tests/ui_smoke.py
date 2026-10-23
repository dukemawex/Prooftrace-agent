"""Browser checks against the explicit test API, plus fully offline replay checks.

Install Playwright separately. See README for commands and screenshot options.
"""
import json
import os
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def export(page):
    with page.expect_download() as download:
        page.get_by_role("button", name="Export investigation evidence").click()
    return json.loads(Path(download.value.path()).read_text())


def no_overflow(page):
    page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Horizontal page overflow"


def screenshot(page, name):
    destination = os.getenv("UI_SCREENSHOT_DIR")
    if destination:
        Path(destination).mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(Path(destination) / f"{name}.png"), full_page=True)


def select_wire(page, txn):
    page.locator(".wire-card").filter(has_text=txn).click()


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.getenv("CHROMIUM_PATH"), args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1440, "height": 1080})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        url = os.getenv("UI_TEST_URL", "http://127.0.0.1:3001")
        page.goto(url, wait_until="networkidle")
        expect(page.locator(".wire-card")).to_have_count(3)
        screenshot(page, "desktop-standby")
        select_wire(page, "TXN-9003")
        page.get_by_role("button", name="Run investigation", exact=True).click()
        expect(page.get_by_role("heading", name="Escalate for review", exact=True)).to_be_visible(timeout=30_000)
        expect(page.get_by_text("Injection detected. Memo quarantined.", exact=True)).to_be_visible()
        screenshot(page, "desktop-live-verdict")
        if os.getenv("BROWSER_TEST_OPENROUTER_ONLY") == "1":
            expect(page.get_by_text("FREE FALLBACK ACTIVE", exact=True)).to_be_visible()
            expect(page.locator(".model-size").filter(has_text="OPENROUTER · FREE")).to_have_count(3)
        for stage in ["Memo screening", "Report and verification"]:
            page.get_by_role("button", name=re.compile(stage)).click()
        expect(page.locator(".model-routes")).to_have_count(3)
        citation = page.get_by_role("button", name="[CITE: icij_kyc_entities.KYC-ALBA]", exact=True)
        citation.click()
        expect(page.locator(".selected-evidence")).to_contain_text("Alba Trade")
        expect(page.get_by_label("Source record icij_kyc_entities.KYC-ALBA", exact=True)).to_be_focused()
        page.get_by_role("button", name="JSON", exact=True).click()
        expect(page.locator(".selected-evidence pre")).to_contain_text('"entity_name": "Alba Trade"')
        tab = page.get_by_role("tab", name="SAR draft")
        tab.focus()
        page.keyboard.press("End")
        expect(page.get_by_role("tab", name=re.compile("Evidence"))).to_have_attribute("aria-selected", "true")
        page.keyboard.press("Home")
        expect(tab).to_have_attribute("aria-selected", "true")
        page.get_by_role("button", name=re.compile("cross silo sanctions check")).click()
        expect(page.locator("pre.sql").filter(has_text="JOIN opensanctions_watchlist")).to_be_visible()
        page.get_by_role("button", name=re.compile("Returned rows")).click()
        expect(page.get_by_label("Returned database rows")).to_contain_text("TXN-9003")
        artifact = export(page)
        assert artifact["verdict"] == "ESCALATED" and artifact["citations_verified"]
        assert artifact["guard"]["injection_detected"] and not artifact.get("simulation")
        if os.getenv("BROWSER_TEST_OPENROUTER_ONLY") == "1":
            assert all(event["provider"] == "openrouter" for event in artifact["model_routes"])
        select_wire(page, "TXN-9001")
        page.get_by_role("button", name="Run investigation", exact=True).click()
        expect(page.get_by_role("heading", name="Cleared", exact=True)).to_be_visible(timeout=30_000)
        select_wire(page, "TXN-9002")
        page.get_by_role("button", name="Run investigation", exact=True).click()
        expect(page.get_by_role("heading", name="Escalate for review", exact=True)).to_be_visible(timeout=30_000)
        live_artifact = export(page)
        page.get_by_role("button", name="Demo replay").click()
        page.get_by_role("button", name="Exit replay", exact=True).click()
        restored = export(page)
        assert restored["run_id"] == live_artifact["run_id"] and not restored.get("simulation")
        for width in [1440, 1024, 768, 390, 320]:
            page.set_viewport_size({"width": width, "height": 900})
            no_overflow(page)
        screenshot(page, "mobile-live-verdict")
        page.route("**/api/investigate/*", lambda route: route.fulfill(
            status=200, content_type="text/event-stream",
            body='data: {"type":"error","message":"Test verification rejected"}\n\n'))
        page.get_by_role("button", name="Run investigation", exact=True).click()
        expect(page.get_by_role("alert").filter(has_text="Test verification rejected")).to_be_visible()
        expect(page.get_by_role("heading", name="Escalate for review")).to_have_count(0)
        page.close()

        # No working backend: demo must still work and must never make POST calls.
        page = browser.new_page(viewport={"width": 1440, "height": 1080}, reduced_motion="reduce")
        page.on("pageerror", lambda error: errors.append(str(error)))
        posts = []
        page.on("request", lambda request: posts.append(request.url) if request.method == "POST" else None)
        page.route("**/api/**", lambda route: route.fulfill(status=503, content_type="application/json", body='{"detail":"Test API offline"}'))
        page.goto(url, wait_until="networkidle")
        expect(page.get_by_role("alert").filter(has_text="Test API offline")).to_be_visible()
        expect(page.get_by_role("button", name="Run investigation", exact=True)).to_be_disabled()
        page.get_by_role("button", name="Demo replay").click()
        expect(page.get_by_text("SIMULATED DEMO", exact=True)).to_be_visible()
        page.get_by_role("button", name="Cancel replay", exact=True).click()
        expect(page.get_by_role("alert").filter(has_text="Run cancelled")).to_be_visible()
        expect(page.get_by_role("heading", name="Escalate for review")).to_have_count(0)
        page.get_by_role("button", name="Demo replay").click()
        page.get_by_role("button", name="Restart demo replay").click()
        expect(page.get_by_role("heading", name="Escalate for review", exact=True)).to_be_visible(timeout=20_000)
        expect(page.get_by_text("REPLAY COMPLETE", exact=True)).to_be_visible()
        screenshot(page, "desktop-demo-verdict")
        page.get_by_role("button", name="[CITE: icij_kyc_entities.KYC-ALBA]", exact=True).click()
        expect(page.locator(".selected-evidence")).to_contain_text("Alba Trade")
        expect(page.get_by_label("Source record icij_kyc_entities.KYC-ALBA", exact=True)).to_be_focused()
        screenshot(page, "desktop-citation-proof")
        artifact = export(page)
        assert artifact["simulation"]["enabled"] is True
        assert artifact["simulation"]["model_calls_made"] is False
        assert artifact["simulation"]["memory_persisted"] is False
        assert artifact["data_source"] == "demo-replay"
        assert artifact["memory_episodes_used"] == 0
        select_wire(page, "TXN-9001")
        page.get_by_role("button", name="Replay selected wire", exact=True).click()
        expect(page.get_by_role("heading", name="Cleared", exact=True)).to_be_visible(timeout=20_000)
        select_wire(page, "TXN-9003")
        page.get_by_role("button", name="Replay selected wire", exact=True).click()
        expect(page.get_by_role("heading", name="Escalate for review", exact=True)).to_be_visible(timeout=20_000)
        expect(page.get_by_text("Injection detected. Memo quarantined.", exact=True)).to_be_visible()
        for width in [1440, 1024, 768, 390, 320]:
            page.set_viewport_size({"width": width, "height": 900})
            no_overflow(page)
        screenshot(page, "mobile-demo-verdict")
        page.get_by_role("button", name="Replay selected wire", exact=True).click()
        page.get_by_role("button", name="Exit replay", exact=True).click()
        expect(page.get_by_text("SIMULATED DEMO", exact=True)).to_have_count(0)
        expect(page.get_by_role("alert").filter(has_text="Test API offline")).to_be_visible()
        page.wait_for_timeout(1000)
        expect(page.get_by_role("heading", name="Escalate for review")).to_have_count(0)
        assert not posts, f"Offline replay made POST requests: {posts}"
        page.unroute("**/api/**")
        page.get_by_role("button", name="Retry connection").click()
        expect(page.locator(".wire-card")).to_have_count(3)
        expect(page.get_by_role("button", name="Run investigation", exact=True)).to_be_enabled()
        assert not errors, errors
        browser.close()
        print("Browser checks passed: live SSE, three verdicts, guard, model routes, SQL/rows, citations, keyboard navigation, JSON exports, five viewport widths, and offline replay/cancel/restart/isolation. Live model calls use test-only doubles.")


if __name__ == "__main__":
    main()
