// Kalkulyator: Excel varaqlaridagi kiritish kataklari ↔ ilova shakllari.
// Hisob o'zi js/engine.js orqali Excel formulalarida bajariladi.
(function (g) {
  'use strict';
  const M = g.KALK_MODEL;
  const { Engine } = g.KalkEngine;

  const cell = (sheet, a1) => { const v = M.sheets[sheet][a1]; return v && typeof v === 'object' ? null : v; };
  const isFormula = (sheet, a1) => { const v = M.sheets[sheet][a1]; return !!(v && typeof v === 'object' && 'f' in v); };

  const HA = ['Ha', "Yo'q"];
  const LK = ['Laminat', 'Krasheniy'];

  // ---------- Spalniy garnitur (Spalniy!C5:C34) ----------
  const SP_OPTS = {
    C5: ['0', '1', '2'], C13: ['0', '1', '2'], C21: ['0', '1', '2'],
    C9: ['2', '4', '6', '8'],
    C11: LK, C12: LK, C25: LK, C26: LK, C28: LK, C29: LK, C31: LK, C32: LK,
    C18: HA, C19: ['Oddiy', 'Nasosli'],
    C20: ["Yo'q", '140x200', '160x200', '180x200', '200x200'],
  };
  const SP_MIN = { C6: 100, C7: 30, C8: 60, C14: 150, C15: 80, C16: 20, C17: 60, C22: 60, C23: 30, C24: 50 };
  const spalniyFields = [];
  for (let r = 5; r <= 34; r++) {
    const a = 'C' + r;
    spalniyFields.push({
      key: 'Spalniy!' + a, group: cell('Spalniy', 'A' + r), label: cell('Spalniy', 'B' + r),
      unit: cell('Spalniy', 'D' + r) || '', opts: SP_OPTS[a] || null, min: SP_MIN[a] ?? 0,
      def: cell('Spalniy', a),
    });
  }

  // ---------- Korpus mebel ('Korpus mebel'!C7:H23) ----------
  const KOR_COLS = ['C', 'D', 'E', 'F', 'G', 'H'];
  const KOR_OPTS = {
    7: ['Shkaf', 'Prixojka', 'Garderob', 'Boshqa'], 14: ['Oddiy', 'Kupe', 'Eshiksiz'],
    21: HA, 22: LK, 23: LK,
  };
  const korpusFields = [];
  for (let r = 7; r <= 23; r++) {
    korpusFields.push({
      row: r, label: cell('Korpus mebel', 'A' + r), unit: cell('Korpus mebel', 'B' + r) || '',
      opts: KOR_OPTS[r] || null, text: r === 8, optional: r === 13 || r === 15,
      min: [10, 11, 12].includes(r) ? 20 : r === 13 ? 1 : 0,
    });
  }

  // ---------- Oshxona (Oshxona!B5:F10) ----------
  const OSH_ROWS = [5, 6, 7, 8, 9, 10];

  function defaults() {
    const v = {};
    v['Buyurtma!B11'] = "Yo'q"; v['Buyurtma!B12'] = "Yo'q"; v['Buyurtma!B13'] = "Yo'q";
    v['Buyurtma!B16'] = 0; v['Buyurtma!B20'] = 'Naqd'; v['Buyurtma!B21'] = 0; v['Buyurtma!B22'] = '';
    for (const f of spalniyFields) v[f.key] = f.def ?? '';
    for (const r of OSH_ROWS) for (const c of ['B', 'C', 'D']) v[`Oshxona!${c}${r}`] = '';
    v._chegMode = 'pct'; v._oldMode = 'pct'; v._chegSum = ''; v._usta = '';
    for (const col of KOR_COLS) for (const f of korpusFields) {
      const k = `Korpus mebel!${col}${f.row}`;
      let d = cell('Korpus mebel', col + f.row);
      if (f.row === 8) d = '';                       // "Namuna: ..." izohlari
      if (f.row === 9) d = col === 'C' ? 1 : 0;      // faqat 1-buyum yoqiq
      v[k] = d ?? '';
    }
    return v;
  }

  // Kiritilgan qiymatni Excel turiga keltirish
  function normalize(inputs) {
    const out = {};
    for (const [k, val] of Object.entries(inputs)) {
      if (!k.includes('!')) continue; // "_usta", "_chegMode" … — ilova uchun, Excel katagi emas
      if (val === '' || val === null || val === undefined) { out[k] = ''; continue; }
      if (typeof val === 'number') { out[k] = val; continue; }
      let s = String(val).trim();
      if (/^[\d\s\u00a0.,]+$/.test(s)) s = s.replace(/[\s\u00a0]/g, ''); // "2 500 000"
      const n = Number(s.replace(',', '.'));
      out[k] = (s !== '' && !isNaN(n) && !/x/i.test(s)) ? n : s;
    }
    return out;
  }

  // ---------- Sozlamalar (admin / mebel rahbari tahrirlaydi) ----------
  // Rahbar faqat xom ashyo narxlari hujjatidagi shu kataklarni o'zgartira oladi.
  const XOM_SHEETS = ['Laminat xom ashyo', 'Krasheniy xom ashyo', 'Oshxona narxlari'];
  const isXomKey = k => XOM_SHEETS.some(s => k.startsWith(s + '!')) || /^Sozlamalar!C2[1-4]$/.test(k);

  // settings: {kalk: {...}, xom: {...}} — Firestore'dagi o'zgartirilgan kataklar
  function settingsCells(settings) {
    const out = {};
    const kalk = (settings && settings.kalk) || {};
    const xom = (settings && settings.xom) || {};
    for (const [k, v] of Object.entries(kalk)) if (!isXomKey(k)) out[k] = v;
    for (const [k, v] of Object.entries(xom)) if (isXomKey(k)) out[k] = v;
    // Usta foizi: kalkulyatorda tanlangan ustaniki (spalniy va korpus uchun bitta usta)
    const uf = Number((settings && settings.ustaFoiz) ?? 0) || 0;
    out['Sozlamalar!C17'] = uf;
    out['Sozlamalar!C18'] = uf;
    applyXomExtra(out, settings);
    // Oshxona ro'yxatlari jadvaldan avtomatik
    const mats = [], bals = [];
    for (let r = 5; r <= 34; r++) {
      const m = k => (('Oshxona narxlari!' + k + r) in out) ? out['Oshxona narxlari!' + k + r] : cell('Oshxona narxlari', k + r);
      const a = m('A'), b = m('B');
      if (a !== null && a !== '' && a !== undefined && !mats.includes(a)) mats.push(a);
      if (b !== null && b !== '' && b !== undefined && !bals.includes(b)) bals.push(b);
    }
    bals.sort((x, y) => x - y);
    for (let i = 0; i < 15; i++) {
      out['Oshxona narxlari!F' + (5 + i)] = mats[i] ?? '';
      out['Oshxona narxlari!G' + (5 + i)] = bals[i] ?? '';
    }
    return out;
  }

  // Oshxona: xomashyo → narxi bor balandliklar
  function oshxonaLists(settings) {
    const pairs = {};
    for (let r = 5; r <= 34; r++) {
      const a = current('Oshxona narxlari!A' + r, settings), b = current('Oshxona narxlari!B' + r, settings), c = current('Oshxona narxlari!C' + r, settings);
      if (a === '' || a === null || b === '' || b === null || c === '' || c === null) continue;
      (pairs[a] ||= []).includes(b) || pairs[a].push(b);
    }
    for (const k of Object.keys(pairs)) pairs[k].sort((x, y) => x - y);
    return { mats: Object.keys(pairs), pairs };
  }

  // ---------- Qo'shimcha va o'chirilgan xom ashyolar ----------
  // Yangi xom ashyo sarfi "1 dona mahsulotga necha birlik" deb kiritiladi va o'sha mahsulot
  // xom ashyosiga (Tannarx!B7…, 'Korpus hisob'!C87…) formulaning o'ziga qo'shiladi —
  // shunda usta haqi, Baraka ustamasi va yaxlitlash Excel'dagidek ishlaydi.
  const SP_COLS = { shkaf: ['B', 'shkaf_kra'], krovat: ['C', null], tumbochka: ['E', 'tumba_kra'], trimo: ['F', 'trimo_kra'], chester: ['G', 'chest_kra'], pufik: ['H', null], oyna: ['I', null] };
  const KOR_COLS2 = ['C', 'D', 'E', 'F', 'G', 'H'];
  const SARF_KEYS = [['shkaf', 'Shkaf'], ['krovat', 'Krovat'], ['tumbochka', 'Tumbochka'], ['trimo', 'Trimo'], ['chester', 'Chester'], ['pufik', 'Pufik'], ['oyna', 'Stoyka oyna'], ['korpus', 'Korpus buyum']];
  const fnum = v => { const n = Number(v); return isFinite(n) ? n : 0; };
  function priceExpr(c) {
    const p = fnum(c.narx);
    if (c.tur === 'Dollar') return `${p}*kurs_joriy`;
    if (c.tur === "So'm (kursga bog'liq)") return `${p}*kurs_joriy/kurs_baza`;
    return `${p}`;
  }
  // variant: 'ikkalasi' | 'laminat' | 'krasheniy'; kra — mahsulotning krasheniy belgisi (1/0)
  const variantExpr = (variant, kra) => !kra || variant === 'ikkalasi' || !variant ? '1' : variant === 'laminat' ? `(1-${kra})` : kra;
  function applyXomExtra(out, settings) {
    const custom = (settings && settings.xomCustom) || [];
    const deleted = new Set((settings && settings.xomDeleted) || []);
    // O'chirilgan standart xom ashyo: miqdori 0 (hisobdan chiqadi)
    for (const key of deleted) {
      const [sh, row] = key.split('#');
      const cols = sh === 'Laminat xom ashyo' ? 'EFGHIJKLM' : 'EFGHI';
      for (const c of cols) out[`${sh}!${c}${row}`] = 0;
      const name = cell(sh, 'C' + row);
      if (name) for (let r = 52; r <= 84; r++) if (cell('Korpus hisob', 'A' + r) === name) for (const c of KOR_COLS2) out[`Korpus hisob!${c}${r}`] = 0;
    }
    const sp = {}, kor = [];
    for (const c of custom) {
      if (c.deleted) continue;
      const k = `${fnum(c.otx) ? `(1+${fnum(c.otx)})` : '1'}*${priceExpr(c)}`;
      for (const [key, [col, kra]] of Object.entries(SP_COLS)) {
        const q = fnum(c.sarf && c.sarf[key]);
        if (q) (sp[col] ||= []).push(`Tannarx!${col}5*${q}*${k}*${variantExpr(c.variant, kra)}`);
      }
      const qk = fnum(c.sarf && c.sarf.korpus);
      if (qk) kor.push(col => `'Korpus hisob'!${col}7*${qk}*${k}*${variantExpr(c.variant, `'Korpus hisob'!${col}24`)}`);
    }
    for (const [col, parts] of Object.entries(sp)) {
      const f = M.sheets.Tannarx[col + '7'].f;
      out[`Tannarx!${col}7`] = { f: `(${f})+${parts.join('+')}` };
    }
    if (kor.length) for (const col of KOR_COLS2) {
      const f = M.sheets['Korpus hisob'][col + '87'].f;
      out[`Korpus hisob!${col}87`] = { f: `(${f})+${kor.map(fn => fn(col)).join('+')}` };
    }
  }

  // To'lov turlari: Tariflar!B29:E29 dagi muddatlar
  function tolovTurlari(settings) {
    const out = ['Naqd'];
    for (const c of ['B', 'C', 'D', 'E']) { const v = current('Tariflar!' + c + '29', settings); if (v !== '' && v !== null) out.push(v + ' oy'); }
    return out;
  }

  let engine = null;
  function getEngine() { if (!engine) engine = new Engine(M); return engine; }

  const num = v => (typeof v === 'number' && isFinite(v)) ? v : 0;
  const txt = v => (v === null || v === undefined || (v && v.e)) ? '' : String(v);

  // Asosiy hisob. Natijada mijoz uchun qatorlar, to'lov variantlari, ogohlantirishlar,
  // usta uchun ish ro'yxati (narxsiz) va usta haqi bazasi bor.
  function compute(inputs, settings, opts) {
    const E = getEngine();
    E.clearOverrides();
    const base = settingsCells(settings);
    E.setMany(base);
    const norm = normalize(inputs);
    for (const r of OSH_ROWS) norm['Oshxona!F' + r] = ''; // qo'lda 1 m narxi endi ishlatilmaydi
    // Oldindan to'lov: foiz yoki summa (Excel'da summa yozilsa foiz o'rniga shu olinadi)
    if (inputs._oldMode === 'sum') norm['Buyurtma!B21'] = 0; else norm['Buyurtma!B22'] = '';
    E.setMany(norm);
    const get = k => E.get(k);
    // Chegirma summa bilan berilsa — foizga aylantiriladi (jami sotuv chegirmaga bog'liq emas)
    if (inputs._chegMode === 'sum') {
      const jami = num(get('Buyurtma!E14')), cs = Number(String(inputs._chegSum ?? '').replace(/\s/g, '')) || 0;
      E.setMany({ 'Buyurtma!B16': jami > 0 ? Math.min(1, cs / jami) : 0 });
    }
    const on = { spalniy: get('Buyurtma!B11') === 'Ha', oshxona: get('Buyurtma!B12') === 'Ha', korpus: get('Buyurtma!B13') === 'Ha' };

    const lines = [];
    const rows = E.get("Ro'yxat!A4:G24");
    for (const r of rows) {
      if (r[6] !== 1) continue;
      lines.push({ bolim: txt(r[0]), mahsulot: txt(r[1]), tavsif: txt(r[2]), miqdor: txt(r[3]), birlik: num(r[4]), summa: num(r[5]) });
    }
    const tariflar = E.get('Tariflar!A38:H42').map(r => ({
      turi: txt(r[0]), oy: num(r[1]), stavka: num(r[2]), ustama: num(r[3]), oylik: num(r[4]), jami: num(r[5]), farq: num(r[6]), izoh: txt(r[7]),
    }));
    const warnings = [];
    const addW = k => { const v = get(k); if (typeof v === 'string' && v.trim()) warnings.push(v); };
    ['Buyurtma!A31', 'Buyurtma!A32'].forEach(addW);
    if (on.spalniy) ['Spalniy!A57', 'Spalniy!A58', 'Spalniy!A59', 'Spalniy!A60'].forEach(addW);
    if (on.korpus) ['Korpus mebel!A40', 'Korpus mebel!A42'].forEach(addW);
    if (on.oshxona) {
      const miss = OSH_ROWS.filter(r => get('Oshxona!B' + r) && get('Oshxona!G' + r) === '').length;
      if (miss) warnings.push(`Oshxona: ${miss} ta qatorda 1 m narxi topilmadi (Sozlamalar → Oshxona narxlari jadvaliga qo'shing)`);
      if (/^Tan/.test(txt(get('Sozlamalar!C149'))) && !num(get('Sozlamalar!C10'))) warnings.push('Oshxona: Baraka ustamasi 0% (Sozlamalar)');
    }
    // Excel'ning "usta tanlanmagan" ogohlantirishi o'rniga ilovaning o'zi tekshiradi
    const wf = warnings.filter(w => !/usta tanlanmagan/.test(w));
    if ((on.spalniy || on.korpus) && !inputs._usta) wf.unshift('Usta tanlanmagan');

    const res = {
      on,
      tan: num(get('Buyurtma!D14')),
      sotuv: num(get('Buyurtma!E14')),
      ustama: num(get('Buyurtma!F14')),
      bolimlar: {
        spalniy: { tan: num(get('Buyurtma!D11')), sotuv: num(get('Buyurtma!E11')) },
        oshxona: { tan: num(get('Buyurtma!D12')), sotuv: num(get('Buyurtma!E12')) },
        korpus: { tan: num(get('Buyurtma!D13')), sotuv: num(get('Buyurtma!E13')) },
      },
      chegirma: num(get('Buyurtma!D16')),
      naqd: num(get('Buyurtma!B17')),
      lines, tariflar,
      tanlangan: {
        turi: txt(get('Tariflar!B47')), oy: num(get('Tariflar!B45')), stavka: num(get('Tariflar!B48')),
        oylik: num(get('Tariflar!B49')), jami: num(get('Tariflar!B50')),
        old: num(get('Tariflar!B33')), qoldiq: num(get('Tariflar!B35')),
      },
      kurs: num(get('Sozlamalar!C8')),
      chegFoiz: num(get('Buyurtma!B16')),
      oldUlush: num(get('Tariflar!B34')),
      ustaFoiz: Number((settings && settings.ustaFoiz) ?? 0) || 0,
      xomAshyo: (on.spalniy ? num(get('Spalniy!D48')) : 0) + (on.korpus ? num(get('Korpus hisob!I87')) : 0),
      warnings: wf,
    };

    // Usta uchun ish ro'yxati (narxsiz)
    const ish = { lines: lines.map(l => ({ bolim: l.bolim, mahsulot: l.mahsulot, tavsif: l.tavsif, miqdor: l.miqdor })), detallar: [], furnitura: [] };
    if (on.spalniy) {
      for (const r of E.get('Detallar!B5:H58')) {
        const soni = num(r[6]);
        if (soni > 0 && r[0]) ish.detallar.push({ m: txt(r[0]), d: txt(r[1]), mat: txt(r[2]), L: Math.round(num(r[4])), W: Math.round(num(r[5])), n: soni });
      }
      for (const r of E.get('Furnitura!B5:E60')) {
        const q = num(r[3]);
        if (q > 0 && r[1]) ish.furnitura.push({ m: txt(r[0]), nom: txt(r[1]), birlik: txt(r[2]), q: Math.round(q * 100) / 100 });
      }
    }
    // Qo'shimcha xom ashyolar ham ustaning ro'yxatiga
    const soniSp = { shkaf: 'B', krovat: 'C', tumbochka: 'E', trimo: 'F', chester: 'G', pufik: 'H', oyna: 'I' };
    for (const c of (settings && settings.xomCustom) || []) {
      if (c.deleted) continue;
      for (const [key, label] of SARF_KEYS) {
        const per = fnum(c.sarf && c.sarf[key]);
        if (!per) continue;
        let n = 0;
        if (key === 'korpus') { if (on.korpus) n = KOR_COLS2.reduce((t, col) => t + num(get(`Korpus hisob!${col}7`)) * num(get(`Korpus hisob!${col}11`)), 0); }
        else if (on.spalniy) n = num(get('Tannarx!' + soniSp[key] + '5'));
        if (n > 0) ish.furnitura.push({ m: label, nom: c.name, birlik: c.unit || '', q: Math.round(n * per * 100) / 100 });
      }
    }
    res.ish = ish;

    // Usta haqi bazasi: usta foizi 100% bo'lganda usta haqi (keyin usta foiziga ko'paytiriladi)
    E.setMany({ 'Sozlamalar!C17': 1, 'Sozlamalar!C18': 1 });
    res.ustaBaza = (on.spalniy ? num(E.get('Spalniy!E48')) : 0) + (on.korpus ? num(E.get('Korpus hisob!I88')) : 0);
    E.setMany({ 'Sozlamalar!C17': base['Sozlamalar!C17'], 'Sozlamalar!C18': base['Sozlamalar!C18'] });
    return res;
  }

  // ---------- Sozlamalar sahifasi uchun ta'riflar ----------
  function sozlamalarRows() {
    const out = [];
    let section = null;
    const sh = 'Sozlamalar';
    for (let r = 5; r <= 159; r++) {
      const a = cell(sh, 'A' + r), b = cell(sh, 'B' + r);
      if (a && !b && /^\d\./.test(String(a))) { section = String(a); continue; }
      if (!b) continue;
      if (isFormula(sh, 'C' + r)) continue;
      if (r === 17 || r === 18) continue; // usta foizi alohida
      if (!section || /^[56]\./.test(section)) continue;
      out.push({ key: sh + '!C' + r, section, group: a, label: b, unit: cell(sh, 'D' + r) || '', def: cell(sh, 'C' + r),
        note: cell(sh, 'F' + r) || '', xom: isXomKey(sh + '!C' + r),
        opts: r === 149 ? ["Tan narx (Baraka ustamasi qo'shiladi)", "Sotuv narxi (ustama qo'shilmaydi)"] : null,
        pct: [9, 10, 11].includes(r), text: [13, 14].includes(r) });
    }
    return out;
  }

  const NARX_TURI = ["So'm (kursga bog'liq)", "So'm (qat'iy)", 'Dollar'];
  function xomRows(which) {
    const sh = which === 'laminat' ? 'Laminat xom ashyo' : 'Krasheniy xom ashyo';
    const [cOtx, cTur, cNarx, cIzoh, last] = which === 'laminat' ? ['O', 'Q', 'R', 'V', 49] : ['K', 'M', 'N', 'R', 35];
    const out = [];
    for (let r = 5; r <= last; r++) {
      const name = cell(sh, 'C' + r);
      out.push({
        r, group: cell(sh, 'B' + r), name: name ?? null, nameKey: sh + '!C' + r, unit: cell(sh, 'D' + r) || '',
        otx: { key: sh + '!' + cOtx + r, def: cell(sh, cOtx + r), ro: isFormula(sh, cOtx + r) || cell(sh, cOtx + r) === null },
        tur: { key: sh + '!' + cTur + r, def: cell(sh, cTur + r), ro: isFormula(sh, cTur + r) || cell(sh, cTur + r) === null },
        narx: { key: sh + '!' + cNarx + r, def: cell(sh, cNarx + r), ro: isFormula(sh, cNarx + r) || cell(sh, cTur + r) === null },
        izoh: cell(sh, cIzoh + r) || '',
      });
    }
    return out;
  }
  // Formula bilan chiqadigan nomlar (masalan napravlyayushiy uzunligi) uchun hisoblangan nom
  function xomName(row, settings) {
    if (row.name !== null) return row.name;
    const E = getEngine(); E.clearOverrides(); E.setMany(settingsCells(settings));
    return txt(E.get(row.nameKey));
  }

  function oshxonaNarxRows() {
    const out = [];
    for (let r = 5; r <= 34; r++) out.push({ r, mat: 'Oshxona narxlari!A' + r, bal: 'Oshxona narxlari!B' + r, narx: 'Oshxona narxlari!C' + r, izoh: 'Oshxona narxlari!D' + r });
    return out;
  }
  function tarifRows() {
    const out = [];
    for (let r = 6; r <= 25; r++) out.push({ r, oy: 'Tariflar!A' + r, dan: 'Tariflar!B' + r, gacha: 'Tariflar!C' + r, ustama: 'Tariflar!D' + r, izoh: 'Tariflar!E' + r });
    return out;
  }
  // Katakning joriy qiymati (sozlamalar o'zgartirilgan bo'lsa — o'sha)
  function current(key, settings) {
    const s = settingsCells(settings);
    if (key in s) return s[key];
    const [sh, a1] = [key.slice(0, key.lastIndexOf('!')), key.slice(key.lastIndexOf('!') + 1)];
    const v = cell(sh, a1);
    return v ?? '';
  }

  const api = {
    defaults, compute, normalize, spalniyFields, korpusFields, KOR_COLS, OSH_ROWS, oshxonaLists, tolovTurlari,
    sozlamalarRows, xomRows, xomName, oshxonaNarxRows, tarifRows, current, isXomKey, NARX_TURI, settingsCells, SARF_KEYS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  g.KALK = api;
})(typeof window !== 'undefined' ? window : globalThis);
