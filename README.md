# Baraka Mebel

Mebel buyurtmalarini boshqarish tizimi: lid → narx hisobi → shartnoma → o'lchov → usta → yetkazib berish.

Sayt: `https://barakaphone.github.io/baraka-mebel/` (GitHub Pages yoqilgandan keyin).

## Rollar
| Rol | Nima qiladi |
|---|---|
| Admin | Hammasi: xodimlar, filiallar, sozlamalar, barcha buyurtmalar |
| Mebel rahbari | Buyurtmani ustaga biriktiradi, ustalarni qo'shadi, xom ashyo narxlarini belgilaydi |
| Sotuvchi | O'z filiali murojaatlari, narx hisoblash, rasmiylashtirish, PDF |
| Shartnomachi | Muddatli to'lovni tekshiradi: limit + "Shartnoma chiqarilsin" / "Bekor qilinsin" |
| O'lchovchi | Mijoz uyida o'lchaydi, rasm va o'lchamlarni biriktiradi |
| Usta | Narxni tasdiqlaydi, kesish → yig'ish → qadoqlash → yetkazildi (rasm bilan) |

## Birinchi ishga tushirish
1. **Himoya qoidalari:** Firebase konsoli → Firestore → **Rules** → `firestore.rules` matnini to'liq joylab, **Publish**.
2. **Sayt:** GitHub → Settings → Pages → Branch `main`, papka `/ (root)` → Save.
3. Saytni oching → **Tizimni sozlash** oynasi chiqadi → ism, telefon, parol (kamida 12 belgi). Siz tizim egasi bo'lasiz.
4. Admin panel → **Xodimlar** → har bir xodimga login (telefon) va parol bering.
5. **Sozlamalar** → kurs, Baraka ustamasi, xom ashyo narxlari, matras narxlari, hisob uchun usta foizini to'ldiring.

## Kalkulyator
Narx `tools/kalkulyator.xlsx` (Excel) formulalarining o'zi bilan hisoblanadi: fayl `js/model.js` ga o'giriladi,
`js/engine.js` uni Excel'dagidek bajaradi. Excel yangilansa:
```
python3 tools/xlsx2model.py tools/kalkulyator.xlsx js/model.js
```
Sozlamalarda o'zgartirilgan qiymatlar Firestore'da saqlanadi va Excel'dagi standart qiymatlar ustidan qo'llanadi.

## Sinovlar
- `tools/test-engine.js` + `tools/lo_recalc.py` — dvigatelni LibreOffice natijalari bilan solishtirish
- `tools/test-rules.mjs` — himoya qoidalari (Firebase emulyatori)
- `tools/e2e.mjs` — to'liq jarayon brauzerda (emulyator + Playwright)
