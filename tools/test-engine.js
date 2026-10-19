// Dvigatelni LibreOffice natijalari bilan solishtirish.
//   node tools/test-engine.js gen 40 cases.json      — tasodifiy holatlar yaratish
//   node tools/test-engine.js cmp cases.json natija.json — solishtirish
const fs = require('fs');
const path = require('path');
require(path.join(__dirname, '../js/model.js'));
const { Engine } = require(path.join(__dirname, '../js/engine.js'));

let seed = +(process.env.SEED || 12345);
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = a => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

function genCase(i) {
  const c = {};
  const hy = () => pick(['Ha', "Yo'q"]);
  const lk = () => pick(['Laminat', 'Krasheniy']);
  c['Buyurtma!B11'] = i % 3 === 0 ? 'Ha' : hy();
  c['Buyurtma!B12'] = i % 3 === 1 ? 'Ha' : hy();
  c['Buyurtma!B13'] = i % 3 === 2 ? 'Ha' : hy();
  c['Buyurtma!B16'] = pick([0, 0, 0.05, 0.1]);
  c['Buyurtma!B20'] = pick(['Naqd', '3 oy', '6 oy', '12 oy', '18 oy']);
  c['Buyurtma!B21'] = pick([0, 0.1, 0.2, 0.25, 0.3]);
  c['Buyurtma!B22'] = pick(['', '', '', 1500000]);
  // Spalniy
  c['Spalniy!C5'] = pick([0, 1, 2]);
  c['Spalniy!C6'] = int(180, 270);
  c['Spalniy!C7'] = int(45, 70);
  c['Spalniy!C8'] = int(120, 320);
  c['Spalniy!C9'] = pick([2, 4, 6, 8]);
  c['Spalniy!C10'] = int(0, 4);
  c['Spalniy!C11'] = lk(); c['Spalniy!C12'] = lk();
  c['Spalniy!C13'] = pick([0, 1, 2]);
  c['Spalniy!C14'] = int(190, 230);
  c['Spalniy!C15'] = pick([90, 140, 160, 170, 180, 200]);
  c['Spalniy!C16'] = int(30, 60);
  c['Spalniy!C17'] = int(90, 160);
  c['Spalniy!C18'] = hy();
  c['Spalniy!C19'] = pick(['Oddiy', 'Nasosli']);
  c['Spalniy!C20'] = pick(["Yo'q", '140x200', '160x200', '180x200', '200x200']);
  c['Spalniy!C21'] = pick([0, 1, 2]);
  c['Spalniy!C22'] = int(100, 200);
  c['Spalniy!C23'] = int(35, 55);
  c['Spalniy!C24'] = int(60, 100);
  c['Spalniy!C25'] = lk(); c['Spalniy!C26'] = lk();
  c['Spalniy!C27'] = int(0, 3); c['Spalniy!C28'] = lk(); c['Spalniy!C29'] = lk();
  c['Spalniy!C30'] = int(0, 2); c['Spalniy!C31'] = lk(); c['Spalniy!C32'] = lk();
  c['Spalniy!C33'] = int(0, 2); c['Spalniy!C34'] = int(0, 2);
  // Oshxona
  for (let r = 5; r <= 10; r++) {
    if (rnd() < 0.5) {
      c['Oshxona!B' + r] = pick(['Akril', 'Laminat', 'MDF']);
      c['Oshxona!C' + r] = pick([2.2, 3.1, 2.5]);
      c['Oshxona!D' + r] = pick([1, 2.5, 3, 4.2]);
      c['Oshxona!F' + r] = pick(['', '', 300]);
    } else {
      c['Oshxona!B' + r] = ''; c['Oshxona!C' + r] = ''; c['Oshxona!D' + r] = ''; c['Oshxona!F' + r] = '';
    }
  }
  // Korpus
  for (const col of ['C', 'D', 'E', 'F', 'G', 'H']) {
    const on = rnd() < 0.6;
    c[`Korpus mebel!${col}7`] = pick(['Shkaf', 'Prixojka', 'Garderob', 'Boshqa']);
    c[`Korpus mebel!${col}9`] = on ? int(1, 2) : 0;
    c[`Korpus mebel!${col}10`] = int(60, 350);
    c[`Korpus mebel!${col}11`] = int(180, 270);
    c[`Korpus mebel!${col}12`] = int(35, 70);
    c[`Korpus mebel!${col}13`] = pick(['', '', 2, 3]);
    c[`Korpus mebel!${col}14`] = pick(['Oddiy', 'Kupe', 'Eshiksiz']);
    c[`Korpus mebel!${col}15`] = pick(['', '', 2, 3]);
    c[`Korpus mebel!${col}16`] = int(0, 2);
    c[`Korpus mebel!${col}17`] = int(0, 8);
    c[`Korpus mebel!${col}18`] = int(0, 3);
    c[`Korpus mebel!${col}19`] = int(0, 2);
    c[`Korpus mebel!${col}20`] = int(0, 6);
    c[`Korpus mebel!${col}21`] = hy();
    c[`Korpus mebel!${col}22`] = lk();
    c[`Korpus mebel!${col}23`] = lk();
  }
  // Sozlamalar
  c['Sozlamalar!C8'] = pick([11963, 12500, 13000]);
  c['Sozlamalar!C9'] = pick([0, 0.2, 0.35]);
  c['Sozlamalar!C10'] = pick([0, 0.15]);
  c['Sozlamalar!C11'] = pick([0, 0.25]);
  c['Sozlamalar!C12'] = pick([1, 1000, 10000]);
  c['Sozlamalar!C17'] = pick([0, 0.1, 0.25]);
  c['Sozlamalar!C18'] = pick([0, 0.12]);
  c['Sozlamalar!C21'] = pick(['', 900000]);
  c['Sozlamalar!C149'] = pick(["Tan narx (Baraka ustamasi qo'shiladi)", 'Sotuv narxi (ustama qo\'shilmaydi)']);
  c["Laminat xom ashyo!R6"] = pick(['', 350000]);
  c["Laminat xom ashyo!R29"] = pick(['', 400000]);
  c["Laminat xom ashyo!R43"] = pick(['', 90000]);
  c["Laminat xom ashyo!Q5"] = pick(["So'm (kursga bog'liq)", "So'm (qat'iy)", 'Dollar']);
  c["Laminat xom ashyo!R5"] = c["Laminat xom ashyo!Q5"] === 'Dollar' ? 33 : 400000;
  c["Krasheniy xom ashyo!N6"] = pick(['', 600000]);
  c["Krasheniy xom ashyo!N15"] = pick(['', 80000]);
  c['Tariflar!C28'] = pick(["Qoldiq (narx − oldindan to'lov)", "To'liq narx"]);
  return c;
}

const norm = s => String(s).replace(/(\d),(?=\d{3}(?!\d))/g, '$1').replace(/[\s\u00a0\u202f]/g, '').replace(/,/g, '.');
function same(exp, got) {
  if (got && got.e) got = '#ERR';
  if (typeof exp === 'number') {
    if (typeof got === 'boolean') got = got ? 1 : 0;
    if (got === null || got === '') got = 0;
    return typeof got === 'number' && Math.abs(got - exp) <= 1e-6 * Math.max(1, Math.abs(exp));
  }
  if (exp === '#ERR') return got === '#ERR';
  if (exp === '' && (got === 0 || got === '' || got === null)) return true;
  return norm(exp) === norm(got);
}

const [mode, a, b, c] = process.argv.slice(2);
if (mode === 'gen') {
  const n = +a;
  const cases = [];
  for (let i = 0; i < n; i++) cases.push(genCase(i));
  fs.writeFileSync(b, JSON.stringify(cases));
  console.log('holatlar:', n);
} else if (mode === 'cmp') {
  const cases = JSON.parse(fs.readFileSync(a));
  const results = JSON.parse(fs.readFileSync(b));
  const e = new Engine(globalThis.KALK_MODEL);
  let bad = 0, total = 0;
  const skip = new Set(['Mijoz uchun!A46', 'Buyurtma!C21', 'Mijoz uchun!C38']); // sana/locale matnlari
  cases.forEach((cs, i) => {
    e.clearOverrides();
    e.setMany(cs);
    for (const [k, exp] of Object.entries(results[i])) {
      if (skip.has(k) || k in cs) continue;
      total++;
      let got;
      try { got = e.get(k); } catch (err) { got = 'EXC ' + err.message; }
      if (!same(exp, got)) {
        bad++;
        if (bad <= 30) console.log('#' + i, k, 'LO:', JSON.stringify(exp), 'dvigatel:', JSON.stringify(got && got.e ? got.e : got));
      }
    }
  });
  console.log(`tekshirildi ${total}, farq ${bad}`);
  process.exit(bad ? 1 : 0);
}
