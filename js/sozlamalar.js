// Sozlamalar: kalkulyator kataklari (kurs, ustama, xom ashyo narxlari, tariflar, texnik parametrlar),
// umumiy ro'yxatlar va rollar. Admin hammasini, "xom ashyo narxlari" ruxsati borlar faqat narxlarni o'zgartiradi.
import { doc, setDoc, serverTimestamp, arrayUnion } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { esc, parseNum, toast, errText, modal, confirmBox, moneyFmt } from './util.js';
import { PERM_GROUPS, DEFAULT_ROLES, mergeRoles } from './perms.js';

const K = window.KALK;

const TABS_ADMIN = [
  { id: 'umumiy', t: 'Umumiy' }, { id: 'narx', t: 'Kurs va ustama' }, { id: 'laminat', t: 'Xom ashyo: laminat' },
  { id: 'krasheniy', t: 'Xom ashyo: krasheniy' }, { id: 'matras', t: 'Matras' }, { id: 'oshxona', t: 'Oshxona narxlari' },
  { id: 'tarif', t: "Muddatli to'lov" }, { id: 'texnik', t: 'Texnik parametrlar' }, { id: 'rollar', t: 'Rollar va ruxsatlar' },
];
const TABS_XOM = [
  { id: 'laminat', t: 'Laminat' }, { id: 'krasheniy', t: 'Krasheniy' }, { id: 'matras', t: 'Matras' }, { id: 'oshxona', t: 'Oshxona' },
];
const GROUPS = ['Asosiy', 'Furnitura', 'Xizmat', 'Qadoqlash', 'Bo\'yoq', 'Boshqa'];
const UNITS = ['dona', 'm', 'm²', 'list', 'kg', 'litr', 'juft', 'komplekt', 'tuba', 'rulon'];
const VARIANTS = [['ikkalasi', 'Laminat va krasheniy'], ['laminat', 'Faqat laminat'], ['krasheniy', 'Faqat krasheniy']];

let curTab = null;
const isNum = v => typeof v === 'number' || (v !== '' && v !== null && !isNaN(Number(v)));
const showNum = v => (isNum(v) && Number.isInteger(Number(v)) && Math.abs(Number(v)) >= 1000) ? moneyFmt(String(v)) : (v ?? '');

export function renderSettings(page, ctx) {
  const { S } = ctx;
  const admin = S.me.role === 'admin';
  const tabs = admin ? TABS_ADMIN : TABS_XOM;
  if (!tabs.some(t => t.id === curTab)) curTab = tabs[0].id;
  const st = { kalk: S.settings.kalk, xom: S.settings.xom };
  const cur = key => K.current(key, st);
  // Katak muharriri: data-key, data-t = num | pct | text | money
  const inp = (key, t = 'num', extra = '') => {
    let v = cur(key);
    if (t === 'pct' && v !== '' && v !== null) v = +(Number(v) * 100).toFixed(4);
    if (t === 'money') v = moneyFmt(String(v ?? ''));
    if (t === 'num') v = showNum(v);
    return `<input class="inp sm" data-key="${esc(key)}" data-t="${t}" value="${esc(v ?? '')}" ${t === 'money' ? 'data-money inputmode="numeric"' : t !== 'text' ? 'inputmode="decimal"' : ''} ${extra}>`;
  };
  const sel = (key, opts) => `<select class="inp sm" data-key="${esc(key)}" data-t="text">${opts.map(o => `<option ${String(o) === String(cur(key)) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;

  let body = '';
  const rows = K.sozlamalarRows();
  const rowTable = list => `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Guruh</th><th>Parametr</th><th>Qiymat</th><th>Birlik</th><th>Izoh</th></tr></thead><tbody>
    ${list.map(r => `<tr><td>${esc(r.group || '')}</td><td>${esc(r.label)}</td><td style="min-width:130px">${r.opts ? sel(r.key, r.opts) : inp(r.key, r.pct ? 'pct' : r.text ? 'text' : /so'm/.test(r.unit) ? 'money' : 'num')}</td><td>${esc(r.pct ? '%' : r.unit)}</td><td class="hint">${esc(r.note)}</td></tr>`).join('')}
  </tbody></table></div>`;
  let saveable = true;

  switch (curTab) {
    case 'umumiy': {
      const m = S.settings.main;
      const listEd = (name, arr, fixedFirst) => `<div class="listedit" data-list="${name}">${arr.map((v, i) => `<div class="it"><input class="inp" value="${esc(v)}" maxlength="80" ${fixedFirst && i === 0 ? 'readonly title="Bu status o\'zgarmaydi"' : ''}>${fixedFirst && i === 0 ? '<span class="badge grey" style="align-self:center">doim</span>' : '<button type="button" class="btn sec sm" data-rm>×</button>'}</div>`).join('')}
        <button type="button" class="btn sec sm" data-addit="${name}">+ Qo'shish</button></div>`;
      body = `<div class="row2" style="align-items:flex-start">
        <div class="card"><h3>Mebel kategoriyalari</h3>${listEd('kategoriyalar', m.kategoriyalar)}</div>
        <div class="card"><h3>Murojaat statuslari</h3><p class="hint" style="margin-top:-6px">Yangi murojaat doim "Yangi murojaat" statusi bilan tushadi.</p>${listEd('statuslar', m.statuslar, true)}</div></div>
        <div class="row2" style="align-items:flex-start">
          <div class="card"><h3>Rasmlar</h3><div class="field"><label>O'lchov va yetkazishda kamida necha rasm</label><input class="inp" id="minRasm" inputmode="numeric" value="${esc(m.minRasm || 4)}"></div></div>
          <div class="card"><h3>Usta muddati</h3><div class="field"><label>Muddatdan o'tsa jarima, %</label><input class="inp" id="jarimaFoiz" inputmode="decimal" value="${esc(m.jarimaFoiz ?? 30)}"><div class="hint">Usta ishni qabul qilayotganda ogohlantirish sifatida ko'rsatiladi. 0 — ko'rsatilmaydi.</div></div></div>
        </div>
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
      const sheet = curTab === 'laminat' ? 'Laminat xom ashyo' : 'Krasheniy xom ashyo';
      const deleted = new Set(S.settings.xomDeleted);
      const xr = K.xomRows(curTab);
      const forTab = c => c.variant === 'ikkalasi' || c.variant === curTab || !c.variant;
      const custom = S.settings.xomCustom.filter(c => !c.deleted && forTab(c));
      const customDel = S.settings.xomCustom.filter(c => c.deleted && forTab(c));
      body = `<p class="hint">Narx 1 birlik uchun. "Kursga bog'liq" — narx kiritilgan kundagi kursda yozilgan, kurs o'zgarsa avtomatik qayta hisoblanadi. Otxod — zapas foizi.</p>
        <div class="toolbar"><button class="btn pri sm" id="addXom">+ Xom ashyo qo'shish</button><button class="btn gold sm" id="addFur">+ Furnitura qo'shish</button></div>
        ${custom.length ? `<h3>Qo'shilgan xom ashyo va furnituralar</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Guruh</th><th>Xom ashyo</th><th>Birlik</th><th>Otxod</th><th>Narx</th><th>Sarf (1 donaga)</th><th></th></tr></thead><tbody>
          ${custom.map(c => `<tr><td>${esc(c.group || '')}</td><td><b>${esc(c.name)}</b><div class="hint">${esc(VARIANTS.find(v => v[0] === c.variant)?.[1] || '')}${c.izoh ? ' · ' + esc(c.izoh) : ''}</div></td><td>${esc(c.unit)}</td><td>${esc(+(Number(c.otx || 0) * 100).toFixed(2))}%</td>
            <td>${esc(showNum(c.narx))} <span class="hint">${esc(c.tur === 'Dollar' ? '$' : "so'm")}</span></td>
            <td class="hint">${K.SARF_KEYS.filter(([k]) => Number(c.sarf?.[k])).map(([k, l]) => `${esc(l)}: ${c.sarf[k]}`).join(', ') || '—'}</td>
            <td style="white-space:nowrap"><button class="btn sec sm" data-cedit="${esc(c.id)}">Tahrirlash</button> <button class="btn sec sm" data-cdel="${esc(c.id)}">🗑</button></td></tr>`).join('')}
        </tbody></table></div>` : ''}
        ${customDel.length ? `<details class="grp" style="margin-top:10px"><summary>O'chirilgan qo'shimchalar — ${customDel.length} ta</summary><div style="padding:0 10px 10px">${customDel.map(c => `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--line)"><span><b>${esc(c.name)}</b> <span class="hint">${esc(c.group || '')}</span></span><button class="btn sec sm" data-crest="${esc(c.id)}">↺ Tiklash</button></div>`).join('')}</div></details>` : ''}
        ${custom.length || customDel.length ? `<h3>Asosiy ro'yxat</h3>` : ''}
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Guruh</th><th>Xom ashyo</th><th>Birlik</th><th>Otxod, %</th><th>Narx turi</th><th>Narx</th><th>Izoh</th><th></th></tr></thead><tbody>
        ${xr.map(r => { const dk = `${sheet}#${r.r}`, del = deleted.has(dk); return `<tr style="${del ? 'opacity:.45' : ''}"><td>${esc(r.group || '')}</td><td>${esc(K.xomName(r, st))}${del ? ' <span class="badge grey">o\'chirilgan</span>' : ''}</td><td>${esc(r.unit)}</td>
          <td style="min-width:80px">${r.otx.ro ? '<span class="muted">—</span>' : inp(r.otx.key, 'pct')}</td>
          <td style="min-width:170px">${r.tur.ro ? '<span class="muted">—</span>' : sel(r.tur.key, K.NARX_TURI)}</td>
          <td style="min-width:120px">${r.narx.ro ? '<span class="muted">Laminatdan olinadi</span>' : inp(r.narx.key, cur(r.tur.key) === 'Dollar' ? 'num' : 'money')}</td>
          <td class="hint">${esc(r.izoh)}</td>
          <td>${del ? `<button class="btn sec sm" data-undel="${esc(dk)}">Tiklash</button>` : `<button class="btn sec sm" data-bdel="${esc(dk)}" title="Hisobdan chiqarish">🗑</button>`}</td></tr>`; }).join('')}
        </tbody></table></div>`;
      break;
    }
    case 'oshxona':
      body = `<p class="hint">1 pogon metr narxi, dollarda. Yangi xomashyo yoki balandlik qo'shsangiz, kalkulyator ro'yxatida o'zi paydo bo'ladi.</p>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Xomashyo</th><th>Balandligi (m)</th><th>1 m narxi ($)</th><th>Izoh</th><th></th></tr></thead><tbody>
        ${K.oshxonaNarxRows().map(r => { const empty = cur(r.mat) === '' && cur(r.narx) === ''; return `<tr data-orow class="${empty ? 'hidden' : ''}"><td>${inp(r.mat, 'text')}</td><td>${inp(r.bal, 'num')}</td><td>${inp(r.narx, 'num')}</td><td>${inp(r.izoh, 'text')}</td><td><button type="button" class="btn sec sm" data-oclr title="Qatorni o'chirish">🗑</button></td></tr>`; }).join('')}
        </tbody></table></div>
        <button type="button" class="btn sec sm" id="oshAdd" style="margin-top:8px">+ Qator qo'shish</button>`;
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
    case 'rollar':
      body = rolesHtml(ctx);
      saveable = false;
      break;
  }

  page.innerHTML = `<h2>${admin ? 'Sozlamalar' : 'Xom ashyo narxlari'}</h2>
    <div class="chips">${tabs.map(t => `<button class="chip ${t.id === curTab ? 'on' : ''}" data-st="${t.id}">${esc(t.t)}</button>`).join('')}</div>
    <div id="setBody">${body}</div>
    ${saveable ? `<div class="res-bar"><div class="in"><div class="price"><span>O'zgarishlar faqat "Saqlash" bosilgandan keyin kuchga kiradi.</span></div><button class="btn pri" id="saveSet">Saqlash</button></div></div>` : ''}`;

  page.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { curTab = b.dataset.st; renderSettings(page, ctx); });
  page.querySelectorAll('[data-addit]').forEach(b => b.onclick = () => {
    const div = document.createElement('div'); div.className = 'it';
    div.innerHTML = `<input class="inp" maxlength="80"><button type="button" class="btn sec sm" data-rm>×</button>`;
    b.before(div); div.querySelector('input').focus();
  });
  page.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => b.parentElement.remove());
  page.querySelector('#setBody').addEventListener('click', e => {
    const r = e.target.closest('[data-rm]'); if (r) r.parentElement.remove();
    const oc = e.target.closest('[data-oclr]');
    if (oc) { const tr = oc.closest('tr'); tr.querySelectorAll('input').forEach(i => { i.value = ''; }); tr.classList.add('hidden'); }
  });
  const oa = page.querySelector('#oshAdd');
  if (oa) oa.onclick = () => { const tr = page.querySelector('[data-orow].hidden'); if (tr) { tr.classList.remove('hidden'); tr.querySelector('input').focus(); } else toast("Jadval to'ldi (30 qator)", true); };

  // Xom ashyo: qo'shish / tahrirlash / o'chirish
  const saveXomMeta = async (custom, deleted) => {
    await setDoc(doc(ctx.db, 'settings', 'xom'), { custom, deleted, updatedAt: serverTimestamp(), by: S.me.fullName || '' }, { merge: true });
    await ctx.loadStatic(); renderSettings(page, ctx);
  };
  const ax = page.querySelector('#addXom');
  if (ax) ax.onclick = () => customForm(ctx, null, curTab, async c => saveXomMeta([...S.settings.xomCustom, c], S.settings.xomDeleted), 'Asosiy');
  const af = page.querySelector('#addFur');
  if (af) af.onclick = () => customForm(ctx, null, curTab, async c => saveXomMeta([...S.settings.xomCustom, c], S.settings.xomDeleted), 'Furnitura');
  page.querySelectorAll('[data-cedit]').forEach(b => b.onclick = () => {
    const c = S.settings.xomCustom.find(x => x.id === b.dataset.cedit);
    customForm(ctx, c, curTab, async nc => saveXomMeta(S.settings.xomCustom.map(x => x.id === nc.id ? nc : x), S.settings.xomDeleted));
  });
  page.querySelectorAll('[data-cdel]').forEach(b => b.onclick = async () => {
    const c = S.settings.xomCustom.find(x => x.id === b.dataset.cdel);
    if (!await confirmBox(`"${esc(c.name)}" o'chirilsinmi?`, "O'chirish", true)) return;
    try { await saveXomMeta(S.settings.xomCustom.map(x => x.id === c.id ? { ...x, deleted: true } : x), S.settings.xomDeleted); toast("O'chirildi"); } catch (e) { toast(errText(e), true); }
  });
  page.querySelectorAll('[data-crest]').forEach(b => b.onclick = async () => {
    try { await saveXomMeta(S.settings.xomCustom.map(x => x.id === b.dataset.crest ? { ...x, deleted: false } : x), S.settings.xomDeleted); toast('Tiklandi'); } catch (e) { toast(errText(e), true); }
  });
  page.querySelectorAll('[data-bdel]').forEach(b => b.onclick = async () => {
    if (!await confirmBox("Bu xom ashyo kalkulyatorning o'zi hisoblaydigan ro'yxatda. O'chirilsa, u hisobdan chiqadi va <b>narx kamayadi</b>. Davom etasizmi?", "Hisobdan chiqarish", true)) return;
    try { await saveXomMeta(S.settings.xomCustom, [...new Set([...S.settings.xomDeleted, b.dataset.bdel])]); toast('Hisobdan chiqarildi'); } catch (e) { toast(errText(e), true); }
  });
  page.querySelectorAll('[data-undel]').forEach(b => b.onclick = async () => {
    try { await saveXomMeta(S.settings.xomCustom, S.settings.xomDeleted.filter(x => x !== b.dataset.undel)); toast('Tiklandi'); } catch (e) { toast(errText(e), true); }
  });

  if (curTab === 'rollar') bindRoles(page, ctx);

  const sv = page.querySelector('#saveSet');
  if (sv) sv.onclick = async () => {
    sv.disabled = true;
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
      const writes = [];
      if (Object.keys(xom).length) writes.push(setDoc(doc(ctx.db, 'settings', 'xom'), { cells: xom, updatedAt: serverTimestamp(), by: S.me.fullName || '' }, { merge: true }));
      if (admin && Object.keys(kalk).length) writes.push(setDoc(doc(ctx.db, 'settings', 'kalk'), { cells: kalk, updatedAt: serverTimestamp() }, { merge: true }));
      if (admin && curTab === 'umumiy') {
        const list = n => [...page.querySelectorAll(`[data-list="${n}"] .it input`)].map(i => i.value.trim()).filter(Boolean);
        const main = { kategoriyalar: list('kategoriyalar'), statuslar: list('statuslar'), minRasm: Math.max(1, Math.round(parseNum(page.querySelector('#minRasm').value)) || 4),
          jarimaFoiz: Math.min(100, Math.max(0, parseNum(page.querySelector('#jarimaFoiz').value))) };
        if (!main.kategoriyalar.length || !main.statuslar.length) throw new Error("Ro'yxat bo'sh bo'lmasin");
        writes.push(setDoc(doc(ctx.db, 'settings', 'main'), main, { merge: true }));
      }
      await Promise.all(writes);
      await ctx.loadStatic();
      toast('Saqlandi');
      renderSettings(page, ctx);
    } catch (e) { toast(errText(e), true); sv.disabled = false; }
  };
}

// Yangi xom ashyo: sarfi har bir mahsulotning 1 donasiga
function customForm(ctx, c, tab, onSave, group = 'Furnitura') {
  const fur = (c?.group || group) === 'Furnitura';
  const v = c || { group, unit: 'dona', tur: "So'm (qat'iy)", otx: 0, variant: fur ? 'ikkalasi' : tab, sarf: {} };
  const m = modal(`<h2>${c ? (fur ? 'Furniturani tahrirlash' : 'Xom ashyoni tahrirlash') : fur ? 'Yangi furnitura' : 'Yangi xom ashyo'}</h2><form id="cf">
    <div class="field"><label>Nomi *</label><input class="inp" name="name" required maxlength="80" value="${esc(v.name || '')}" placeholder="${fur ? 'Masalan: Gaz lift 100N, Petlya Blum, Ruchka 128 mm' : ''}"></div>
    <div class="row2"><div class="field"><label>Guruhi</label><select class="inp" name="group">${GROUPS.map(g => `<option ${g === v.group ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>
      <div class="field"><label>Birligi</label><select class="inp" name="unit">${UNITS.map(g => `<option ${g === v.unit ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div></div>
    <div class="row2"><div class="field"><label>Narx turi</label><select class="inp" name="tur">${K.NARX_TURI.map(g => `<option ${g === v.tur ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>
      <div class="field"><label>Narxi (1 birlik) *</label><input class="inp" name="narx" inputmode="decimal" required value="${esc(showNum(v.narx))}"></div></div>
    <div class="row2"><div class="field"><label>Otxod, %</label><input class="inp" name="otx" inputmode="decimal" value="${esc(+(Number(v.otx || 0) * 100).toFixed(2))}"></div>
      <div class="field"><label>Qaysi variantda ishlatiladi</label><select class="inp" name="variant">${VARIANTS.map(([k, l]) => `<option value="${k}" ${k === v.variant ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div></div>
    <div class="field"><label>Izoh</label><input class="inp" name="izoh" maxlength="120" value="${esc(v.izoh || '')}"></div>
    <h3>Sarfi: 1 dona mahsulotga necha ${fur ? 'dona / komplekt' : 'birlik'}</h3>
    <div class="pay-grid">${K.SARF_KEYS.map(([k, l]) => `<div class="field"><label><span class="lt">${esc(l)}</span></label><input class="inp sm" data-sarf="${k}" inputmode="decimal" value="${esc(v.sarf?.[k] || '')}" placeholder="0"></div>`).join('')}</div>
    <p class="hint">Hisob: mahsulot soni × sarf × (1 + otxod) × narx. Natija o'sha mahsulot xom ashyosiga qo'shiladi, keyin usta haqi va Baraka ustamasi ham undan hisoblanadi.</p>
    <div class="err hidden" id="cfErr"></div><button class="btn pri block">Saqlash</button></form>`, { wide: true });
  const f = m.el.querySelector('#cf');
  f.onsubmit = async e => {
    e.preventDefault();
    const err = f.querySelector('#cfErr');
    try {
      const sarf = {};
      f.querySelectorAll('[data-sarf]').forEach(i => { const n = parseNum(i.value); if (n) sarf[i.dataset.sarf] = n; });
      if (!Object.keys(sarf).length) throw new Error("Kamida bitta mahsulot uchun sarfni yozing");
      const nc = { id: c?.id || 'x' + Date.now().toString(36), name: f.name.value.trim(), group: f.group.value, unit: f.unit.value, tur: f.tur.value,
        narx: parseNum(f.narx.value), otx: parseNum(f.otx.value) / 100, variant: f.variant.value, sarf, izoh: f.izoh.value.trim() };
      if (!nc.name || !nc.narx) throw new Error('Nomi va narxini kiriting');
      await onSave(nc);
      m.close(); toast('Saqlandi');
    } catch (er) { err.textContent = errText(er); err.classList.remove('hidden'); }
  };
}

// ---------- Rollar va ruxsatlar ----------
const canEditRoles = ctx => ctx.isOwner() || (ctx.S.me.role === 'admin' && ctx.S.me.canManageRoles);
let draft = null;
function rolesHtml(ctx) {
  const { S } = ctx;
  draft = draft || JSON.parse(JSON.stringify(mergeRoles(S.rolesRaw)));
  const ed = canEditRoles(ctx);
  const ids = Object.keys(draft).filter(id => id !== 'admin' && !draft[id].deleted);
  const staffCnt = id => S.staff.filter(p => p.role === id && !p.deleted && !p.replacedBy).length;
  return `${ed ? '' : `<div class="note">Rollarni faqat tizim egasi yoki u ruxsat bergan admin o'zgartira oladi. Siz faqat ko'ra olasiz.</div>`}
    <p class="hint">Butun tizim ruxsatlarga qarab ishlaydi. Masalan, "O'lchov kiritish" ruxsati bor rol egalari o'lchovchilar ro'yxatida, "Ish bosqichlari" ruxsati borlar ustalar ro'yxatida chiqadi. Admin doim hamma narsaga ega; faqat "Usta foizi" unga alohida yoqiladi. Tizim egasida hammasi bor.</p>
    ${ed ? `<div class="toolbar"><button class="btn pri sm" id="addRole">+ Yangi rol</button><button class="btn sec sm" id="resetRoles">Standartga qaytarish</button></div>` : ''}
    <div class="tbl-wrap"><table class="tbl perm-tbl"><thead><tr><th>Ruxsat</th>
      ${ids.map(id => `<th>${ed ? `<input class="inp sm" data-rname="${esc(id)}" value="${esc(draft[id].name)}" style="min-width:110px">` : esc(draft[id].name)}
        <div class="hint">${staffCnt(id)} xodim${ed && !DEFAULT_ROLES[id] ? ` · <a href="#" data-rdel="${esc(id)}">o'chirish</a>` : ''}</div></th>`).join('')}
      <th>Admin</th></tr></thead><tbody>
      ${PERM_GROUPS.map(g => `<tr><td colspan="${ids.length + 2}" style="background:var(--surface2);font-weight:700;text-align:left">${esc(g.t)}</td></tr>` +
        g.perms.map(([k, l]) => `<tr><td>${esc(l)}</td>${ids.map(id => `<td><input type="checkbox" data-perm="${esc(id)}|${k}" ${draft[id].perms[k] ? 'checked' : ''} ${ed ? '' : 'disabled'}></td>`).join('')}
          <td>${k === 'see_usta_foiz' ? `<input type="checkbox" data-perm="admin|${k}" ${draft.admin.perms[k] ? 'checked' : ''} ${ed ? '' : 'disabled'}>` : '✓'}</td></tr>`).join('')).join('')}
    </tbody></table></div>
    ${ed ? `<div class="res-bar"><div class="in"><div class="price"><span>Ruxsatlar "Saqlash" bosilgach darhol kuchga kiradi.</span></div><button class="btn pri" id="saveRoles">Saqlash</button></div></div>` : ''}`;
}
function bindRoles(page, ctx) {
  const { S } = ctx;
  const rerender = () => renderSettings(page, ctx);
  page.querySelectorAll('[data-perm]').forEach(i => i.onchange = () => { const [id, k] = i.dataset.perm.split('|'); draft[id].perms[k] = i.checked; });
  page.querySelectorAll('[data-rname]').forEach(i => i.oninput = () => { draft[i.dataset.rname].name = i.value; });
  const ar = page.querySelector('#addRole');
  if (ar) ar.onclick = () => {
    const m = modal(`<h2>Yangi rol</h2><div class="field"><label>Rol nomi</label><input class="inp" id="rn" maxlength="40" placeholder="Masalan: Kassir, Haydovchi"></div><button class="btn pri block" id="rnb">Qo'shish</button>`);
    m.el.querySelector('#rnb').onclick = () => {
      const n = m.el.querySelector('#rn').value.trim();
      if (!n) return;
      draft['r' + Date.now().toString(36)] = { name: n, perms: {} };
      m.close(); rerender(); toast("Ruxsatlarni belgilab, Saqlash ni bosing");
    };
  };
  page.querySelectorAll('[data-rdel]').forEach(a => a.onclick = async e => {
    e.preventDefault();
    const id = a.dataset.rdel;
    const n = S.staff.filter(p => p.role === id && !p.deleted && !p.replacedBy).length;
    if (n) { toast(`Bu rolda ${n} ta xodim bor. Avval ularni boshqa rolga o'tkazing (Xodimlar → Tahrirlash).`, true); return; }
    if (!await confirmBox(`"${esc(draft[id].name)}" roli o'chirilsinmi?`, "O'chirish", true)) return;
    draft[id].deleted = true; rerender();
  });
  const rr = page.querySelector('#resetRoles');
  if (rr) rr.onclick = async () => {
    if (!await confirmBox("Standart rollarning ruxsatlari boshlang'ich holatga qaytarilsinmi? Siz yaratgan rollar saqlanadi.", 'Qaytarish')) return;
    for (const [id, r] of Object.entries(DEFAULT_ROLES)) draft[id] = JSON.parse(JSON.stringify({ name: r.name, perms: r.perms }));
    draft.admin.perms.see_usta_foiz = false;
    rerender();
  };
  const sv = page.querySelector('#saveRoles');
  if (sv) sv.onclick = async () => {
    sv.disabled = true;
    try {
      const roles = {};
      for (const [id, r] of Object.entries(draft)) {
        if (id === 'admin') { roles.admin = { name: 'Admin', perms: { see_usta_foiz: !!r.perms.see_usta_foiz } }; continue; }
        if (r.deleted && DEFAULT_ROLES[id]) continue;
        roles[id] = { name: (r.name || id).trim(), perms: Object.fromEntries(Object.entries(r.perms).filter(([, v]) => v)), ...(r.deleted ? { deleted: true } : {}) };
      }
      await setDoc(doc(ctx.db, 'settings', 'roles'), { roles, updatedAt: serverTimestamp(), by: S.me.fullName || '',
        history: arrayUnion({ t: Date.now(), n: S.me.fullName || '', m: 'Rollar va ruxsatlar yangilandi' }) });
      draft = null;
      await ctx.loadStatic();
      toast('Saqlandi');
      rerender();
    } catch (e) { toast(errText(e), true); sv.disabled = false; }
  };
}
