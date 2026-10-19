#!/usr/bin/env python3
"""Excel kalkulyatorini js/model.js ga o'giradi.

Ishlatish:  python3 tools/xlsx2model.py tools/kalkulyator.xlsx js/model.js

Har bir katak: son, matn yoki {"f": "formula"}.
Nomlangan diapazonlar (kurs_joriy, p_shkaf_W ...) ham saqlanadi.
Kalkulyator yangilansa, shu skriptni qayta ishga tushirish kifoya.
"""
import datetime
import json
import sys

import openpyxl


def main(src, dst):
    wb = openpyxl.load_workbook(src)
    sheets = {}
    order = []
    for ws in wb:
        order.append(ws.title)
        cells = {}
        for row in ws.iter_rows():
            for c in row:
                v = c.value
                if v is None:
                    continue
                if isinstance(v, str) and v.startswith('='):
                    cells[c.coordinate] = {'f': v[1:]}
                elif isinstance(v, bool):
                    cells[c.coordinate] = v
                elif isinstance(v, (int, float)):
                    cells[c.coordinate] = v
                elif isinstance(v, (datetime.date, datetime.datetime)):
                    continue  # sana kalkulyatorda ishlatilmaydi
                else:
                    cells[c.coordinate] = str(v)
        sheets[ws.title] = cells
    names = {n: d.attr_text for n, d in wb.defined_names.items()}
    model = {'order': order, 'sheets': sheets, 'names': names}
    with open(dst, 'w', encoding='utf-8') as f:
        f.write('// Avtomatik yaratilgan: tools/xlsx2model.py. Qo\'lda tahrirlamang.\n')
        f.write('(function (g) { g.KALK_MODEL = ')
        json.dump(model, f, ensure_ascii=False, separators=(',', ':'))
        f.write('; })(typeof window !== "undefined" ? window : globalThis);\n')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
