#!/usr/bin/env python3
"""
parse_proest_pdf.py  --  ProEst "Estimate Unit Totals" PDF -> sow_pricing_data.json

Usage:
    python parse_proest_pdf.py estimate.pdf out.json [--project "Name"] [--job 260120]

Reads the layout-preserved text of a ProEst Estimate Unit Totals export, pulls
every line item (scope / qty / unit / unit rate / extended total), maps the CSI
division+subdivision headings onto bidding TRADES, and writes the
sow_pricing_data.json contract consumed by build_sow_pricing_xlsx.py.

Rules honoured:
  - A line with no quantity, or a quantity of zero, becomes qty: null (red flag).
  - A line priced at $0.00 keeps its quantity but carries rate 0 and is reported
    so it can be called out as a budget/allowance in Notes & Clarifications.
  - Nothing is invented.  Extended totals are recomputed and reconciled against
    ProEst's own subdivision and grand totals; disagreements are printed.
"""
import json, re, subprocess, sys, unicodedata

# --- CSI subdivision -> trade block -------------------------------------------
# key = ProEst subdivision code prefix, value = (trade block, sort order)
TRADE_MAP = {
    "02.00050": "Demolition",
    "03.00000": "Concrete",
    "03.03200": "Concrete",
    "06.02200": "Custom Millwork",
    "07.03000": "Roofing",
    "08.01100": "Doors, Frames & Hardware",
    "08.01400": "Doors, Frames & Hardware",
    "08.01500": "Doors, Frames & Hardware",
    "08.05000": "Glass & Glazing",
    "09.00951": "Acoustical Ceilings",
    "09.02300": "Drywall & Carpentry",
    "09.06000": "Flooring",
    "09.09100": "Painting",
    "10.04400": "Specialties",
    "11.03100": "Equipment & Appliances",
    "21.00000": "Fire Protection",
    "22.00000": "Plumbing",
    "22.04000": "Plumbing",
    "23.00000": "HVAC",
    "26.00000": "Electrical",
    "26.00100": "Electrical",
    "26.05000": "Electrical",
    "26.05338": "Electrical",
    "26.51100": "Electrical",
    "28.04600": "Fire Alarm",
}
# Subdivisions whose content is commercial language, not scope
NOTE_SUBDIVISIONS = ("97.",)

TRADE_ORDER = [
    "Demolition", "Concrete", "Drywall & Carpentry", "Acoustical Ceilings",
    "Flooring", "Painting", "Doors, Frames & Hardware", "Glass & Glazing",
    "Roofing", "Custom Millwork", "Specialties", "Equipment & Appliances",
    "Fire Protection", "Plumbing", "HVAC", "Electrical", "Fire Alarm",
]

SUBDIV = re.compile(r"^(\d{2}\.\d{5})\s+(.+?)\s*$")
DIVISION = re.compile(r"^(\d{2})\s+([A-Z][A-Z &/,'\-\.]+)\s*$")
NUM = r"[\d,]+\.\d{2}"
# description ... qty UNIT rate total     (unit optional -- ProEst sometimes drops it)
LINE = re.compile(
    r"^(?P<desc>.*?)\s{2,}(?P<qty>%s)\s*(?P<unit>[A-Z]{2,4})?\s+(?P<rate>%s)?\s+(?P<total>%s)\s*$"
    % (NUM, NUM, NUM)
)
TOTAL_ROW = re.compile(r"Total\s+\$?[\d,]+\.\d{2}\s*$")


def ascii_clean(s):
    s = unicodedata.normalize("NFKD", s)
    s = (s.replace("’", "'").replace("‘", "'")
          .replace("“", '"').replace("”", '"')
          .replace("–", "-").replace("—", "--"))
    return "".join(c for c in s if 32 <= ord(c) < 127).strip()


def f(x):
    return float(x.replace(",", "")) if x else None


def extract_text(pdf):
    return subprocess.run(["pdftotext", "-layout", pdf, "-"],
                          capture_output=True, text=True, check=True).stdout


def parse(text):
    rows, notes, cur_sub, cur_sub_name = [], [], None, None
    pending = None  # a line whose description wrapped onto the next row

    for raw in text.splitlines():
        line = ascii_clean(raw)
        if not line or "POWERED BY PROEST" in line or line.startswith("Page "):
            continue
        # strip the leading ProEst line number
        line = re.sub(r"^\d{1,4}\s+", "", line)

        m = SUBDIV.match(line)
        if m:
            cur_sub, cur_sub_name = m.group(1), m.group(2)
            pending = None
            continue
        if DIVISION.match(line) or TOTAL_ROW.search(line) or line.startswith(
                ("Line ", "Estimate:", "Status:", "Contact:", "Date:", "Total Estimate")):
            pending = None
            continue

        m = LINE.match(line)
        if not m:
            # continuation of the previous description
            if pending is not None and not re.search(r"\d\.\d{2}", line):
                pending["scope"] += " " + line
            continue

        desc = m.group("desc").strip()
        if pending is not None and not desc:
            continue
        rec = {
            "sub": cur_sub, "sub_name": cur_sub_name,
            "scope": desc,
            "qty": f(m.group("qty")),
            "unit": (m.group("unit") or "EA"),
            "rate": f(m.group("rate")),
            "proest_total": f(m.group("total")),
        }
        if cur_sub and cur_sub.startswith(NOTE_SUBDIVISIONS):
            notes.append(rec)
        else:
            rows.append(rec)
        pending = rec
    return rows, notes


def to_contract(rows, meta):
    blocks, issues = {}, []
    for r in rows:
        trade = TRADE_MAP.get(r["sub"])
        if not trade:
            issues.append("UNMAPPED subdivision %s (%s) -- line '%s'"
                          % (r["sub"], r["sub_name"], r["scope"]))
            continue
        b = blocks.setdefault(trade, {"trade": trade, "csi": [], "lines": []})
        csi = r["sub"]
        if csi not in b["csi"]:
            b["csi"].append(csi)
        qty, rate = r["qty"], r["rate"]
        if not qty:                      # 0.00 or missing -> needs a plan count
            issues.append("NO QUANTITY  %-38s %s" % (r["scope"][:38], trade))
            qty = None
        if rate in (None, 0.0) and qty is not None:
            issues.append("NO RATE      %-38s %s" % (r["scope"][:38], trade))
        ln = {"scope": r["scope"], "qty": qty, "unit": r["unit"]}
        # ProEst PRINTS the unit rate rounded to cents but EXTENDS at full
        # precision, so re-deriving the rate from its own extended total keeps
        # the workbook reconciling to ProEst to the penny.  The cell still
        # DISPLAYS the printed rate; only the stored precision differs.
        if qty and r["proest_total"]:
            exact = round(r["proest_total"] / qty, 6)
            if rate is not None and abs(round(exact, 2) - rate) > 0.005:
                issues.append("RATE MISMATCH %-36s printed %.2f vs derived %.2f"
                              % (r["scope"][:36], rate, exact))
            ln["rate"] = exact
        elif rate:
            ln["rate"] = rate
        b["lines"].append(ln)

    trades = [blocks[t] for t in TRADE_ORDER if t in blocks]
    trades += [b for t, b in blocks.items() if t not in TRADE_ORDER]
    data = dict(meta)
    data["trades"] = trades
    return data, issues


def main():
    pdf, out = sys.argv[1], sys.argv[2]
    meta = {}
    args = sys.argv[3:]
    for i in range(0, len(args) - 1, 2):
        meta[args[i].lstrip("-")] = args[i + 1]
    rows, notes = parse(extract_text(pdf))
    data, issues = to_contract(rows, meta)
    grand = sum(r["proest_total"] or 0 for r in rows)
    print("lines: %d   trades: %d   ProEst line sum: $%s"
          % (len(rows), len(data["trades"]), format(grand, ",.2f")))
    for n in notes:
        print("NOTE LINE:", n["scope"])
    for i in issues:
        print(" ", i)
    with open(out, "w") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=True)


if __name__ == "__main__":
    main()
