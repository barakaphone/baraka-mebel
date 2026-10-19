// Sozlamalar: kalkulyator kataklari (kurs, ustama, xom ashyo narxlari, tariflar, texnik parametrlar)
// va umumiy ro'yxatlar. Admin hammasini, mebel rahbari faqat xom ashyo narxlarini o'zgartiradi.
import { doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { esc, parseNum, toast, errText } from './util.js';

const K = window.KALK;

const TABS_ADMIN = [
  { id: 'umumiy', t: 'Umumiy' }, { id: 'narx', t: 'Kurs va ustama' }, { id: 'laminat', t: 'Xom ashyo: laminat' },
  { id: 'krasheniy', t: 'Xom ashyo: krasheniy' }, { id: 'matras', t: 'Matras' }, { id: 'oshxona', t: 'Oshxona narxlari' },
  { id: 'tarif', t: "Muddatli to'lov" }, { id: 'texnik', t: 'Texnik parametrlar' },
];
const TABS_RAHBAR = [
  { id: 'laminat', t: 'Laminat' }, { id: 'krasheniy', t: 'Krasheniy' }, { id: 'matras', t: 'Matras' }, { id: 'oshxona', t: 'Oshxona' },
];

let curTab = null;

export function renderSettings(page, ctx) {
  const { S } = ctx;
  const tabs = S.me.role === 'admin' ? TABS_ADMIN : TABS_RAHBAR;
  if (!tabs.some(t => t.id === curTab)) curTab = tabs[0].id;
  const st = { kalk: S.settings.kalk, xom: S.settings.xom, ustaFoizSp: S.settings.main.ustaFoizSp, ustaFoizKor: S.settings.main.ustaFoizKor };
  const cur = key => K.current(key, st);
  // Katak muharriri: data-key, data-t = num | pct | text
  const inp = (key, t = 'num', extra = '') => {
    let v = cur(key);
    if (t === 'pct' && v !== '' && v !== null) v = +(Number(v) * 100).toFixed(4);
    return `<input class="inp sm" data-key="${esc(key)}" data-t="${t}" value="${esc(v ?? '')}" ${t !== 'text' ? 'inputmode="decimal"' : ''} ${extra}>`;
  };
  const sel = (key, opts) => `<select class="inp sm" data-key="${esc(key)}" data-t="text">${opts.map(o => `<option ${String(o) === String(cur(key)) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;

  let body = '';
  const rows = K.sozlamalarRows();
  const rowTable = list => `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Guruh</th><th>Parametr</th><th>Qiymat</th><th>Birlik</th><th>Izoh</th></tr></thead><tbody>
    ${list.map(r => `<tr><td>${esc(r.group || '')}</td><td>${esc(r.label)}</td><td style="min-width:130px">${r.opts ? sel(r.key, r.opts) : inp(r.key, r.pct ? 'pct' : r.text ? 'text' : 'num')}</td><td>${esc(r.pct ? '%' : r.unit)}</td><td class="hint">${esc(r.note)}</td></tr>`).join('')}
  </tbody></table></div>`;

  switch (curTab) {
    case 'umumiy': {
      const m = S.settings.main;
      const listEd = (name, arr) => `<div class="listedit" data-list="${name}">${arr.map(v => `<div class="it"><input class="inp" value="${esc(v)}" maxlength="80"><button type="button" class="btn sec sm" data-rm>×</button></div>`).join('')}
        <button type="button" class="btn sec sm" data-addit="${name}">+ Qo'shish</button></div>`;
      body = `<div class="row2" style="align-items:flex-start">
        <div class="card"><h3>Mebel kategoriyalari</h3>${listEd('kategoriyalar', m.kategoriyalar)}</div>
        <div class="card"><h3>Murojaat statuslari</h3>${listEd('statuslar', m.statuslar)}</div></div>
        <div class="card"><h3>Hisobda ishlatiladigan usta foizi</h3>
          <p class="hint">Sotuvchi narx hisoblaganda usta hali biriktirilmagan bo'ladi. Shuning uchun narx shu standart foiz bilan hisoblanadi. Usta biriktirilganda uning haqi o'z kelishuv foizi bo'yicha alohida hisoblanadi.</p>
          <div class="row2"><div class="field"><label>Spalniy garnitur, %</label><input class="inp" id="ufSp" inputmode="decimal" value="${esc(+((m.ustaFoizSp || 0) * 100).toFixed(2))}"></div>
          <div class="field"><label>Korpus mebel, %</label><input class="inp" id="ufKor" inputmode="decimal" value="${esc(+((m.ustaFoizKor || 0) * 100).toFixed(2))}"></div></div></div>
        <div class="card"><h3>Kompaniya (PDF narx taklifida)</h3>${rowTable(rows.filter(r => r.text))}</div>`;
      break;
    }
    case 'narx':
      body = `<p class="hint">Kurs o'zgarsa faqat "Joriy kurs" ni yangilang — "kursga bog'liq" narxlar o'zi qayta hisoblanadi.</p>
        ${rowTable(rows.filter(r => /^1\./.test(r.section) && !r.text).concat(rows.filter(r => /^7\./.test(r.section))))}`;
      break;
    case 'matras':
      body = rowTable(rows.filter(r => /^3\./.test(r.section)));
      break;
    case 'texnik':
      body = `<div class="note">Bu qiymatlar detallarni hisoblashda ishlatiladi. "TAXMIN — tasdiqlang" belgili qatorlarni tekshirib chiqing.</div>
        ${rowTable(rows.filter(r => /^[48]\./.test(r.section)))}`;
      break;
    case 'laminat':
    case 'krasheniy': {
      const xr = K.xomRows(curTab);
      body = `<p class="hint">Narx 1 birlik uchun. "Kursga bog'liq" — narx kiritilgan kundagi kursda yozilgan, kurs o'zgarsa avtomatik qayta hisoblanadi. Otxod — zapas foizi.</p>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Guruh</th><th>Xom ashyo</th><th>Birlik</th><th>Otxod, %</th><th>Narx turi</th><th>Narx</th><th>Izoh</th></tr></thead><tbody>
        ${xr.map(r => `<tr><td>${esc(r.group || '')}</td><td>${esc(K.xomName(r, st))}</td><td>${esc(r.unit)}</td>
          <td style="min-width:80px">${r.otx.ro ? '<span class="muted">—</span>' : inp(r.otx.key, 'pct')}</td>
          <td style="min-width:170px">${r.tur.ro ? '<span class="muted">—</span>' : sel(r.tur.key, K.NARX_TURI)}</td>
          <td style="min-width:120px">${r.narx.ro ? '<span class="muted">Laminatdan olinadi</span>' : inp(r.narx.key, 'num')}</td>
          <td class="hint">${esc(r.izoh)}</td></tr>`).join('')}
        </tbody></table></div>`;
      break;
    }
    case 'oshxona':
      body = `<p class="hint">1 pogon metr narxi, dollarda. Yangi xomashyo yoki balandlik qo'shsangiz, kalkulyator ro'yxatida o'zi paydo bo'ladi.</p>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Xomashyo</th><th>Balandligi (m)</th><th>1 m narxi ($)</th><th>Izoh</th></tr></thead><tbody>
        ${K.oshxonaNarxRows().map(r => `<tr><td>${inp(r.mat, 'text')}</td><td>${inp(r.bal, 'num')}</td><td>${inp(r.narx, 'num')}</td><td>${inp(r.izoh, 'text')}</td></tr>`).join('')}
        </tbody></table></div>`;
      break;
    case 'tarif':
      body = `<p class="hint">Oylik ustama oldindan to'lov ulushiga qarab olinadi: "dan" ustunidagi foizdan boshlab shu qator ishlaydi. Masalan, 19,5% → 0% qatori, 20% → 20% qatori.</p>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Muddat (oy)</th><th>Oldindan to'lov: dan, %</th><th>gacha, %</th><th>Oylik ustama, %</th><th>Izoh</th></tr></thead><tbody>
        ${K.tarifRows().map(r => `<tr><td>${inp(r.oy, 'num')}</td><td>${inp(r.dan, 'pct')}</td><td>${inp(r.gacha, 'pct')}</td><td>${inp(r.ustama, 'pct')}</td><td>${inp(r.izoh, 'text')}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="card" style="margin-top:12px"><div class="row2">
          <div class="field"><label>Ustama hisoblanadigan summa</label>${sel('Tariflar!C28', ["Qoldiq (narx − oldindan to'lov)", "To'liq narx"])}</div>
          <div class="field"><label>Kalkulyatordagi muddatlar (oy)</label><div class="row2">${['B', 'C', 'D', 'E'].map(c => inp('Tariflar!' + c + '29', 'num')).join('')}</div></div>
        </div></div>`;
      break;
  }

  page.innerHTML = `<h2>${S.me.role === 'admin' ? 'Sozlamalar' : 'Xom ashyo narxlari'}</h2>
    <div class="chips">${tabs.map(t => `<button class="chip ${t.id === curTab ? 'on' : ''}" data-st="${t.id}">${esc(t.t)}</button>`).join('')}</div>
    <div id="setBody">${body}</div>
    <div class="res-bar"><div class="in"><div class="price"><span>O'zgarishlar faqat "Saqlash" bosilgandan keyin kuchga kiradi.</span></div><button class="btn pri" id="saveSet">Saqlash</button></div></div>`;

  page.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { curTab = b.dataset.st; renderSettings(page, ctx); });
  page.querySelectorAll('[data-addit]').forEach(b => b.onclick = () => {
    const div = document.createElement('div'); div.className = 'it';
    div.innerHTML = `<input class="inp" maxlength="80"><button type="button" class="btn sec sm" data-rm>×</button>`;
    b.before(div); div.querySelector('input').focus();
  });
  page.addEventListener('click', e => { const r = e.target.closest('[data-rm]'); if (r) r.parentElement.remove(); });

  page.querySelector('#saveSet').onclick = async () => {
    const btn = page.querySelector('#saveSet'); btn.disabled = true;
    try {
      const kalk = {}, xom = {};
      page.querySelectorAll('[data-key]').forEach(el => {
        const key = el.dataset.key, t = el.dataset.t, raw = el.value.trim();
        let v;
        if (raw === '') v = '';
        else if (t === 'text') v = raw;
        else if (t === 'pct') v = parseNum(raw) / 100;
        else v = parseNum(raw);
        (K.isXomKey(key) ? xom : kalk)[key] = v;
      });
      const isAdmin = S.me.role === 'admin';
      const writes = [];
      if (Object.keys(xom).length) writes.push(setDoc(doc(ctx.db, 'settings', 'xom'), { cells: xom, updatedAt: serverTimestamp(), by: S.me.fullName || '' }, { merge: true }));
      if (isAdmin && Object.keys(kalk).length) writes.push(setDoc(doc(ctx.db, 'settings', 'kalk'), { cells: kalk, updatedAt: serverTimestamp() }, { merge: true }));
      if (isAdmin && curTab === 'umumiy') {
        const list = n => [...page.querySelectorAll(`[data-list="${n}"] .it input`)].map(i => i.value.trim()).filter(Boolean);
        const main = { kategoriyalar: list('kategoriyalar'), statuslar: list('statuslar'),
          ustaFoizSp: parseNum(page.querySelector('#ufSp').value) / 100, ustaFoizKor: parseNum(page.querySelector('#ufKor').value) / 100 };
        if (!main.kategoriyalar.length || !main.statuslar.length) throw new Error("Ro'yxat bo'sh bo'lmasin");
        writes.push(setDoc(doc(ctx.db, 'settings', 'main'), main, { merge: true }));
      }
      await Promise.all(writes);
      await ctx.loadStatic();
      toast('Saqlandi');
      renderSettings(page, ctx);
    } catch (e) { toast(errText(e), true); btn.disabled = false; }
  };
}
