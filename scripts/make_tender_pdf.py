"""Generate a realistic tender PDF for demonstrating document upload.

The batch pipeline's whole job is to read a real procurement document, so the
demo input should look like one: letterhead, a reference block, numbered
clauses, and a signature panel — not a text file renamed to .pdf.

The technical clauses are deliberately chosen to exercise every branch the
compliance report can show:

  * IS 3043 - 1987 and IS 1554 (Part 1):1988 are cited at editions the BIS
    catalogue has since superseded, so the "outdated references" table has real
    content rather than being empty.
  * IS 694 and IS 1554 sit under product-certification schemes, so the
    certification panel fires.
  * The commercial clauses in Section IV are ordinary contract boilerplate with
    no standard behind them, so the engine has something it SHOULD abstain on.
    A demo where every requirement matches proves nothing about the abstention.

    python scripts/make_tender_pdf.py
"""
from __future__ import annotations
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "seed" / "sample_tender.pdf"
PUBLIC = ROOT / "frontend" / "public" / "sample_tender.pdf"

PAGE_W, PAGE_H = 595, 842          # A4 in points
L, R = 62, PAGE_W - 62             # left / right text edges
TOP, BOTTOM = 74, PAGE_H - 62

INK = (0.09, 0.13, 0.20)
MUTED = (0.42, 0.48, 0.57)
RULE = (0.80, 0.84, 0.89)
NAVY = (0.055, 0.11, 0.22)

TITLE = ("SUPPLY, INSTALLATION, TESTING AND COMMISSIONING OF INTERNAL "
         "ELECTRIFICATION WORKS FOR THE ADMINISTRATIVE BLOCK")

REF_ROWS = [
    ("Tender Reference", "EE/ELECT/2026-27/114"),
    ("Issuing Authority", "Office of the Executive Engineer (Electrical Division)"),
    ("Mode of Tendering", "Open e-Tender, two-bid system"),
    ("Estimated Cost", "Rs 1,42,50,000 (Rupees One Crore Forty Two Lakh Fifty Thousand)"),
    ("Earnest Money Deposit", "Rs 2,00,000"),
    ("Bid Submission Closes", "24 September 2026, 15:00 hrs"),
    ("Technical Bid Opening", "25 September 2026, 11:00 hrs"),
]

# (kind, text) — 'h1' section, 'h2' sub-heading, 'p' clause, 'note' small print
BODY: list[tuple[str, str]] = [
    ("h1", "SECTION III - TECHNICAL SPECIFICATIONS"),
    ("note", "The following specifications are mandatory. Any deviation shall be "
             "explicitly listed in the deviation schedule of the technical bid."),

    ("h2", "3.1  GENERAL REQUIREMENTS"),
    ("p", "3.1.1  All electrical wiring installation work shall be carried out in "
          "accordance with the Code of Practice for Electrical Wiring Installations, "
          "IS 732, and the relevant statutory rules in force."),
    ("p", "3.1.2  The entire installation shall be earthed in accordance with the "
          "Code of Practice for Earthing, IS 3043 - 1987."),
    ("p", "3.1.3  Workmanship shall conform to the best modern practice. The "
          "contractor shall employ only licensed electricians for all terminations "
          "and jointing work."),

    ("h2", "3.2  CABLES AND CONDUCTORS"),
    ("p", "3.2.1  All internal wiring shall be carried out using PVC insulated "
          "copper conductor cables of 1100 V grade conforming to IS 694."),
    ("p", "3.2.2  Heavy duty PVC insulated armoured cables for sub-mains "
          "distribution shall conform to IS 1554 (Part 1):1988 for working voltages "
          "up to and including 1100 V."),
    ("p", "3.2.3  Cross-linked polyethylene insulated cables, where specified for "
          "outdoor feeder runs, shall conform to IS 7098 (Part 1)."),
    ("p", "3.2.4  The minimum cross sectional area of any conductor used for light "
          "points shall not be less than 1.5 sq mm copper."),

    ("h2", "3.3  CONDUITS AND ACCESSORIES"),
    ("p", "3.3.1  Rigid non-metallic conduits used for surface, recessed and "
          "concealed conduit wiring shall conform to IS 9537 (Part 3)."),
    ("p", "3.3.2  Fittings and accessories for rigid steel conduits shall conform "
          "to IS 3419."),

    ("h2", "3.4  SWITCHES, SOCKET OUTLETS AND PROTECTION"),
    ("p", "3.4.1  All switches for domestic and similar purposes shall conform to "
          "IS 3854."),
    ("p", "3.4.2  Plugs and socket outlets of rated voltage up to and including "
          "250 V shall conform to IS 1293."),
    ("p", "3.4.3  Low voltage switchgear and controlgear assemblies (distribution "
          "boards) shall be factory built assemblies conforming to IS 8623 (Part 1)."),
    ("p", "3.4.4  Miniature circuit breakers shall provide overcurrent protection "
          "appropriate to the connected load and the conductor size."),

    ("h2", "3.5  LIGHTING"),
    ("p", "3.5.1  All luminaires shall be LED type. Self-ballasted LED lamps for "
          "general lighting services shall conform to IS 16102 (Part 1)."),
    ("p", "3.5.2  LED luminaires shall carry valid BIS registration under the "
          "applicable compulsory registration requirements."),
    ("p", "3.5.3  Illumination levels for office areas shall comply with the "
          "national lighting code requirements for interior illumination."),

    ("h2", "3.6  TESTING AND COMMISSIONING"),
    ("p", "3.6.1  Insulation resistance of the completed installation shall be "
          "measured and recorded before energisation."),
    ("p", "3.6.2  Earth resistance of each earth electrode shall be measured and "
          "shall not exceed the value stipulated in the relevant Indian Standard."),
    ("p", "3.6.3  All high voltage switchboards shall be tested for dielectric "
          "strength in the manner recommended in the applicable Indian Standard."),

    ("h1", "SECTION IV - COMMERCIAL TERMS"),
    ("p", "4.1  Earnest Money Deposit of Rs 2,00,000 shall accompany the bid in the "
          "form of a demand draft drawn in favour of the Executive Engineer."),
    ("p", "4.2  Payment shall be released within 45 days of certified completion of "
          "each milestone as defined in the payment schedule."),
    ("p", "4.3  The defect liability period shall be 12 months from the date of "
          "handing over. Any dispute shall be referred to arbitration under the "
          "Arbitration and Conciliation Act, 1996."),
    ("p", "4.4  Bidders must have completed at least two similar works of value not "
          "less than Rs 50,00,000 each in the last five years."),
    ("p", "4.5  The successful bidder shall furnish a performance security equal to "
          "5 percent of the accepted contract value."),
]

STYLE = {                       # font, size, leading, space-before, colour
    "h1":   ("hebo", 11.5, 16, 20, NAVY),
    "h2":   ("hebo", 10,   14, 15, INK),
    "p":    ("helv",   9.5, 13.6, 7, INK),
    "note": ("heit",  8.8, 12.5, 6, MUTED),
}


class Doc:
    """Minimal flowing-text layout: wrap, paginate, and stamp page furniture."""

    def __init__(self):
        self.doc = pymupdf.open()
        self.page = None
        self.y = 0
        self.n = 0
        self._new_page()

    def _new_page(self):
        self.page = self.doc.new_page(width=PAGE_W, height=PAGE_H)
        self.n += 1
        self.y = TOP
        if self.n > 1:
            self.page.draw_line((L, TOP - 22), (R, TOP - 22), color=RULE, width=0.6)
            self.page.insert_text((L, TOP - 28), "Tender EE/ELECT/2026-27/114",
                                  fontname="helv", fontsize=7.5, color=MUTED)
            self.page.insert_text((R - 150, TOP - 28), "Section III - Technical Specifications",
                                  fontname="helv", fontsize=7.5, color=MUTED)

    def _footer(self, page, idx, total):
        page.draw_line((L, BOTTOM + 16), (R, BOTTOM + 16), color=RULE, width=0.6)
        page.insert_text((L, BOTTOM + 30), "Office of the Executive Engineer (Electrical Division)",
                         fontname="helv", fontsize=7.5, color=MUTED)
        label = f"Page {idx} of {total}"
        w = pymupdf.get_text_length(label, fontname="helv", fontsize=7.5)
        page.insert_text((R - w, BOTTOM + 30), label, fontname="helv", fontsize=7.5, color=MUTED)

    def space(self, h):
        if self.y + h > BOTTOM:
            self._new_page()
        else:
            self.y += h

    def line(self, text, font, size, colour, x=L, leading=13):
        if self.y + leading > BOTTOM:
            self._new_page()
        self.page.insert_text((x, self.y), text, fontname=font, fontsize=size, color=colour)
        self.y += leading

    def wrapped(self, text, font, size, colour, leading, x=L, width=None):
        """Greedy wrap. Continuation lines hang to the clause number's indent, so
        '3.2.2' stays visually attached to its own paragraph."""
        width = width or (R - x)
        indent = 0
        head = text.split("  ", 1)
        if len(head) == 2 and head[0][:1].isdigit():
            indent = pymupdf.get_text_length(head[0] + "  ", fontname=font, fontsize=size)
        words, line, first = text.split(), "", True
        for w in words:
            trial = (line + " " + w).strip()
            avail = width - (0 if first else indent)
            if pymupdf.get_text_length(trial, fontname=font, fontsize=size) > avail and line:
                self.line(line, font, size, colour, x=x + (0 if first else indent), leading=leading)
                line, first = w, False
            else:
                line = trial
        if line:
            self.line(line, font, size, colour, x=x + (0 if first else indent), leading=leading)

    def finish(self, path: Path):
        total = self.doc.page_count
        for i, pg in enumerate(self.doc, 1):
            self._footer(pg, i, total)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.doc.save(str(path), garbage=4, deflate=True)
        return total


def build() -> int:
    d = Doc()
    pg = d.page

    # --- letterhead ---
    pg.draw_rect(pymupdf.Rect(L, TOP - 12, R, TOP + 52), color=None, fill=NAVY)
    pg.insert_text((L + 16, TOP + 10), "GOVERNMENT OF INDIA",
                   fontname="hebo", fontsize=9, color=(1, 1, 1))
    pg.insert_text((L + 16, TOP + 26), "Public Works Department  -  Electrical Division",
                   fontname="helv", fontsize=8.5, color=(0.75, 0.82, 0.92))
    pg.insert_text((L + 16, TOP + 42), "NOTICE INVITING TENDER",
                   fontname="hebo", fontsize=8.5, color=(0.60, 0.76, 0.98))
    d.y = TOP + 78

    d.wrapped(TITLE, "hebo", 13, INK, 18)
    d.space(10)

    # --- reference table ---
    row_h = 17
    top = d.y
    for i, (k, v) in enumerate(REF_ROWS):
        y = top + i * row_h
        if i % 2 == 0:
            d.page.draw_rect(pymupdf.Rect(L, y - 11, R, y + 5), color=None,
                             fill=(0.965, 0.973, 0.984))
        d.page.insert_text((L + 8, y), k, fontname="hebo", fontsize=8.2, color=MUTED)
        d.page.insert_text((L + 168, y), v, fontname="helv", fontsize=8.6, color=INK)
    d.y = top + len(REF_ROWS) * row_h
    d.page.draw_rect(pymupdf.Rect(L, top - 11, R, d.y - 12), color=RULE, width=0.7)
    d.space(16)

    for kind, text in BODY:
        font, size, leading, before, colour = STYLE[kind]
        d.space(before)
        if kind == "h1":
            if d.y + 40 > BOTTOM:
                d._new_page()
            d.page.draw_line((L, d.y - 12), (R, d.y - 12), color=NAVY, width=1.1)
            d.space(4)
        d.wrapped(text, font, size, colour, leading)

    # --- signature panel ---
    d.space(26)
    if d.y + 90 > BOTTOM:
        d._new_page()
    d.line("DECLARATION BY THE BIDDER", "hebo", 9.5, INK, leading=16)
    d.wrapped("I/We have read and understood the technical specifications above and "
              "agree to supply materials conforming in every respect to the Indian "
              "Standards cited herein, at their latest editions current on the date "
              "of supply.", "helv", 9, INK, 13)
    d.space(30)
    y = d.y
    for x, label in ((L, "Signature of Bidder"), (L + 250, "Date and Seal")):
        d.page.draw_line((x, y), (x + 190, y), color=(0.55, 0.60, 0.68), width=0.7)
        d.page.insert_text((x, y + 12), label, fontname="helv", fontsize=8, color=MUTED)

    pages = d.finish(OUT)
    PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC.write_bytes(OUT.read_bytes())
    print(f"wrote {OUT}  ({pages} pages, {OUT.stat().st_size // 1024} KB)")
    print(f"wrote {PUBLIC}")
    return 0


if __name__ == "__main__":
    sys.exit(build())
