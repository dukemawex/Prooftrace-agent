"""Standalone browser checks against the explicit test-only API; not a pytest test.

Install Playwright separately for this optional check. See README for commands.
"""
import json
import os

from playwright.sync_api import expect, sync_playwright


def main():
    with sync_playwright() as playwright:
        executable = os.getenv("CHROMIUM_PATH")
        browser = playwright.chromium.launch(executable_path=executable, args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(os.getenv("UI_TEST_URL", "http://127.0.0.1:3001"), wait_until="networkidle")
        expect(page.locator(".wire-card")).to_have_count(3)
        page.locator(".wire-card").filter(has_text="TXN-9003").click()
        page.get_by_role("button", name="Run investigation").click()
        expect(page.get_by_text("Escalate for review", exact=True)).to_be_visible(timeout=30_000)
        expect(page.get_by_text("Injection detected. Memo quarantined.", exact=True)).to_be_visible()
        citation = page.get_by_role("button", name="[CITE: icij_kyc_entities.KYC-ALBA]", exact=True)
        citation.click()
        expect(page.locator(".selected-evidence")).to_contain_text("Alba Trade")
        expect(page.locator("#evidence-row")).to_have_value("icij_kyc_entities.KYC-ALBA")
        page.locator("summary").filter(has_text="cross silo sanctions check").click()
        expect(page.locator("pre.sql").filter(has_text="JOIN opensanctions_watchlist")).to_be_visible()
        with page.expect_download() as download:
            page.get_by_role("button", name="Export investigation evidence").click()
        artifact = json.loads(open(download.value.path()).read())
        assert artifact["verdict"] == "ESCALATED" and artifact["citations_verified"]
        assert artifact["guard"]["injection_detected"]
        page.locator(".wire-card").filter(has_text="TXN-9001").click()
        page.get_by_role("button", name="Run investigation").click()
        expect(page.get_by_text("Clear with proof", exact=True)).to_be_visible(timeout=30_000)
        page.set_viewport_size({"width": 390, "height": 844})
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        page.locator(".wire-card").filter(has_text="TXN-9002").click()
        page.get_by_role("button", name="Run investigation").click()
        expect(page.get_by_text("Escalate for review", exact=True)).to_be_visible(timeout=30_000)
        assert not errors, errors
        browser.close()
        print("Browser smoke passed: three verdicts, memo guard, live SSE, SQL rows, citations, export, mobile layout; test-only provider.")


if __name__ == "__main__":
    main()
