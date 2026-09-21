#!/usr/bin/env python3
"""
finalize_workbook.py  --  cache formula results so every viewer shows the money.

openpyxl writes formulas with NO cached result.  Excel recalculates on open, but
the Claude file preview, macOS Quick Look, most mobile viewers and anything that
reads the file without a calculation engine show those cells BLANK -- which reads
as "the totals column is missing".

This runs the workbook through LibreOffice, which recalculates and stores a cached
<v> next to every <f>, then repairs the two things LibreOffice drops on the way:
the outline summary side and the print-title rows.

    python finalize_workbook.py in.xlsx out.xlsx
"""
import re, shutil, subprocess, sys, tempfile, zipfile, os


def recalc(src, workdir):
    subprocess.run(["soffice", "--headless", "--convert-to",
                    "xlsx:Calc MS Excel 2007 XML", src, "--outdir", workdir],
                   check=True, capture_output=True)
    return os.path.join(workdir, os.path.basename(src))


def patch_sheet_xml(xml):
    # LibreOffice drops <outlinePr summaryRight="0"/>, which moves the collapse
    # button for the sub-bid columns to the wrong side of the group.
    if "outlinePr" not in xml:
        xml = re.sub(r"(<sheetPr[^>]*>)",
                     r'\1<outlinePr summaryBelow="1" summaryRight="0"/>', xml, count=1)
        xml = re.sub(r"<sheetPr([^>]*)/>",
                     r'<sheetPr\1><outlinePr summaryBelow="1" summaryRight="0"/></sheetPr>',
                     xml, count=1)
    return xml


def main():
    src, dst = sys.argv[1], sys.argv[2]
    with tempfile.TemporaryDirectory() as td:
        out = recalc(src, td)
        zin = zipfile.ZipFile(out)
        with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
            for it in zin.infolist():
                data = zin.read(it.filename)
                if it.filename == "xl/worksheets/sheet1.xml":
                    data = patch_sheet_xml(data.decode("utf-8")).encode("utf-8")
                zout.writestr(it, data)
        zin.close()
    print("finalized ->", dst)


if __name__ == "__main__":
    main()
