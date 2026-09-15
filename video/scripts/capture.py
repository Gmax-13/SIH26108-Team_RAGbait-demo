"""Capture real ManakSetu dashboard states for the promo video.

Drives the running dashboard (Vite on 5173, API on 8000) with Playwright and
writes, for each state:

  public/screenshots/<state>.png         the whole `.main` column at 2x
  public/screenshots/sidebar-<nav>.png   the fixed sidebar at 2x
  src/captured/layout.json               sizes + element rects (CSS px, relative
                                         to `.main`) so the video's cursor and
                                         camera land on real UI elements

Run from the repo root with the backend venv:

    .venv\\Scripts\\python.exe video\\scripts\\capture.py
"""

import json
import shutil
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "screenshots"
LAYOUT_OUT = ROOT / "src" / "captured" / "layout.json"
VIEWPORT = {"width": 1600, "height": 1000}
STAGE_STILLS = 4

EARTHING = "Earthing and equipotential bonding"
VAGUE = "good quality durable product"

layout = {"viewport": VIEWPORT, "scale": 2, "states": {}, "sidebars": {}}


def log(msg):
    print(f"[capture] {msg}", flush=True)


def box_of(locator):
    b = locator.bounding_box()
    return [round(b["x"]), round(b["y"]), round(b["width"]), round(b["height"])] if b else None


def rects(page, targets):
    """Rects of `targets` ({key: selector | (selector, index)}) relative to `.main`.

    Resolved through Playwright locators rather than querySelectorAll, so
    selectors may use Playwright's `:has-text()`.
    """
    mx, my, _, _ = box_of(page.locator(".main"))
    out = {}
    for key, spec in targets.items():
        sel, idx = spec if isinstance(spec, tuple) else (spec, 0)
        loc = page.locator(sel)
        if loc.count() <= idx:
            continue
        b = box_of(loc.nth(idx))
        if b:
            out[key] = [b[0] - mx, b[1] - my, b[2], b[3]]
    return out


def settle(page, ms=1800):
    # Entrance animations (riseIn, CountUp, abstainPulse) all finish inside ~1.7s.
    page.wait_for_timeout(ms)


def shoot(page, state, targets=None, extra=None):
    settle(page)
    page.evaluate("window.scrollTo(0, 0)")
    page.locator(".main").screenshot(path=str(OUT / f"{state}.png"), animations="disabled")
    box = page.evaluate(
        """() => {
          const m = document.querySelector('.main');
          const t = document.querySelector('.topbar').getBoundingClientRect();
          return { w: Math.round(m.getBoundingClientRect().width), h: Math.round(m.scrollHeight), topbarH: Math.round(t.height) };
        }"""
    )
    entry = {**box, "rects": rects(page, targets or {})}
    missing = sorted(set(targets or {}) - set(entry["rects"]))
    if missing:
        log(f"{state}: WARNING no element for {missing}")
    if extra:
        entry.update(extra)
    layout["states"][state] = entry
    log(f"{state}: {box['w']}x{box['h']} rects={list(entry['rects'])}")


def shoot_sidebar(page, nav):
    page.locator(".sidebar").screenshot(path=str(OUT / f"sidebar-{nav}.png"), animations="disabled")
    s = box_of(page.locator(".sidebar"))
    items = page.locator(".nav-item")
    layout["sidebars"][nav] = {
        "w": s[2],
        "h": s[3],
        "nav": [box_of(items.nth(i)) for i in range(items.count())],
        "foot": box_of(page.locator(".sidebar-foot")),
    }


def busy(page, label):
    return page.locator(f"button.primary.lg:has-text('{label}')").count() > 0


def wait_idle(page, label, timeout_s):
    """Wait for the primary button to leave its busy label."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if not busy(page, label):
            return
        page.wait_for_timeout(500)
    raise TimeoutError(f"still '{label}' after {timeout_s}s")


def capture_stage_stills(page):
    """Grab `.main` continuously while the pipeline streams, keep STAGE_STILLS evenly spaced."""
    live = []
    page.wait_for_timeout(600)
    t0 = time.time()
    while busy(page, "Analysing") and time.time() - t0 < 600:
        path = OUT / f"_live-{len(live)}.png"
        page.locator(".main").screenshot(path=str(path), animations="disabled")
        live.append(path)
        page.wait_for_timeout(700)
    wait_idle(page, "Analysing", 30)
    if not live:
        sys.exit("the earthing query finished before any pipeline still was taken — rerun capture")

    for old in OUT.glob("match-stage-*.png"):
        old.unlink()
    n = min(STAGE_STILLS, len(live))
    picks = [live[round(i * (len(live) - 1) / max(1, n - 1))] for i in range(n)]
    for i, src in enumerate(picks, 1):
        shutil.copyfile(src, OUT / f"match-stage-{i}.png")
    for path in live:
        path.unlink()
    log(f"match stage stills: {n} of {len(live)} taken")
    return n


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    LAYOUT_OUT.parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        # The installed Chrome, not Playwright's bundled build: the pip package's
        # expected headless-shell revision isn't downloaded on this machine.
        browser = p.chromium.launch(channel="chrome")
        page = browser.new_page(viewport=VIEWPORT, device_scale_factor=2)

        health = page.request.get("http://127.0.0.1:8000/api/health").json()
        layout["corpus"] = health.get("corpus", {})

        page.goto(BASE)
        page.wait_for_selector(".sb-stat b")
        settle(page, 2500)  # sidebar CountUp

        query_targets = {
            "textarea": "textarea#req",
            "find": "button.primary.lg",
            "pill-earthing": ("button.pill", 1),
            "tab-text": (".seg button", 0),
            "tab-doc": (".seg button", 1),
        }
        shoot_sidebar(page, "query")
        shoot(page, "query-empty", query_targets)

        # --- match: click the earthing example, grab the pipeline as it streams ---
        page.locator("button.pill", has_text=EARTHING).click()
        page.wait_for_selector("button.primary.lg:has-text('Analysing')")
        stills = capture_stage_stills(page)

        status = page.locator(".statusbar").first
        if "abstain" in (status.get_attribute("class") or ""):
            sys.exit("earthing query abstained — rerun capture (the story needs a recommendation)")
        shoot(page, "match-result", {
            "map": ".panel.sysmap",
            "statusbar": ".statusbar",
            "answer": ".answer",
            "answer-no": ".answer-no",
            "clause": ".panel.clause",
            "show-evidence": (".panel.clause button.ghost", 0),
        }, {
            "stageStills": stills,
            "ruleBasedBadge": page.locator(".statusbar .badge.warn").count() > 0,
            "isNumber": page.locator(".answer-no").inner_text(),
        })

        page.locator(".panel.clause button.ghost").first.click()
        page.wait_for_selector(".cite")
        shoot(page, "match-evidence", {
            "evidence-toggle": ".panel.evidence-toggle",
            "citation-trail": (".panel:has(.cite)", 0),
            "cite-0": (".cite", 0),
            "cite-1": (".cite", 1),
            "excerpt-0": (".cite .excerpt", 0),
        })

        # --- refusal: type the vague requirement ---
        page.goto(BASE)
        page.wait_for_selector("textarea#req")
        page.fill("textarea#req", VAGUE)
        shoot(page, "refusal-typed", query_targets)
        page.locator("button.primary.lg").click()
        page.wait_for_selector("button.primary.lg:has-text('Analysing')")
        wait_idle(page, "Analysing", 600)
        if page.locator(".statusbar.abstain").count() == 0:
            sys.exit("vague query did not abstain — the refusal scene cannot be built")
        shoot(page, "refusal-result", {
            "statusbar": ".statusbar.abstain",
            "reasons": (".panel:has(h2:has-text('Why it abstained'))", 0),
            "textarea": "textarea#req",
        })

        # --- tender: document upload → sample → report ---
        page.goto(BASE)
        page.locator(".seg button", has_text="Document Upload").click()
        page.wait_for_selector(".dropzone")
        doc_targets = {
            "dropzone": ".dropzone",
            "load-sample": ("button.ghost:has-text('Load sample tender')", 0),
            "generate": "button.primary.lg",
            "textarea": ".card textarea",
            "tab-doc": (".seg button", 1),
        }
        shoot(page, "upload-tab", doc_targets)
        page.locator("button.ghost", has_text="Load sample tender").click()
        page.wait_for_function("document.querySelector('.card textarea').value.length > 20")
        shoot(page, "tender-loaded", doc_targets)
        page.locator("button.primary.lg", has_text="Generate Compliance Report").click()
        page.wait_for_selector(".tiles", timeout=20 * 60 * 1000)
        outdated = page.locator(".panel:has(h2:has-text('Outdated')) tbody tr")
        rows = [outdated.nth(i).inner_text() for i in range(outdated.count())]
        shoot_sidebar(page, "reports")
        shoot(page, "tender-report", {
            "tiles": ".tiles",
            "tile-outdated": (".tile", 2),
            "outdated-panel": (".panel:has(h2:has-text('Outdated'))", 0),
            "outdated-row-0": (".panel:has(h2:has-text('Outdated')) tbody tr", 0),
            "requirements": (".panel:has(h2:has-text('Requirement-by-requirement'))", 0),
        }, {"outdatedRows": rows})

        # --- graph ---
        page.locator(".nav-item", has_text="Standards Graph").click()
        page.wait_for_selector(".graphwrap canvas")
        page.wait_for_selector(".graph-loading", state="detached", timeout=120000)
        page.wait_for_timeout(9000)  # let the force layout cool
        shoot_sidebar(page, "graph")
        shoot(page, "graph", {"graph": ".graphwrap", "filters": ".edge-filter"})

        browser.close()

    LAYOUT_OUT.write_text(json.dumps(layout, indent=2), encoding="utf-8")
    log(f"wrote {LAYOUT_OUT}")


if __name__ == "__main__":
    main()
