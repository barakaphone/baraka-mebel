#!/usr/bin/env python3
"""Sinov: tasodifiy kirish qiymatlari bilan Excel faylni LibreOffice'da qayta hisoblaydi.

Ishlatish (LibreOffice'ning python3 + uno bilan):
  soffice --headless --accept="socket,host=localhost,port=2002;urp;" &
  python3 tools/lo_recalc.py tools/kalkulyator.xlsx cases.json natija.json

cases.json: [{"Sheet!A1": qiymat, ...}, ...]
natija.json: har bir holat uchun barcha formula kataklarining qiymati.
"""
import json
import sys
import time

import uno


def connect():
    local = uno.getComponentContext()
    resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
    for _ in range(60):
        try:
            return resolver.resolve('uno:socket,host=localhost,port=2002;urp;StarOffice.ComponentContext')
        except Exception:
            time.sleep(1)
    raise RuntimeError('LibreOffice ga ulanib bo\'lmadi')


def main(src, cases_path, out_path):
    import openpyxl
    wf = openpyxl.load_workbook(src)
    formula_cells = []
    for ws in wf:
        for row in ws.iter_rows():
            for c in row:
                if isinstance(c.value, str) and c.value.startswith('='):
                    formula_cells.append((ws.title, c.coordinate))
    ctx = connect()
    desktop = ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)
    url = uno.systemPathToFileUrl(__import__('os').path.abspath(src))
    from com.sun.star.beans import PropertyValue
    p = PropertyValue(); p.Name = 'Hidden'; p.Value = True
    doc = desktop.loadComponentFromURL(url, '_blank', 0, (p,))
    sheets = doc.Sheets
    cases = json.load(open(cases_path))
    results = []
    for case in cases:
        # asl qiymatlarni saqlab, keyin qaytarish uchun
        saved = []
        for key, val in case.items():
            sh, a1 = key.rsplit('!', 1)
            cell = sheets.getByName(sh).getCellRangeByName(a1)
            saved.append((cell, cell.getFormula()))
            if val is None or val == '':
                cell.setString('')
            elif isinstance(val, (int, float)) and not isinstance(val, bool):
                cell.setValue(val)
            else:
                cell.setString(str(val))
        doc.calculateAll()
        res = {}
        for sh, a1 in formula_cells:
            cell = sheets.getByName(sh).getCellRangeByName(a1)
            t = cell.getType().value
            err = cell.getError()
            if err:
                res[sh + '!' + a1] = '#ERR'
            elif cell.FormulaResultType2 == 2:  # TEXT  (com.sun.star.sheet.FormulaResult)
                res[sh + '!' + a1] = cell.getString()
            else:
                res[sh + '!' + a1] = cell.getValue()
        results.append(res)
        for cell, f in saved:
            cell.setFormula(f)
    doc.close(True)
    json.dump(results, open(out_path, 'w'), ensure_ascii=False)


if __name__ == '__main__':
    main(*sys.argv[1:4])
