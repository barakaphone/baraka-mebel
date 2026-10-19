// Excel formulalarini bajaruvchi kichik dvigatel.
// Kalkulyator (js/model.js) formulalari Excel'dagidek hisoblanadi, shuning uchun
// narxlar Excel fayl bilan bir xil chiqadi. Faqat kalkulyatorda ishlatilgan
// funksiyalar qo'llab-quvvatlanadi.
(function (g) {
  'use strict';

  // ---------- Qiymat turlari ----------
  function XErr(code) { this.e = code; }
  XErr.prototype.toString = function () { return this.e; };
  const ERR = {
    VALUE: new XErr('#VALUE!'), DIV0: new XErr('#DIV/0!'), NA: new XErr('#N/A'),
    REF: new XErr('#REF!'), NAME: new XErr('#NAME?'), NUM: new XErr('#NUM!'),
  };
  const isErr = v => v instanceof XErr;
  // Diapazon havolasi (hali qiymatga aylantirilmagan)
  function Ref(sheet, r1, c1, r2, c2) { this.sheet = sheet; this.r1 = r1; this.c1 = c1; this.r2 = r2; this.c2 = c2; }
  // Massiv (qatorlar ro'yxati)
  function Mat(rows) { this.rows = rows; }
  const BLANK = null;

  // ---------- Katak manzillari ----------
  function colToNum(s) { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
  function numToCol(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function parseA1(a1) {
    const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(a1);
    if (!m) return null;
    return { r: +m[2], c: colToNum(m[1]) };
  }
  function addr(r, c) { return numToCol(c) + r; }

  // ---------- Tokenizer ----------
  function tokenize(src) {
    const t = [];
    let i = 0;
    const n = src.length;
    while (i < n) {
      const ch = src[i];
      if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') { i++; continue; }
      if (ch === '"') {
        let s = ''; i++;
        while (i < n) {
          if (src[i] === '"') { if (src[i + 1] === '"') { s += '"'; i += 2; continue; } i++; break; }
          s += src[i++];
        }
        t.push({ k: 'str', v: s }); continue;
      }
      if (ch === "'") { // 'Sheet name'!A1
        let s = ''; i++;
        while (i < n) {
          if (src[i] === "'") { if (src[i + 1] === "'") { s += "'"; i += 2; continue; } i++; break; }
          s += src[i++];
        }
        if (src[i] !== '!') throw new Error('Kutilgan ! : ' + src);
        i++;
        t.push({ k: 'sheet', v: s }); continue;
      }
      if (/[0-9.]/.test(ch)) {
        const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
        // A1 ga o'xshash? (masalan 5:5 ishlatilmaydi) — oddiy son
        t.push({ k: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue;
      }
      if (/[A-Za-z_$\\]/.test(ch)) {
        const m = /^[A-Za-z_$\\][A-Za-z0-9_$.\\]*/.exec(src.slice(i));
        let w = m[0]; i += w.length;
        if (src[i] === '!') { i++; t.push({ k: 'sheet', v: w }); continue; }
        if (src[i] === '(') { t.push({ k: 'fn', v: w.toUpperCase() }); continue; }
        const up = w.toUpperCase();
        if (up === 'TRUE' || up === 'FALSE') { t.push({ k: 'bool', v: up === 'TRUE' }); continue; }
        if (parseA1(w)) { t.push({ k: 'cell', v: w }); continue; }
        t.push({ k: 'name', v: w }); continue;
      }
      const two = src.substr(i, 2);
      if (two === '<>' || two === '<=' || two === '>=') { t.push({ k: 'op', v: two }); i += 2; continue; }
      if ('+-*/^&=<>%:'.includes(ch)) { t.push({ k: 'op', v: ch }); i++; continue; }
      if (ch === '(' || ch === ')' || ch === ',' || ch === ';') { t.push({ k: ch === ';' ? ',' : ch }); i++; continue; }
      throw new Error('Noma\'lum belgi "' + ch + '" : ' + src);
    }
    return t;
  }

  // ---------- Parser (AST) ----------
  function parse(src) {
    const t = tokenize(src);
    let p = 0;
    const peek = () => t[p];
    const next = () => t[p++];
    const isOp = (v) => t[p] && t[p].k === 'op' && t[p].v === v;

    function expr() { return comparison(); }
    function comparison() {
      let l = concat();
      while (t[p] && t[p].k === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(t[p].v)) {
        const op = next().v; l = { t: 'bin', op, l, r: concat() };
      }
      return l;
    }
    function concat() {
      let l = additive();
      while (isOp('&')) { next(); l = { t: 'bin', op: '&', l, r: additive() }; }
      return l;
    }
    function additive() {
      let l = mult();
      while (isOp('+') || isOp('-')) { const op = next().v; l = { t: 'bin', op, l, r: mult() }; }
      return l;
    }
    function mult() {
      let l = power();
      while (isOp('*') || isOp('/')) { const op = next().v; l = { t: 'bin', op, l, r: power() }; }
      return l;
    }
    function power() {
      let l = unary();
      while (isOp('^')) { next(); l = { t: 'bin', op: '^', l, r: unary() }; }
      return l;
    }
    function unary() {
      if (isOp('-')) { next(); return { t: 'neg', x: unary() }; }
      if (isOp('+')) { next(); return unary(); }
      return percent();
    }
    function percent() {
      let x = range();
      while (isOp('%')) { next(); x = { t: 'pct', x }; }
      return x;
    }
    function range() {
      let l = primary();
      if (isOp(':')) {
        next();
        const r = primary();
        return { t: 'range', l, r };
      }
      return l;
    }
    function primary() {
      const tok = next();
      if (!tok) throw new Error('Formula tugab qoldi: ' + src);
      switch (tok.k) {
        case 'num': return { t: 'lit', v: tok.v };
        case 'str': return { t: 'lit', v: tok.v };
        case 'bool': return { t: 'lit', v: tok.v };
        case 'cell': return { t: 'cell', sheet: null, a: tok.v };
        case 'name': return { t: 'name', n: tok.v };
        case 'sheet': {
          const c = next();
          if (!c || c.k !== 'cell') throw new Error('Varaqdan keyin katak kutilgan: ' + src);
          return { t: 'cell', sheet: tok.v, a: c.v };
        }
        case 'fn': {
          next(); // (
          const args = [];
          if (peek() && peek().k === ')') { next(); return { t: 'fn', n: tok.v, args }; }
          for (;;) {
            if (peek() && (peek().k === ',' || peek().k === ')')) args.push({ t: 'lit', v: BLANK, missing: true });
            else args.push(expr());
            const sep = next();
            if (sep.k === ')') break;
            if (sep.k !== ',') throw new Error('Kutilgan , yoki ) : ' + src);
          }
          return { t: 'fn', n: tok.v, args };
        }
        case '(': { const e = expr(); if (next().k !== ')') throw new Error('Kutilgan ) : ' + src); return e; }
        default: throw new Error('Kutilmagan token ' + JSON.stringify(tok) + ' : ' + src);
      }
    }
    const ast = expr();
    if (p < t.length) throw new Error('Ortiqcha token: ' + src);
    return ast;
  }

  // ---------- Yordamchi: turlarni o'zgartirish ----------
  function fmtNumber(n) {
    if (!isFinite(n)) return String(n);
    if (Number.isInteger(n)) return String(n);
    let s = String(parseFloat(n.toPrecision(15)));
    return s.replace('.', ',');
  }
  function toNum(v) {
    if (v === BLANK) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (isErr(v)) return v;
    if (typeof v === 'string') {
      const s = v.trim();
      if (s === '') return ERR.VALUE;
      const x = Number(s.replace(',', '.'));
      if (!isNaN(x)) return x;
      const pm = /^(-?[\d.,]+)%$/.exec(s);
      if (pm) return Number(pm[1].replace(',', '.')) / 100;
      return ERR.VALUE;
    }
    return ERR.VALUE;
  }
  function toStr(v) {
    if (v === BLANK) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return fmtNumber(v);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return v;
  }
  function toBool(v) {
    if (v === BLANK) return false;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (isErr(v)) return v;
    if (typeof v === 'string') {
      const u = v.toUpperCase();
      if (u === 'TRUE') return true;
      if (u === 'FALSE') return false;
      return ERR.VALUE;
    }
    return ERR.VALUE;
  }
  // Excel'ning 15 xonali aniqligi (ROUND/ROUNDUP uchun)
  const p15 = x => parseFloat(x.toPrecision(15));

  function compare(a, b) {
    // Excel tartibi: son < matn < mantiqiy; bo'sh = 0 yoki ""
    if (a === BLANK && b === BLANK) return 0;
    if (a === BLANK) a = typeof b === 'string' ? '' : (typeof b === 'boolean' ? false : 0);
    if (b === BLANK) b = typeof a === 'string' ? '' : (typeof a === 'boolean' ? false : 0);
    const rank = v => typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2;
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra < rb ? -1 : 1;
    if (typeof a === 'string') { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
    if (typeof a === 'boolean') return a === b ? 0 : (a ? 1 : -1);
    const d = p15(a) - p15(b);
    return d < 0 ? -1 : d > 0 ? 1 : 0;
  }

  // ---------- Kriteriyalar (SUMIFS/COUNTIF) ----------
  function makeCriterion(crit) {
    if (isErr(crit)) return () => false;
    if (typeof crit === 'number' || typeof crit === 'boolean') {
      return v => {
        if (typeof v === 'number' || typeof v === 'boolean') return compare(v, crit) === 0;
        if (typeof v === 'string' && typeof crit === 'number') { const x = toNum(v); return !isErr(x) && x === crit; }
        return false;
      };
    }
    if (crit === BLANK) crit = '';
    const s = String(crit);
    const m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(s);
    const op = m[1] || '=';
    const rest = m[2];
    const restNum = rest.trim() === '' ? null : Number(rest.replace(',', '.'));
    const isNumCrit = restNum !== null && !isNaN(restNum);
    if (op === '=' || op === '<>') {
      let test;
      if (rest === '') {
        test = v => v === BLANK || v === '';
        if (!m[1]) return test; // "" — bo'sh kataklar
        if (op === '=') return v => v === BLANK; // "=" — faqat haqiqiy bo'sh
        return v => !(v === BLANK); // "<>" — bo'sh emas
      } else if (isNumCrit) {
        test = v => {
          if (typeof v === 'number') return Math.abs(v - restNum) < 1e-12 * Math.max(1, Math.abs(restNum));
          if (typeof v === 'string') { const x = Number(v.replace(',', '.')); return v.trim() !== '' && !isNaN(x) && x === restNum; }
          return false;
        };
      } else if (/[*?]/.test(rest)) {
        const re = new RegExp('^' + rest.replace(/~([*?~])|([.+^${}()|[\]\\])|(\*)|(\?)/g,
          (all, esc, meta, star, q) => esc ? '\\' + esc : meta ? '\\' + meta : star ? '[\\s\\S]*' : '[\\s\\S]') + '$', 'i');
        test = v => typeof v === 'string' && re.test(v);
      } else {
        const low = rest.replace(/~([*?~])/g, '$1').toLowerCase();
        const up = low.toUpperCase();
        test = v => {
          if (typeof v === 'string') return v.toLowerCase() === low;
          if (typeof v === 'boolean') return (v ? 'TRUE' : 'FALSE') === up;
          return false;
        };
      }
      return op === '=' ? test : v => !test(v);
    }
    // <, >, <=, >=
    if (isNumCrit) {
      return v => {
        if (typeof v !== 'number') return false;
        const c = compare(v, restNum);
        return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
      };
    }
    return v => {
      if (typeof v !== 'string') return false;
      const c = compare(v, rest);
      return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
    };
  }

  // ---------- TEXT() ----------
  function groupThousands(intStr) { return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function textFormat(v, fmt) {
    if (isErr(v)) return v;
    const n = toNum(v);
    if (isErr(n)) return toStr(v);
    const pct = fmt.endsWith('%');
    let f = pct ? fmt.slice(0, -1) : fmt;
    let x = pct ? n * 100 : n;
    if (/^d+[./]m+[./]y+$/i.test(f)) {
      const d = new Date(Math.round((n - 25569) * 86400000));
      const dd = String(d.getUTCDate()).padStart(2, '0'), mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      return dd + '.' + mm + '.' + d.getUTCFullYear();
    }
    const dec = (f.split('.')[1] || '').length;
    const grouped = f.includes(',');
    const neg = x < 0; x = Math.abs(x);
    let s = (Math.round(p15(x * Math.pow(10, dec))) / Math.pow(10, dec)).toFixed(dec);
    let [ip, fp] = s.split('.');
    if (grouped) ip = groupThousands(ip);
    s = ip + (fp ? ',' + fp : '');
    return (neg ? '-' : '') + s + (pct ? '%' : '');
  }

  // ---------- Dvigatel ----------
  function Engine(model) {
    this.model = model;
    this.overrides = {}; // "Sheet!A1" -> qiymat (formula o'rniga ham qo'yiladi)
    this.cache = new Map();
    this.ast = new Map();
    this.evaluating = new Set();
    this.names = {};
    for (const [n, txt] of Object.entries(model.names)) this.names[n.toLowerCase()] = txt;
    this.nameRefs = {};
  }

  Engine.prototype.reset = function () { this.cache.clear(); };
  Engine.prototype.set = function (sheet, a1, value) {
    this.overrides[sheet + '!' + a1.replace(/\$/g, '')] = value;
    this.cache.clear();
  };
  Engine.prototype.setMany = function (obj) {
    for (const [k, v] of Object.entries(obj)) this.overrides[k.replace(/\$/g, '')] = v;
    this.cache.clear();
  };
  Engine.prototype.clearOverrides = function () { this.overrides = {}; this.cache.clear(); };

  Engine.prototype.rawCell = function (sheet, a1) {
    const k = sheet + '!' + a1;
    if (Object.prototype.hasOwnProperty.call(this.overrides, k)) {
      const v = this.overrides[k];
      return v === '' || v === undefined ? BLANK : v;
    }
    const sh = this.model.sheets[sheet];
    if (!sh) return ERR.REF;
    const v = sh[a1];
    return v === undefined ? BLANK : v;
  };

  Engine.prototype.cellValue = function (sheet, r, c) {
    const a1 = addr(r, c);
    const key = sheet + '!' + a1;
    if (this.cache.has(key)) return this.cache.get(key);
    const raw = this.rawCell(sheet, a1);
    let val;
    if (raw !== null && typeof raw === 'object' && !isErr(raw) && 'f' in raw) {
      if (this.evaluating.has(key)) throw new Error('Aylanma havola: ' + key);
      this.evaluating.add(key);
      try {
        let ast = this.ast.get(raw.f);
        if (!ast) { ast = parse(raw.f); this.ast.set(raw.f, ast); }
        val = this.evalNode(ast, sheet);
        if (val instanceof Ref) val = this.implicit(val, r, c);
        if (val instanceof Mat) val = val.rows[0][0];
        if (val === BLANK) val = 0; // formulaning bo'sh natijasi 0
      } finally { this.evaluating.delete(key); }
    } else {
      val = raw;
    }
    this.cache.set(key, val);
    return val;
  };

  // Formula diapazon qaytarsa, Excel shu qator/ustundagi katakni oladi
  Engine.prototype.implicit = function (ref, r, c) {
    if (ref.r1 === ref.r2 && ref.c1 === ref.c2) return this.cellValue(ref.sheet, ref.r1, ref.c1);
    if (ref.c1 === ref.c2 && r >= ref.r1 && r <= ref.r2) return this.cellValue(ref.sheet, r, ref.c1);
    if (ref.r1 === ref.r2 && c >= ref.c1 && c <= ref.c2) return this.cellValue(ref.sheet, ref.r1, c);
    return ERR.VALUE;
  };

  Engine.prototype.get = function (ref) {
    // "Sheet!A1" yoki nom
    const r = this.resolveRefText(ref.includes('!') ? ref : (this.names[ref.toLowerCase()] || ref));
    if (r.r1 === r.r2 && r.c1 === r.c2) {
      const v = this.cellValue(r.sheet, r.r1, r.c1);
      return v;
    }
    return this.refToMat(r).rows;
  };

  Engine.prototype.resolveRefText = function (txt) {
    // 'Sheet'!$A$1:$B$2
    const m = /^(?:'((?:[^']|'')+)'|([^!]+))!(\$?[A-Z]+\$?\d+)(?::(\$?[A-Z]+\$?\d+))?$/.exec(txt);
    if (!m) throw new Error('Havolani tushunmadim: ' + txt);
    const sheet = (m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2]);
    const a = parseA1(m[3]), b = m[4] ? parseA1(m[4]) : a;
    return new Ref(sheet, Math.min(a.r, b.r), Math.min(a.c, b.c), Math.max(a.r, b.r), Math.max(a.c, b.c));
  };

  Engine.prototype.refToMat = function (ref) {
    const rows = [];
    for (let r = ref.r1; r <= ref.r2; r++) {
      const row = [];
      for (let c = ref.c1; c <= ref.c2; c++) row.push(this.cellValue(ref.sheet, r, c));
      rows.push(row);
    }
    return new Mat(rows);
  };

  // Qiymatni skalyarga aylantirish (diapazon bo'lsa — massiv sifatida qoldiriladi)
  Engine.prototype.deref = function (v) {
    if (v instanceof Ref) {
      if (v.r1 === v.r2 && v.c1 === v.c2) return this.cellValue(v.sheet, v.r1, v.c1);
      return this.refToMat(v);
    }
    return v;
  };

  Engine.prototype.evalNode = function (n, sheet) {
    switch (n.t) {
      case 'lit': return n.v;
      case 'cell': {
        const a = parseA1(n.a);
        return new Ref(n.sheet || sheet, a.r, a.c, a.r, a.c);
      }
      case 'name': {
        const txt = this.names[n.n.toLowerCase()];
        if (!txt) return ERR.NAME;
        let ref = this.nameRefs[txt];
        if (!ref) { ref = this.resolveRefText(txt); this.nameRefs[txt] = ref; }
        return ref;
      }
      case 'range': {
        const l = this.evalNode(n.l, sheet), r = this.evalNode(n.r, sheet);
        if (!(l instanceof Ref) || !(r instanceof Ref)) return ERR.REF;
        return new Ref(l.sheet, Math.min(l.r1, r.r1), Math.min(l.c1, r.c1), Math.max(l.r2, r.r2), Math.max(l.c2, r.c2));
      }
      case 'neg': return this.unaryOp(this.deref(this.evalNode(n.x, sheet)), x => -x);
      case 'pct': return this.unaryOp(this.deref(this.evalNode(n.x, sheet)), x => x / 100);
      case 'bin': return this.binOp(n.op, this.deref(this.evalNode(n.l, sheet)), this.deref(this.evalNode(n.r, sheet)));
      case 'fn': return this.callFn(n.n, n.args, sheet);
    }
    throw new Error('Noma\'lum tugun ' + n.t);
  };

  Engine.prototype.unaryOp = function (v, f) {
    if (v instanceof Mat) return new Mat(v.rows.map(row => row.map(x => this.unaryOp(x, f))));
    const x = toNum(v);
    return isErr(x) ? x : f(x);
  };

  function broadcast(a, b, f) {
    const A = a instanceof Mat ? a.rows : null, B = b instanceof Mat ? b.rows : null;
    const R = Math.max(A ? A.length : 1, B ? B.length : 1);
    const C = Math.max(A ? A[0].length : 1, B ? B[0].length : 1);
    const rows = [];
    for (let i = 0; i < R; i++) {
      const row = [];
      for (let j = 0; j < C; j++) {
        const pick = (M, s) => {
          if (!M) return s;
          const ii = M.length === 1 ? 0 : i, jj = M[0].length === 1 ? 0 : j;
          return (M[ii] && M[ii][jj] !== undefined) ? M[ii][jj] : ERR.NA;
        };
        row.push(f(pick(A, a), pick(B, b)));
      }
      rows.push(row);
    }
    return new Mat(rows);
  }

  Engine.prototype.binOp = function (op, a, b) {
    if (a instanceof Mat || b instanceof Mat) return broadcast(a, b, (x, y) => this.binOp(op, x, y));
    if (isErr(a)) return a;
    if (isErr(b)) return b;
    switch (op) {
      case '&': return toStr(a) + toStr(b);
      case '=': return compare(a, b) === 0;
      case '<>': return compare(a, b) !== 0;
      case '<': return compare(a, b) < 0;
      case '>': return compare(a, b) > 0;
      case '<=': return compare(a, b) <= 0;
      case '>=': return compare(a, b) >= 0;
    }
    const x = toNum(a), y = toNum(b);
    if (isErr(x)) return x;
    if (isErr(y)) return y;
    switch (op) {
      case '+': return x + y;
      case '-': return x - y;
      case '*': return x * y;
      case '/': return y === 0 ? ERR.DIV0 : x / y;
      case '^': return Math.pow(x, y);
    }
    throw new Error('Operator ' + op);
  };

  // Diapazon/massivdagi barcha qiymatlar (yassi ro'yxat)
  function flat(v) {
    if (v instanceof Mat) { const out = []; for (const r of v.rows) for (const x of r) out.push(x); return out; }
    return [v];
  }

  // Raqamli agregatlar uchun: diapazondagi matn va mantiqiy qiymatlar e'tiborga olinmaydi,
  // to'g'ridan-to'g'ri berilgan argumentlar esa songa aylantiriladi.
  Engine.prototype.numbersOf = function (args, sheet) {
    const out = [];
    for (const a of args) {
      const raw = this.evalNode(a, sheet);
      const isRange = raw instanceof Ref || raw instanceof Mat;
      const v = this.deref(raw);
      if (v instanceof Mat) {
        for (const x of flat(v)) {
          if (isErr(x)) return x;
          if (typeof x === 'number') out.push(x);
        }
      } else if (isRange) {
        if (isErr(v)) return v;
        if (typeof v === 'number') out.push(v);
      } else {
        if (a.missing) continue;
        const x = toNum(v);
        if (isErr(x)) return x;
        out.push(x);
      }
    }
    return out;
  };

  function roundX(x, d, mode) {
    const f = Math.pow(10, d);
    const v = p15(Math.abs(x) * f);
    let r;
    if (mode === 'up') r = Math.ceil(v);
    else if (mode === 'down') r = Math.floor(v);
    else r = Math.floor(v + 0.5);
    r = r / f;
    return x < 0 ? -r : r;
  }

  Engine.prototype.matOf = function (node, sheet) {
    const v = this.deref(this.evalNode(node, sheet));
    if (v instanceof Mat) return v;
    return new Mat([[v]]);
  };

  Engine.prototype.ifsPairs = function (args, sheet, start) {
    const tests = [];
    for (let i = start; i < args.length; i += 2) {
      const rng = this.matOf(args[i], sheet);
      const crit = this.deref(this.evalNode(args[i + 1], sheet));
      const c = crit instanceof Mat ? crit.rows[0][0] : crit;
      tests.push({ rng: flat(rng), f: makeCriterion(c) });
    }
    return tests;
  };

  Engine.prototype.callFn = function (name, args, sheet) {
    const E = this;
    const val = (i) => E.deref(E.evalNode(args[i], sheet));
    const scalar = (i) => { const v = val(i); return v instanceof Mat ? v.rows[0][0] : v; };
    const num = (i) => toNum(scalar(i));
    switch (name) {
      case 'IF': {
        const c = val(0);
        if (c instanceof Mat) {
          const a = args.length > 1 ? val(1) : true;
          const b = args.length > 2 ? val(2) : false;
          const ca = broadcast(c, a, (cc, aa) => ({ cc, aa }));
          return broadcast(ca, b, (p, bb) => {
            const t = toBool(p.cc);
            if (isErr(t)) return t;
            return t ? p.aa : bb;
          });
        }
        const b = toBool(c);
        if (isErr(b)) return b;
        if (b) return args.length > 1 ? (args[1].missing ? 0 : E.evalNode(args[1], sheet)) : true;
        return args.length > 2 ? (args[2].missing ? 0 : E.evalNode(args[2], sheet)) : false;
      }
      case 'IFERROR': {
        const v = val(0);
        if (v instanceof Mat) return new Mat(v.rows.map(r => r.map(x => isErr(x) ? scalar(1) : x)));
        return isErr(v) ? E.evalNode(args[1], sheet) : v;
      }
      case 'AND': case 'OR': {
        let res = name === 'AND';
        let any = false;
        for (let i = 0; i < args.length; i++) {
          for (const x of flat(val(i))) {
            if (x === BLANK || typeof x === 'string') continue;
            const b = toBool(x);
            if (isErr(b)) return b;
            any = true;
            if (name === 'AND') res = res && b; else res = res || b;
          }
        }
        return any ? res : ERR.VALUE;
      }
      case 'SUM': { const xs = E.numbersOf(args, sheet); if (isErr(xs)) return xs; return xs.reduce((s, x) => s + x, 0); }
      case 'MAX': { const xs = E.numbersOf(args, sheet); if (isErr(xs)) return xs; return xs.length ? Math.max(...xs) : 0; }
      case 'MIN': { const xs = E.numbersOf(args, sheet); if (isErr(xs)) return xs; return xs.length ? Math.min(...xs) : 0; }
      case 'ABS': { const x = num(0); return isErr(x) ? x : Math.abs(x); }
      case 'N': { const v = scalar(0); return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : isErr(v) ? v : 0; }
      case 'VALUE': {
        const v = scalar(0);
        if (typeof v === 'number') return v;
        if (isErr(v)) return v;
        const s = toStr(v).trim();
        if (s === '') return 0;
        return toNum(s);
      }
      case 'ROUND': case 'ROUNDUP': case 'ROUNDDOWN': {
        const x = num(0), d = args.length > 1 ? num(1) : 0;
        if (isErr(x)) return x;
        if (isErr(d)) return d;
        return roundX(x, Math.trunc(d), name === 'ROUNDUP' ? 'up' : name === 'ROUNDDOWN' ? 'down' : 'half');
      }
      case 'FLOOR': {
        const x = num(0), s = num(1);
        if (isErr(x)) return x;
        if (isErr(s)) return s;
        if (s === 0) return 0;
        if (x > 0 && s < 0) return ERR.NUM;
        return Math.floor(p15(x / s)) * s;
      }
      case 'LEFT': {
        const v = scalar(0);
        if (isErr(v)) return v;
        const k = args.length > 1 ? num(1) : 1;
        if (isErr(k)) return k;
        if (k < 0) return ERR.VALUE;
        return toStr(v).slice(0, Math.trunc(k));
      }
      case 'FIND': {
        const what = toStr(scalar(0)), within = toStr(scalar(1));
        if (isErr(what)) return what;
        if (isErr(within)) return within;
        const start = args.length > 2 ? num(2) : 1;
        const i = within.indexOf(what, start - 1);
        return i < 0 ? ERR.VALUE : i + 1;
      }
      case 'TEXT': {
        const v = scalar(0), f = toStr(scalar(1));
        return textFormat(v, f);
      }
      case 'TODAY': {
        const d = new Date();
        return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000) + 25569);
      }
      case 'INDEX': {
        const m = E.matOf(args[0], sheet).rows;
        let r = args.length > 1 && !args[1].missing ? num(1) : 0;
        let c = args.length > 2 && !args[2].missing ? num(2) : 0;
        if (isErr(r)) return r;
        if (isErr(c)) return c;
        r = Math.trunc(r); c = Math.trunc(c);
        if (m.length === 1 && args.length === 2) { c = r; r = 1; }
        if (r === 0) r = 1;
        if (c === 0) c = 1;
        if (r < 1 || c < 1 || r > m.length || c > m[0].length) return ERR.REF;
        const v = m[r - 1][c - 1];
        return v;
      }
      case 'MATCH': {
        const look = scalar(0);
        if (isErr(look)) return look;
        const arr = flat(E.matOf(args[1], sheet));
        const type = args.length > 2 ? num(2) : 1;
        if (type === 0) {
          const f = typeof look === 'string' ? makeCriterion(look.replace(/^([<>=])/, '=$1')) : null;
          for (let i = 0; i < arr.length; i++) {
            const x = arr[i];
            if (typeof look === 'string') { if (typeof x === 'string' && f(x)) return i + 1; }
            else if (x !== BLANK && compare(x, look) === 0 && typeof x === typeof look) return i + 1;
          }
          return ERR.NA;
        }
        let best = -1;
        for (let i = 0; i < arr.length; i++) {
          const x = arr[i];
          if (x === BLANK || typeof x !== typeof look) continue;
          const c = compare(x, look);
          if (type > 0) { if (c <= 0) best = i; else break; }
          else { if (c >= 0) best = i; else break; }
        }
        return best < 0 ? ERR.NA : best + 1;
      }
      case 'SUMPRODUCT': {
        const ms = args.map(a => E.matOf(a, sheet));
        const R = ms[0].rows.length, C = ms[0].rows[0].length;
        for (const m of ms) if (m.rows.length !== R || m.rows[0].length !== C) return ERR.VALUE;
        let s = 0;
        for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
          let p = 1;
          for (const m of ms) {
            const x = m.rows[i][j];
            if (isErr(x)) return x;
            p *= (typeof x === 'number') ? x : 0;
          }
          s += p;
        }
        return s;
      }
      case 'SUMIFS': {
        const sum = flat(E.matOf(args[0], sheet));
        const tests = E.ifsPairs(args, sheet, 1);
        let s = 0;
        for (let i = 0; i < sum.length; i++) {
          if (tests.every(t => t.f(t.rng[i] === undefined ? BLANK : t.rng[i]))) {
            const x = sum[i];
            if (isErr(x)) return x;
            if (typeof x === 'number') s += x;
          }
        }
        return s;
      }
      case 'COUNTIFS': case 'COUNTIF': {
        const tests = E.ifsPairs(args, sheet, 0);
        const n = tests[0].rng.length;
        let k = 0;
        for (let i = 0; i < n; i++) if (tests.every(t => t.f(t.rng[i] === undefined ? BLANK : t.rng[i]))) k++;
        return k;
      }
    }
    throw new Error('Funksiya qo\'llab-quvvatlanmaydi: ' + name);
  };

  const api = { Engine, parse, colToNum, numToCol, parseA1, addr, isErr, textFormat };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  g.KalkEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
