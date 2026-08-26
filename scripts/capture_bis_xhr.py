"""Drive the BIS 'Know Your Standards' page and record the exact XHR the
DataTable fires, so we can decide between direct-HTTP and browser scraping."""
import asyncio, json
from playwright.async_api import async_playwright

URL = "https://www.services.bis.gov.in/php/BIS_2.0/bisconnect/knowyourstandards/Indian_standards/isdetails/"
captured = []

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, channel="chrome")
        ctx = await b.new_context(viewport={"width":1440,"height":900})
        pg = await ctx.new_page()

        async def on_resp(resp):
            u = resp.url
            if any(k in u for k in ("searchIS", "Elasticsearch", "aspect")):
                rec = {"url": u, "status": resp.status, "method": resp.request.method,
                       "post_data": resp.request.post_data}
                try:
                    body = await resp.text()
                    rec["body_prefix"] = body[:600]
                    rec["body_len"] = len(body)
                except Exception as e:
                    rec["body_err"] = str(e)
                captured.append(rec)
                print(f"[XHR] {resp.status} {resp.request.method} {u[:110]}")

        pg.on("response", on_resp)
        await pg.goto(URL, wait_until="domcontentloaded", timeout=90000)
        await pg.wait_for_timeout(4000)

        # pick "By Keyword" then search a term guaranteed to hit electrical standards
        try:
            await pg.check("#inlineRadio2"); print("checked By Keyword")
        except Exception as e: print("radio:", e)
        await pg.fill("#txt_search", "cable")
        await pg.wait_for_timeout(1500)
        try:
            await pg.click("#form-horizontal button[type=submit], #form-horizontal input[type=submit]", timeout=8000)
        except Exception:
            await pg.keyboard.press("Enter")
        await pg.wait_for_timeout(9000)

        html = await pg.content()
        open("data/raw/bis_after_search.html","w",encoding="utf-8").write(html)
        rows = await pg.eval_on_selector_all(
            "#searchResultIS tbody tr",
            "els => els.slice(0,5).map(e => Array.from(e.querySelectorAll('td')).map(t=>t.innerText.trim()))")
        print("\nTABLE ROWS captured:", len(rows))
        for r in rows[:4]: print("  ", r[:6])
        json.dump(captured, open("data/raw/bis_xhr.json","w"), indent=1)
        await b.close()

asyncio.run(main())
