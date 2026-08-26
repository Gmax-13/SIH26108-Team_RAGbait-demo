"""Client for the BIS 'Know Your Standards' catalogue API.

Reverse-engineered contract (see docs/INGESTION.md):
    POST {BASE}searchIS?seachby=<b64>&txt_search=<b64>
    body: DataTables server-side params (draw/start/length/columns[..])
    resp: {"iTotalRecords": N, "aaData": [ {...}, ... ]}   (legacy DataTables keys)

The query params are base64-encoded — sending them in plain text returns
HTTP 500, which is what made this endpoint look unusable at first.
"""
from __future__ import annotations
import base64, http.cookiejar, json, ssl, time, urllib.error, urllib.parse, urllib.request
from typing import Any, Iterator

from backend.config import BIS_BASE, BIS_UA, BIS_DELAY_SEC, BIS_PAGE_SIZE

COLS = ["id", "is_no", "is_title", "amendments", "technical_committee",
        "aspect", "referirmatin_year", "Action", "DownloadAction"]

_b64 = lambda s: base64.b64encode(s.encode()).decode()


class BISClient:
    def __init__(self, delay: float = BIS_DELAY_SEC, verify_tls: bool = False):
        ctx = ssl.create_default_context()
        if not verify_tls:                       # BIS's chain is frequently misconfigured
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        self._cj = http.cookiejar.CookieJar()
        self._op = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=ctx),
            urllib.request.HTTPCookieProcessor(self._cj),
        )
        self.delay = delay
        self._primed = False

    def _prime(self) -> None:
        """Fetch the search page once so the PHP session cookie exists."""
        if self._primed:
            return
        req = urllib.request.Request(BIS_BASE + "isdetails/", headers={"User-Agent": BIS_UA})
        self._op.open(req, timeout=90).read()
        self._primed = True

    def _form(self, start: int, length: int) -> bytes:
        d = {"draw": "1", "start": str(start), "length": str(length),
             "search[value]": "", "search[regex]": "false"}
        for i, c in enumerate(COLS):
            d.update({f"columns[{i}][data]": c, f"columns[{i}][name]": "",
                      f"columns[{i}][searchable]": "true", f"columns[{i}][orderable]": "false",
                      f"columns[{i}][search][value]": "", f"columns[{i}][search][regex]": "false"})
        return urllib.parse.urlencode(d).encode()

    def search(self, term: str, start: int = 0, length: int = BIS_PAGE_SIZE,
               seachby: str = "keywords", retries: int = 3) -> dict[str, Any]:
        self._prime()
        url = f"{BIS_BASE}searchIS?seachby={_b64(seachby)}&txt_search={_b64(term)}"
        req = urllib.request.Request(
            url, data=self._form(start, length),
            headers={"User-Agent": BIS_UA, "X-Requested-With": "XMLHttpRequest",
                     "Referer": BIS_BASE + "isdetails/",
                     "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                     "Accept": "application/json, text/javascript, */*; q=0.01"})
        last: Exception | None = None
        for attempt in range(retries):
            try:
                raw = self._op.open(req, timeout=180).read().decode("utf-8", "ignore")
                data = json.loads(raw)
                if isinstance(data, bool):       # BIS returns bare `false` on rejected criteria
                    raise ValueError(f"endpoint rejected criteria (term={term!r})")
                return data
            except Exception as e:               # noqa: BLE001 - retry on any transport/parse fault
                last = e
                time.sleep(2 * (attempt + 1))
        raise RuntimeError(f"BIS search failed after {retries} attempts: {last}")

    def iter_all(self, term: str, page_size: int = BIS_PAGE_SIZE,
                 seachby: str = "keywords", on_page=None) -> Iterator[dict[str, Any]]:
        """Yield every catalogue row matching `term`, paging politely."""
        first = self.search(term, 0, page_size, seachby)
        total = int(first.get("iTotalRecords") or 0)
        rows = first.get("aaData", [])
        if on_page:
            on_page(term, 0, len(rows), total)
        yield from rows
        fetched = len(rows)
        while fetched < total and rows:
            time.sleep(self.delay)
            page = self.search(term, fetched, page_size, seachby)
            rows = page.get("aaData", [])
            if on_page:
                on_page(term, fetched, len(rows), total)
            yield from rows
            fetched += len(rows)
