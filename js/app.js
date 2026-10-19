import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, updatePassword, connectAuthEmulator }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, collection, collectionGroup, query, where, onSnapshot,
  serverTimestamp, writeBatch, runTransaction, arrayUnion, deleteDoc, connectFirestoreEmulator }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig, EMU } from './firebase-config.js';
import { $, $$, esc, uzs, pct, digits, normPhone, fmtPhone, fdate, fdt, todayStr, parseNum, toast, errText, modal, confirmBox, compressImage } from './util.js';
import { mountCalc } from './calc-ui.js';
import { renderSettings } from './sozlamalar.js';
import { renderStaff, renderBranches, createStaffAccount } from './xodimlar.js';
import { downloadPdf } from './pdf.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
if (EMU) { connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); connectFirestoreEmulator(db, '127.0.0.1', 8080); }
const K = window.KALK;

export const LOGIN_DOMAIN = 'barakamebel.local';
export const emailFor = (phone, k) => k <= 1 ? `${phone}@${LOGIN_DOMAIN}` : `${phone}+v${k}@${LOGIN_DOMAIN}`;
const MAX_ALIAS = 6;

export const ROLES = {
  admin: 'Admin', rahbar: 'Mebel rahbari', sotuvchi: 'Sotuvchi',
  shartnomachi: 'Shartnomachi', olchovchi: "O'lchovchi", usta: 'Usta',
};

// Buyurtma bosqichlari
export const STAGES = {
  murojaat: { t: 'Murojaat', c: '' },
  skoring: { t: 'Shartnomachida', c: 'vio' },
  olchov: { t: "O'lchovda", c: 'gold' },
  olchandi: { t: "O'lchandi — narx tasdig'i", c: 'gold' },
  ustaga: { t: 'Ustaga biriktirish', c: 'warn' },
  usta_tasdiq: { t: "Usta tasdig'ida", c: 'warn' },
  kesish: { t: 'Xom ashyo / kesish', c: 'warn' },
  yigish: { t: "Yig'ilmoqda", c: 'warn' },
  qadoqlash: { t: 'Qadoqlanmoqda', c: 'warn' },
  yetkazish: { t: 'Yetkazishga tayyor', c: 'warn' },
  yakunlandi: { t: 'Yakunlandi', c: 'ok' },
  bekor: { t: 'Bekor qilindi', c: 'bad' },
};
const PROD = ['kesish', 'yigish', 'qadoqlash', 'yetkazish'];
const ACTIVE = s => s !== 'yakunlandi' && s !== 'bekor';
const stageBadge = s => `<span class="badge ${STAGES[s]?.c || ''}">${esc(STAGES[s]?.t || s)}</span>`;
function stagePath(o) {
  const p = ['murojaat'];
  if (o.tolovTuri === 'muddatli' || o.stage === 'skoring') p.push('skoring');
  if (o.mebelTuri !== 'tayyor') p.push('olchov', 'olchandi');
  p.push('ustaga', 'usta_tasdiq', ...PROD, 'yakunlandi');
  return p;
}

const DEF_MAIN = {
  kategoriyalar: ['Spalniy garnitur', 'Prixojka', 'Yumshoq mebel', 'Oshxona mebeli', 'Shkaf / garderob', 'Ofis mebeli', 'Boshqa'],
  statuslar: ['Narx bilish uchun', 'Mijozning uyi hali bitmagan', "O'ylab ko'radi", "Qayta qo'ng'iroq qilish", 'Buyurtma beradi'],
  ustaFoizSp: 0, ustaFoizKor: 0,
};

// ---------- Holat ----------
export const S = {
  me: null, tab: null, branches: [], staff: [], settings: { main: DEF_MAIN, kalk: {}, xom: {} },
  orders: [], ordersReady: false, view: null, filter: { q: '', chip: 'faol' }, unsub: [],
};
export const ctx = { db, auth, app, S, firebaseConfig, ROLES, rerender: () => go(S.tab) };
const role = () => S.me?.role;
const isAdmin = () => role() === 'admin';
export const calcSettings = () => ({ kalk: S.settings.kalk, xom: S.settings.xom, ustaFoizSp: S.settings.main.ustaFoizSp, ustaFoizKor: S.settings.main.ustaFoizKor });
const branchName = id => S.branches.find(b => b.id === id)?.name || '—';
const staffBy = r => S.staff.filter(p => p.role === r && p.active);
const logEntry = m => ({ t: Date.now(), u: S.me.id, n: S.me.fullName || '', m });
const show = id => ['boot', 'setup', 'login', 'app'].forEach(x => $('#' + x).classList.toggle('hidden', x !== id));

// ---------- Kirish ----------
let loggingIn = false, setupRunning = false;
async function loginWithPhone(input, pw) {
  const raw = digits(input), norm = normPhone(raw), bases = [norm];
  if (norm !== raw) bases.push(raw);
  let last = null, inactive = false;
  loggingIn = true;
  try {
    for (const base of bases) for (let k = 1; k <= MAX_ALIAS; k++) {
      try {
        const cred = await signInWithEmailAndPassword(auth, emailFor(base, k), pw);
        const ps = await getDoc(doc(db, 'profiles', cred.user.uid));
        if (ps.exists() && ps.data().active) return cred;
        inactive = true; await signOut(auth);
      } catch (e) {
        if (!/invalid-credential|user-not-found|wrong-password|invalid-email|permission-denied/.test(e.code || '')) throw e;
        last = e;
      }
    }
    throw inactive ? { code: 'x-inactive' } : (last || { code: 'auth/invalid-credential' });
  } finally { loggingIn = false; }
}

async function boot() {
  try {
    const setup = await getDoc(doc(db, 'meta', 'setup'));
    if (!setup.exists()) { show('setup'); return; }
    S.ownerId = setup.data().by || null;
    onAuthStateChanged(auth, async user => {
      if (setupRunning || loggingIn) return;
      S.unsub.forEach(f => f()); S.unsub = [];
      if (!user) { show('login'); return; }
      try {
        const ps = await getDoc(doc(db, 'profiles', user.uid));
        const p = ps.exists() ? ps.data() : null;
        if (!p || !p.active || !ROLES[p.role]) { await signOut(auth); loginError('Bu login faol emas. Admin bilan bog\'laning.'); return; }
        S.me = { id: user.uid, ...p };
        $('#meName').textContent = p.fullName || '';
        $('#meRole').textContent = ROLES[p.role] + (p.role === 'sotuvchi' && p.branchId ? ' · ' : '');
        show('app');
        $('#page').innerHTML = '<div class="loading">Ma\'lumotlar yuklanmoqda…</div>';
        await loadStatic();
        if (p.role === 'sotuvchi') $('#meRole').textContent = ROLES[p.role] + ' · ' + branchName(p.branchId);
        subscribeOrders();
        S.tab = tabsFor()[0].id;
        go(S.tab);
      } catch (e) { show('login'); loginError(errText(e)); }
    });
  } catch (e) {
    $('#bootMsg').innerHTML = `<b style="color:var(--bad)">Serverga ulanib bo'lmadi.</b><br>${esc(errText(e))}<br><br>Internetni tekshirib, sahifani yangilang.`;
  }
}
function loginError(t) { const e = $('#loginErr'); e.textContent = t; e.classList.remove('hidden'); show('login'); }

export async function loadStatic() {
  const [br, st, sm, sk, sx] = await Promise.all([
    getDocs(collection(db, 'branches')),
    getDocs(collection(db, 'profiles')),
    getDoc(doc(db, 'settings', 'main')),
    getDoc(doc(db, 'settings', 'kalk')),
    getDoc(doc(db, 'settings', 'xom')),
  ]);
  S.branches = br.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  S.staff = st.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
  S.settings = {
    main: { ...DEF_MAIN, ...(sm.exists() ? sm.data() : {}) },
    kalk: sk.exists() ? (sk.data().cells || {}) : {},
    xom: sx.exists() ? (sx.data().cells || {}) : {},
  };
}

function subscribeOrders() {
  const r = role(), uid = S.me.id;
  let q;
  const col = collection(db, 'orders');
  if (r === 'admin' || r === 'rahbar') q = col;
  else if (r === 'sotuvchi') q = query(col, where('branchId', '==', S.me.branchId || '-'));
  else if (r === 'shartnomachi') q = query(col, where('tolovTuri', '==', 'muddatli'));
  else if (r === 'olchovchi') q = query(col, where('olchovchiId', '==', uid));
  else if (r === 'usta') q = query(col, where('ustaId', '==', uid));
  S.ordersReady = false;
  S.unsub.push(onSnapshot(q, snap => {
    const stamp = id => { const o = S.orders.find(x => x.id === id); return o ? (o.updatedAt?.toMillis?.() || 0) + ':' + o.stage : ''; };
    const before = S.view?.type === 'order' ? stamp(S.view.id) : '';
    S.orders = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
    S.ordersReady = true;
    renderTabs();
    if (!S.view) { if (!document.querySelector('.modal-bg') && !['calc', 'staff', 'branches', 'settings'].includes(S.tab)) go(S.tab, true); }
    // Ochiq buyurtma faqat o'zi o'zgarganda qayta chiziladi (yozilayotgan matn yo'qolmasin)
    else if (S.view.type === 'order' && !S.view.editing && stamp(S.view.id) !== before) openOrder(S.view.id, true);
  }, e => { $('#page').innerHTML = `<div class="err">${esc(errText(e))}</div>`; }));
}

// ---------- Tablar ----------
function tabsFor() {
  const o = S.orders;
  const cnt = f => o.filter(f).length;
  switch (role()) {
    case 'admin': return [
      { id: 'dash', t: 'Bosh sahifa' },
      { id: 'orders', t: 'Buyurtmalar' },
      { id: 'calc', t: 'Kalkulyator' },
      { id: 'staff', t: 'Xodimlar' },
      { id: 'branches', t: 'Filiallar' },
      { id: 'settings', t: 'Sozlamalar' },
    ];
    case 'rahbar': return [
      { id: 'assign', t: 'Ustaga biriktirish', n: cnt(x => x.stage === 'ustaga') },
      { id: 'prod', t: 'Ishlab chiqarish', n: cnt(x => ['usta_tasdiq', ...PROD].includes(x.stage)) },
      { id: 'orders', t: 'Barcha buyurtmalar' },
      { id: 'staff', t: 'Ustalar' },
      { id: 'settings', t: 'Xom ashyo narxlari' },
      { id: 'calc', t: 'Kalkulyator' },
    ];
    case 'sotuvchi': return [
      { id: 'orders', t: 'Murojaatlar', n: cnt(x => x.stage === 'murojaat' && x.qaytaSana && x.qaytaSana <= todayStr()) + cnt(x => x.stage === 'olchandi') || 0 },
      { id: 'calc', t: 'Kalkulyator' },
    ];
    case 'shartnomachi': return [
      { id: 'skoring', t: 'Tekshiruv', n: cnt(x => x.stage === 'skoring') },
      { id: 'orders', t: 'Tarix' },
    ];
    case 'olchovchi': return [
      { id: 'olchov', t: "O'lchovlar", n: cnt(x => x.stage === 'olchov') },
      { id: 'orders', t: 'Bajarilgan' },
    ];
    case 'usta': return [
      { id: 'work', t: 'Ishlarim', n: cnt(x => ['usta_tasdiq', ...PROD].includes(x.stage)) },
      { id: 'orders', t: 'Tugallangan' },
    ];
  }
  return [];
}
function renderTabs() {
  $('#tabs').innerHTML = tabsFor().map(t => `<button data-tab="${t.id}" class="${S.tab === t.id && !S.view ? 'on' : ''}">${esc(t.t)}${t.n ? `<span class="cnt">${t.n}</span>` : ''}</button>`).join('');
}
$('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { S.tab = b.dataset.tab; S.view = null; go(S.tab); window.scrollTo(0, 0); } });

function go(tab, soft) {
  if (!S.me) return;
  if (!soft) S.view = null;
  renderTabs();
  const page = $('#page');
  if (!S.ordersReady && !['calc', 'staff', 'branches', 'settings'].includes(tab)) { page.innerHTML = '<div class="loading">Yuklanmoqda…</div>'; return; }
  switch (tab) {
    case 'dash': return renderDash(page);
    case 'orders': return renderOrderList(page, defaultListFilter());
    case 'assign': return renderOrderList(page, { stages: ['ustaga'], title: 'Ustaga biriktirilishi kerak', noChips: true });
    case 'prod': return renderOrderList(page, { stages: ['usta_tasdiq', ...PROD], title: 'Ishlab chiqarishda', noChips: true, groupByUsta: true });
    case 'skoring': return renderOrderList(page, { stages: ['skoring'], title: 'Tekshiruv kutilmoqda', noChips: true });
    case 'olchov': return renderOrderList(page, { stages: ['olchov'], title: "O'lchash kerak", noChips: true });
    case 'work': return renderOrderList(page, { stages: ['usta_tasdiq', ...PROD], title: 'Mening ishlarim', noChips: true });
    case 'calc': return renderCalcPage(page);
    case 'staff': return renderStaff(page, ctx);
    case 'branches': return renderBranches(page, ctx);
    case 'settings': return renderSettings(page, ctx);
  }
}
ctx.go = go;

function defaultListFilter() {
  const r = role();
  if (r === 'shartnomachi') return { title: 'Tekshirilgan buyurtmalar', exclude: ['skoring'] };
  if (r === 'olchovchi') return { title: "O'lchangan buyurtmalar", exclude: ['olchov'] };
  if (r === 'usta') return { title: 'Tugallangan ishlar', stages: ['yakunlandi'] };
  return { title: r === 'sotuvchi' ? 'Murojaatlar' : 'Buyurtmalar', chips: true, newBtn: r === 'sotuvchi' || r === 'admin' };
}

// ---------- Bosh sahifa (admin) ----------
async function renderDash(page) {
  const o = S.orders;
  const by = s => o.filter(x => x.stage === s).length;
  page.innerHTML = `<h2>Bosh sahifa</h2>
    <div class="stats">
      ${['murojaat', 'skoring', 'olchov', 'olchandi', 'ustaga', 'usta_tasdiq', 'kesish', 'yigish', 'qadoqlash', 'yetkazish', 'yakunlandi', 'bekor']
        .map(s => `<button class="stat" data-st="${s}"><b>${by(s)}</b><span>${esc(STAGES[s].t)}</span></button>`).join('')}
    </div>
    <h3>Filiallar bo'yicha (faol buyurtmalar)</h3>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Filial</th><th class="r">Murojaat</th><th class="r">Jarayonda</th><th class="r">Yakunlangan</th><th class="r">Bu oy sotuv</th></tr></thead><tbody id="brStats">
      ${S.branches.map(b => { const bo = o.filter(x => x.branchId === b.id); return `<tr><td>${esc(b.name)}</td><td class="r">${bo.filter(x => x.stage === 'murojaat').length}</td><td class="r">${bo.filter(x => ACTIVE(x.stage) && x.stage !== 'murojaat').length}</td><td class="r">${bo.filter(x => x.stage === 'yakunlandi').length}</td><td class="r" data-br="${b.id}">…</td></tr>`; }).join('')}
    </tbody></table></div>
    <p class="hint">"Bu oy sotuv" — shu oy rasmiylashtirilgan buyurtmalarning naqd narxi yig'indisi.</p>`;
  page.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { S.tab = 'orders'; S.filter.chip = 'all'; S.filter.stage = b.dataset.st; go('orders'); });
  try {
    const ms = new Date(); ms.setDate(1); ms.setHours(0, 0, 0, 0);
    const snap = await getDocs(collectionGroup(db, 'pul'));
    const sums = {};
    const formal = new Set(o.filter(x => x.formalAt && x.formalAt >= ms.getTime() && x.stage !== 'bekor').map(x => x.id));
    snap.docs.forEach(d => { const oid = d.ref.parent.parent.id; if (formal.has(oid)) { const p = d.data(); sums[p.branchId] = (sums[p.branchId] || 0) + (p.result?.naqd || 0); } });
    page.querySelectorAll('[data-br]').forEach(td => td.textContent = uzs(sums[td.dataset.br] || 0));
  } catch (e) { page.querySelectorAll('[data-br]').forEach(td => td.textContent = '—'); }
}

// ---------- Buyurtmalar ro'yxati ----------
function renderOrderList(page, f) {
  let list = S.orders.slice();
  if (f.stages) list = list.filter(x => f.stages.includes(x.stage));
  if (f.exclude) list = list.filter(x => !f.exclude.includes(x.stage));
  const chips = [
    { id: 'faol', t: 'Faol', f: x => ACTIVE(x.stage) },
    { id: 'murojaat', t: 'Murojaatlar', f: x => x.stage === 'murojaat' },
    { id: 'jarayon', t: 'Jarayonda', f: x => ACTIVE(x.stage) && x.stage !== 'murojaat' },
    { id: 'qayta', t: "Bugun qo'ng'iroq", f: x => x.stage === 'murojaat' && x.qaytaSana && x.qaytaSana <= todayStr() },
    { id: 'yakunlandi', t: 'Yakunlangan', f: x => x.stage === 'yakunlandi' },
    { id: 'bekor', t: 'Bekor', f: x => x.stage === 'bekor' },
    { id: 'all', t: 'Barchasi', f: () => true },
  ];
  if (f.chips) {
    const c = chips.find(c => c.id === S.filter.chip) || chips[0];
    list = list.filter(c.f);
    if (S.filter.stage) list = list.filter(x => x.stage === S.filter.stage);
  }
  const q = S.filter.q.trim().toLowerCase();
  if (q) list = list.filter(x => [x.client?.name, x.client?.phone, String(x.no), x.kategoriya, x.sellerName].join(' ').toLowerCase().includes(q));
  if (isAdmin() && S.filter.branch) list = list.filter(x => x.branchId === S.filter.branch);

  const item = o => {
    const alert = o.stage === 'murojaat' && o.qaytaSana && o.qaytaSana <= todayStr();
    return `<button class="oitem ${alert ? 'alert' : ''}" data-open="${o.id}">
      <div class="top"><span class="nm">${esc(o.client?.name || 'Nomsiz')}</span>${stageBadge(o.stage)}</div>
      <div class="meta"><span class="no">№${o.no || '—'}</span><span>${esc(o.kategoriya || '')}</span><span>${o.mebelTuri === 'tayyor' ? 'Tayyor' : "Yig'iladigan"}</span>
        ${role() !== 'usta' ? `<span>${esc(fmtPhone(o.client?.phone))}</span>` : ''}
        ${role() === 'admin' || role() === 'rahbar' || role() === 'shartnomachi' ? `<span>${esc(branchName(o.branchId))}</span>` : ''}
        ${o.ustaName && role() !== 'usta' ? `<span>Usta: ${esc(o.ustaName)}</span>` : ''}
        ${o.stage === 'murojaat' ? `<span>${esc(o.status || '')}${o.qaytaSana ? ' · qayta: ' + esc(o.qaytaSana.split('-').reverse().join('.')) : ''}</span>` : ''}
        <span>${fdate(o.updatedAt)}</span></div>
    </button>`;
  };
  let body;
  if (f.groupByUsta) {
    const groups = {};
    list.forEach(o => (groups[o.ustaName || '—'] ||= []).push(o));
    body = Object.keys(groups).sort().map(k => `<h3>${esc(k)} <span class="badge grey">${groups[k].length}</span></h3><div class="olist">${groups[k].map(item).join('')}</div>`).join('');
  } else body = `<div class="olist">${list.map(item).join('')}</div>`;

  page.innerHTML = `<h2>${esc(f.title)}</h2>
    <div class="toolbar"><input class="inp" id="q" placeholder="Qidirish: ism, telefon, №" value="${esc(S.filter.q)}">
      ${isAdmin() ? `<select class="inp" id="brf" style="flex:0 1 200px"><option value="">Barcha filiallar</option>${S.branches.map(b => `<option value="${b.id}" ${S.filter.branch === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>` : ''}
      ${f.newBtn ? `<button class="btn pri" id="newOrder">+ Yangi murojaat</button>` : ''}</div>
    ${f.chips ? `<div class="chips">${chips.map(c => `<button class="chip ${S.filter.chip === c.id && !S.filter.stage ? 'on' : ''}" data-chip="${c.id}">${esc(c.t)}</button>`).join('')}
      ${S.filter.stage ? `<button class="chip on" data-chip="${esc(S.filter.chip)}">${esc(STAGES[S.filter.stage]?.t)} ✕</button>` : ''}</div>` : ''}
    ${list.length ? body : '<div class="empty">Hozircha yo\'q</div>'}`;
  const qi = $('#q');
  qi.oninput = () => { S.filter.q = qi.value; const pos = qi.selectionStart; renderOrderList(page, f); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); };
  $('#brf') && ($('#brf').onchange = e => { S.filter.branch = e.target.value; renderOrderList(page, f); });
  page.querySelectorAll('[data-chip]').forEach(b => b.onclick = () => { S.filter.chip = b.dataset.chip; S.filter.stage = null; renderOrderList(page, f); });
  page.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openOrder(b.dataset.open));
  $('#newOrder') && ($('#newOrder').onclick = () => newOrderForm());
}

// ---------- Yangi murojaat ----------
async function nextNo() {
  return runTransaction(db, async tx => {
    const ref = doc(db, 'meta', 'counter');
    const s = await tx.get(ref);
    const n = (s.exists() ? s.data().n : 0) + 1;
    tx.set(ref, { n });
    return n;
  });
}

function clientFormHtml(o = {}) {
  const m = S.settings.main;
  return `
    <div class="field"><label>Mijoz ismi *</label><input class="inp" name="name" required maxlength="80" value="${esc(o.client?.name || '')}"></div>
    <div class="field"><label>Telefon raqami *</label><input class="inp" name="phone" inputmode="tel" required placeholder="90 123 45 67" value="${esc(o.client?.phone ? fmtPhone(o.client.phone) : '')}"></div>
    <div class="field"><label>Manzil</label><input class="inp" name="address" maxlength="200" value="${esc(o.client?.address || '')}"></div>
    <div class="row2">
      <div class="field"><label>Mebel turi *</label><select class="inp" name="mebelTuri"><option value="yigiladigan" ${o.mebelTuri !== 'tayyor' ? 'selected' : ''}>Yig'iladigan (o'lchov bilan)</option><option value="tayyor" ${o.mebelTuri === 'tayyor' ? 'selected' : ''}>Tayyor mebel</option></select></div>
      <div class="field"><label>Kategoriya *</label><select class="inp" name="kategoriya">${m.kategoriyalar.map(k => `<option ${k === o.kategoriya ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
    </div>
    <div class="row2">
      <div class="field"><label>Murojaat statusi</label><select class="inp" name="status">${m.statuslar.map(k => `<option ${k === o.status ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
      <div class="field"><label>Qayta murojaat sanasi</label><input class="inp" type="date" name="qaytaSana" value="${esc(o.qaytaSana || '')}"></div>
    </div>
    ${isAdmin() && !o.id ? `<div class="field"><label>Filial</label><select class="inp" name="branchId">${S.branches.filter(b => b.active !== false).map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div>` : ''}
    <div class="field"><label>Izoh</label><textarea class="inp" name="izoh" maxlength="1000">${esc(o.izoh || '')}</textarea></div>`;
}
function readClientForm(form) {
  const fd = new FormData(form);
  const phone = normPhone(fd.get('phone'));
  if (phone.length < 9) throw new Error("Telefon raqamini to'liq kiriting");
  return {
    client: { name: String(fd.get('name')).trim(), phone, address: String(fd.get('address') || '').trim() },
    mebelTuri: fd.get('mebelTuri'), kategoriya: fd.get('kategoriya'), status: fd.get('status'),
    qaytaSana: fd.get('qaytaSana') || '', izoh: String(fd.get('izoh') || '').trim(),
    _branchId: fd.get('branchId'),
  };
}

function newOrderForm(prefill) {
  const m = modal(`<h2>Yangi murojaat</h2><form id="nf">${clientFormHtml()}<div class="err hidden" id="nfErr"></div><button class="btn pri block">Saqlash</button></form>`);
  const form = m.el.querySelector('#nf');
  form.onsubmit = async e => {
    e.preventDefault();
    const btn = form.querySelector('button'); btn.disabled = true;
    try {
      const d = readClientForm(form);
      const branchId = role() === 'sotuvchi' ? S.me.branchId : (d._branchId || S.branches[0]?.id);
      if (!branchId) throw new Error('Avval filial qo\'shing');
      delete d._branchId;
      const no = await nextNo();
      const ref = doc(collection(db, 'orders'));
      const b = writeBatch(db);
      b.set(ref, {
        ...d, no, branchId, sellerId: S.me.id, sellerName: S.me.fullName || '', stage: 'murojaat', tolovTuri: '', hasCalc: false,
        ish: null, olchovchiId: '', olchovchiName: '', ustaId: '', ustaName: '',
        log: [logEntry('Murojaat yaratildi')], createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      if (prefill) {
        b.set(doc(db, 'orders', ref.id, 'pul', 'main'), pulDoc(prefill.inputs, prefill.result, branchId, S.me.id));
        b.update(ref, { hasCalc: true, ish: prefill.result.ish });
      }
      await b.commit();
      m.close(); toast('Murojaat saqlandi'); openOrder(ref.id);
    } catch (er) { const x = form.querySelector('#nfErr'); x.textContent = errText(er); x.classList.remove('hidden'); btn.disabled = false; }
  };
}

function pulDoc(inputs, result, branchId, sellerId) {
  const { ish, ...res } = result;
  return { inputs, result: res, ustaBaza: result.ustaBaza || 0, branchId, sellerId, calcAt: Date.now(), calcBy: S.me.fullName || '' };
}

// ---------- Buyurtma kartochkasi ----------
async function openOrder(id, soft) {
  const o = S.orders.find(x => x.id === id);
  const page = $('#page');
  S.view = { type: 'order', id };
  renderTabs();
  if (!o) { page.innerHTML = '<div class="empty">Buyurtma topilmadi</div>'; return; }
  const canPul = ['admin', 'rahbar', 'sotuvchi', 'shartnomachi'].includes(role());
  let pul = null;
  if (canPul) {
    try { const s = await getDoc(doc(db, 'orders', id, 'pul', 'main')); pul = s.exists() ? s.data() : null; } catch (e) { pul = null; }
  }
  if (S.view?.id !== id) return;
  const scrollY = soft ? window.scrollY : 0;
  page.innerHTML = orderHtml(o, pul);
  bindOrder(page, o, pul);
  window.scrollTo(0, scrollY);
  loadPhotos(o);
}

function stepsHtml(o) {
  const path = stagePath(o);
  const cur = path.indexOf(o.stage);
  return `<div class="steps">${path.map((s, i) => `<div class="step ${i < cur ? 'done' : i === cur ? 'cur' : ''}">${esc(STAGES[s].t)}</div>`).join('')}</div>`;
}

function linesHtml(lines, withPrice) {
  if (!lines?.length) return '<p class="muted">Hisob hali qilinmagan</p>';
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mahsulot</th><th>Tavsif</th><th>Miqdori</th>${withPrice ? '<th class="r">Summa</th>' : ''}</tr></thead><tbody>
    ${lines.map(l => `<tr><td><b>${esc(l.mahsulot)}</b><div class="hint">${esc(l.bolim)}</div></td><td>${esc(l.tavsif)}</td><td>${esc(l.miqdor)}</td>${withPrice ? `<td class="r">${uzs(l.summa)}</td>` : ''}</tr>`).join('')}
  </tbody></table></div>`;
}

function moneyHtml(o, pul) {
  if (!pul?.result) return '';
  const r = pul.result, t = r.tanlangan;
  const sk = pul.skoring;
  return `<div class="card"><h3>Narx va to'lov</h3>
    ${linesHtml(r.lines, true)}
    ${['admin', 'rahbar'].includes(role()) ? `<div class="note">Tan narx: <b>${uzs(r.tan)}</b> · Ustama: <b>${uzs(r.ustama)}</b> · Xom ashyo: ${uzs(r.xomAshyo)}</div>` : ''}
    <div class="total"><div><div class="s">Naqd narx${r.chegirma ? ` (chegirma ${uzs(r.chegirma)})` : ''}</div><div class="big-num">${uzs(r.naqd)}</div></div>
      ${t.oy ? `<div><div class="s">${esc(t.turi)} · oldindan ${uzs(t.old)}</div><div class="big-num">${uzs(t.oylik)}<span class="s"> / oy</span></div><div class="s">Jami: ${uzs(t.jami)} · Qoldiq (kredit): ${uzs(t.qoldiq)}</div></div>` : '<div><div class="s">To\'lov</div><div class="big-num">Naqd</div></div>'}</div>
    ${sk ? `<div class="note ${sk.qaror === 'tasdiq' ? 'ok' : 'bad'}"><b>Shartnomachi: ${sk.qaror === 'tasdiq' ? 'Shartnoma chiqarilsin' : 'Bekor qilindi'}</b> · limit ${uzs(sk.limit)}${sk.izoh ? ' · ' + esc(sk.izoh) : ''}<div class="hint">${esc(sk.byName || '')}, ${fdt(sk.at)}</div></div>` : ''}
    ${(pul.narxTarix || []).length ? `<h3>Narx o'zgarishlari</h3><ul class="log">${pul.narxTarix.map(h => `<li>${uzs(h.eski)} → <b>${uzs(h.yangi)}</b> · ${esc(h.izoh)}<div class="t">${esc(h.n)}, ${fdt(h.t)}</div></li>`).join('')}</ul>` : ''}
    <p class="hint">Hisob: ${esc(pul.calcBy || '')}, ${fdt(pul.calcAt)}</p>
  </div>`;
}

function ishHtml(o) {
  const ish = o.ish;
  if (!ish) return '';
  return `<div class="card"><h3>Ish tarkibi</h3>${linesHtml(ish.lines, false)}
    ${ish.detallar?.length ? `<details class="grp" style="margin-top:10px"><summary>Detallar (raskroy) ro'yxati — ${ish.detallar.length} ta</summary><div style="padding:0 10px 10px"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mahsulot</th><th>Detal</th><th>Material</th><th class="r">Uzunlik</th><th class="r">Eni</th><th class="r">Soni</th></tr></thead><tbody>
      ${ish.detallar.map(d => `<tr><td>${esc(d.m)}</td><td>${esc(d.d)}</td><td>${esc(d.mat)}</td><td class="r">${d.L}</td><td class="r">${d.W}</td><td class="r">${d.n}</td></tr>`).join('')}</tbody></table></div><p class="hint">O'lchamlar mm da.</p></div></details>` : ''}
    ${ish.furnitura?.length ? `<details class="grp"><summary>Furnitura — ${ish.furnitura.length} ta</summary><div style="padding:0 10px 10px"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mahsulot</th><th>Nomi</th><th class="r">Miqdor</th></tr></thead><tbody>
      ${ish.furnitura.map(f => `<tr><td>${esc(f.m)}</td><td>${esc(f.nom)}</td><td class="r">${f.q} ${esc(f.birlik)}</td></tr>`).join('')}</tbody></table></div></div></details>` : ''}
  </div>`;
}

function orderHtml(o, pul) {
  const r = role(), me = S.me.id;
  const own = r === 'sotuvchi' || isAdmin();
  const showClientPhone = r !== 'usta';
  const actions = actionsHtml(o, pul);
  return `
    <button class="btn sec sm" id="back">← Ro'yxatga</button>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:14px 0 6px;flex-wrap:wrap">
      <h2 style="margin:0">${esc(o.client?.name || '')} <span class="no">№${o.no}</span></h2>${stageBadge(o.stage)}
    </div>
    ${o.stage !== 'bekor' ? stepsHtml(o) : ''}
    ${actions ? `<div class="card" style="border-color:var(--g);border-width:2px">${actions}</div>` : ''}
    <div class="card"><h3>Mijoz</h3><div class="kv">
      ${showClientPhone ? `<div class="k">Telefon</div><div class="v"><a href="tel:+${esc(o.client?.phone)}">${esc(fmtPhone(o.client?.phone))}</a></div>` : ''}
      <div class="k">Manzil</div><div class="v">${esc(o.client?.address || '—')}</div>
      <div class="k">Mebel turi</div><div class="v">${o.mebelTuri === 'tayyor' ? 'Tayyor mebel' : "Yig'iladigan"}</div>
      <div class="k">Kategoriya</div><div class="v">${esc(o.kategoriya || '—')}</div>
      ${r !== 'usta' && r !== 'olchovchi' ? `<div class="k">Status</div><div class="v">${esc(o.status || '—')}</div>
      <div class="k">Qayta murojaat</div><div class="v">${o.qaytaSana ? esc(o.qaytaSana.split('-').reverse().join('.')) : '—'}</div>` : ''}
      <div class="k">Filial</div><div class="v">${esc(branchName(o.branchId))}</div>
      <div class="k">Sotuvchi</div><div class="v">${esc(o.sellerName || '—')}</div>
      ${o.tolovTuri && !['usta', 'olchovchi'].includes(r) ? `<div class="k">To'lov</div><div class="v">${o.tolovTuri === 'muddatli' ? "Muddatli to'lov" : 'Naqd'}</div>` : ''}
      ${o.olchovchiName ? `<div class="k">O'lchovchi</div><div class="v">${esc(o.olchovchiName)}</div>` : ''}
      ${o.ustaName ? `<div class="k">Usta</div><div class="v">${esc(o.ustaName)}${['admin', 'rahbar', 'usta'].includes(r) && o.ustaHaqi != null ? ` · usta haqi <b>${uzs(o.ustaHaqi)}</b> (${pct(o.ustaFoiz)})` : ''}</div>` : ''}
      ${o.izoh ? `<div class="k">Izoh</div><div class="v" style="white-space:pre-wrap">${esc(o.izoh)}</div>` : ''}
      ${o.bekorSabab ? `<div class="k">Bekor sababi</div><div class="v">${esc(o.bekorSabab)}</div>` : ''}
    </div>
    ${(own && o.stage === 'murojaat' && (r !== 'sotuvchi' || o.sellerId === me || o.branchId === S.me.branchId)) || isAdmin() ? `<button class="btn sec sm" id="editClient" style="margin-top:10px">Tahrirlash</button>` : ''}
    </div>
    ${moneyHtml(o, pul)}
    ${o.olchov ? `<div class="card"><h3>O'lchov natijasi</h3><div style="white-space:pre-wrap">${esc(o.olchov.izoh || '')}</div><p class="hint">${esc(o.olchov.n || '')}, ${fdt(o.olchov.t)}</p><div class="photos" id="ph-olchov"></div></div>` : ''}
    ${['usta', 'rahbar', 'admin', 'olchovchi'].includes(r) || (r === 'sotuvchi' && !pul) ? ishHtml(o) : ''}
    ${['admin', 'sotuvchi', 'shartnomachi'].includes(r) && o.tolovTuri === 'muddatli' && o.stage !== 'murojaat' ? `<div class="card"><h3>Pasport</h3><div class="pp" id="ph-pasport"><span class="muted">Yuklanmoqda…</span></div></div>` : ''}
    ${o.stage === 'yakunlandi' ? `<div class="card"><h3>Yetkazib berish rasmlari</h3><div class="photos" id="ph-yetkazish"></div></div>` : ''}
    ${isAdmin() ? `<div class="card"><h3>Admin</h3><div class="row2"><select class="inp" id="admStage">${Object.keys(STAGES).map(s => `<option value="${s}" ${s === o.stage ? 'selected' : ''}>${esc(STAGES[s].t)}</option>`).join('')}</select><button class="btn sec" id="admStageBtn">Bosqichni o'zgartirish</button></div><p class="hint">Faqat xatoni tuzatish uchun.</p></div>` : ''}
    ${r !== 'usta' && r !== 'olchovchi' ? `<div class="card"><h3>Tarix</h3><ul class="log">${(o.log || []).slice().reverse().map(l => `<li>${esc(l.m)}<div class="t">${esc(l.n)}, ${fdt(l.t)}</div></li>`).join('')}</ul></div>` : ''}`;
}

// Har bir rol uchun shu bosqichdagi asosiy amallar
function actionsHtml(o, pul) {
  const r = role(), me = S.me.id, adm = isAdmin();
  const st = o.stage;
  const sellerOk = adm || (r === 'sotuvchi' && o.branchId === S.me.branchId);
  const pdfOk = pul?.result && (o.tolovTuri ? (o.tolovTuri === 'naqd' || pul.skoring?.qaror === 'tasdiq') : pul.result.tanlangan.oy === 0);
  const pdfBtn = (sellerOk || r === 'rahbar') && pdfOk && st !== 'bekor' ? `<button class="btn gold" data-a="pdf">⬇ PDF yuklab olish</button>` : '';
  if (st === 'murojaat' && sellerOk) {
    return `<h3 style="margin-top:0">Keyingi qadam</h3>
      <div class="row2"><button class="btn ${pul ? 'sec' : 'pri'}" data-a="calc">${pul ? 'Narxni qayta hisoblash' : 'Narx hisoblash'}</button>
      ${pul ? `<button class="btn pri" data-a="formal">Rasmiylashtirish →</button>` : ''}${pdfBtn}</div>
      <button class="btn sec sm" data-a="cancel" style="margin-top:10px">Murojaatni bekor qilish</button>`;
  }
  if (st === 'skoring' && (r === 'shartnomachi' || adm)) {
    const t = pul?.result?.tanlangan;
    return `<h3 style="margin-top:0">Shartnoma qarori</h3>
      ${pul?.skoring ? `<div class="note">Qayta tekshiruv: narx o'zgargan. Avvalgi limit ${uzs(pul.skoring.limit)}.</div>` : ''}
      <p>Kredit summasi (qoldiq): <b>${uzs(t?.qoldiq)}</b> · ${esc(t?.turi || '')}</p>
      <div class="field"><label>Summa limiti, so'm</label><input class="inp" id="skLimit" inputmode="numeric" value="${esc(pul?.skoring?.limit || t?.qoldiq || '')}"></div>
      <div class="field"><label>Izoh</label><input class="inp" id="skIzoh" maxlength="300"></div>
      <div class="row2"><button class="btn green" data-a="sk-ok">✓ Shartnoma chiqarilsin</button><button class="btn red" data-a="sk-no">✕ Shartnoma bekor qilinsin</button></div>`;
  }
  if (st === 'olchov' && (r === 'olchovchi' && o.olchovchiId === me || adm)) {
    return `<h3 style="margin-top:0">O'lchov</h3>
      <div class="field"><label>Rasmlar (joyi, devorlar, burchaklar)</label><div class="photos" id="olchovUp"></div></div>
      <div class="field"><label>Aniq o'lchamlar va izoh *</label><textarea class="inp" id="olchovIzoh" maxlength="3000" placeholder="Masalan: devor uzunligi 320 sm, shift 270 sm, chap tomonda rozetka...">${esc(o.olchovDraft || '')}</textarea></div>
      <button class="btn pri block" data-a="olchandi">O'lchandi ✓</button>`;
  }
  if (st === 'olchov' && sellerOk) {
    return `<p>O'lchovchi: <b>${esc(o.olchovchiName || '—')}</b></p><button class="btn sec" data-a="olchovchi">O'lchovchini almashtirish</button>${pdfBtn}`;
  }
  if (st === 'olchandi' && sellerOk) {
    return `<h3 style="margin-top:0">O'lchov keldi — narxni tekshiring</h3>
      <p class="hint">Aniq o'lcham bo'yicha narx o'zgarsa, qayta hisoblang va sababini yozing.</p>
      <div class="row2"><button class="btn sec" data-a="calc">Narxni qayta hisoblash</button><button class="btn pri" data-a="toUsta">Ustaga yuborish →</button>${pdfBtn}</div>`;
  }
  if ((st === 'ustaga' || st === 'usta_tasdiq') && (r === 'rahbar' || adm)) {
    const ustalar = staffBy('usta');
    return `<h3 style="margin-top:0">${st === 'ustaga' ? 'Ustaga biriktirish' : 'Ustani almashtirish'}</h3>
      <div class="field"><select class="inp" id="ustaSel"><option value="">— usta tanlang —</option>${ustalar.map(u => `<option value="${u.id}" ${u.id === o.ustaId ? 'selected' : ''}>${esc(u.fullName)} · ${pct(u.ustaFoiz || 0)}${u.mutaxassislik ? ' · ' + esc(u.mutaxassislik) : ''}</option>`).join('')}</select></div>
      <div id="ustaHaqiPrev" class="hint"></div>
      <button class="btn pri block" data-a="assign">Biriktirish</button>${pdfBtn}`;
  }
  if (o.ustaId === me || (adm && PROD.concat('usta_tasdiq').includes(st))) {
    if (st === 'usta_tasdiq') return `<h3 style="margin-top:0">Yangi ish</h3><p>Usta haqi: <b>${uzs(o.ustaHaqi)}</b> (${pct(o.ustaFoiz)})</p><button class="btn green block" data-a="u-ok">Narxni tasdiqlayman ✓</button>`;
    if (st === 'kesish') return `<button class="btn pri block" data-a="u-next">✓ Xom ashyo olib kelindi va kesildi</button>`;
    if (st === 'yigish') return `<button class="btn pri block" data-a="u-next">✓ Yig'ish tugadi</button>`;
    if (st === 'qadoqlash') return `<button class="btn pri block" data-a="u-next">✓ Qadoqlandi</button>`;
    if (st === 'yetkazish') return `<h3 style="margin-top:0">Mijozga yetkazib berish</h3><p class="hint">O'rnatilgan mebelning rasmini yuklang (kamida 1 ta).</p><div class="photos" id="yetkUp"></div><button class="btn green block" data-a="delivered" style="margin-top:12px">Mijozga yetkazib berildi ✓</button>`;
  }
  if (pdfBtn) return `<div class="row2">${pdfBtn}</div>`;
  return '';
}

function bindOrder(page, o, pul) {
  $('#back').onclick = () => { S.view = null; go(S.tab); };
  const on = (a, f) => page.querySelectorAll(`[data-a="${a}"]`).forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { await f(b); } catch (e) { toast(errText(e), true); if (e?.code) console.error(e); }
    b.disabled = false;
  });
  const upd = async (fields, msg, extra) => {
    const b = writeBatch(db);
    b.update(doc(db, 'orders', o.id), { ...fields, updatedAt: serverTimestamp(), log: arrayUnion(logEntry(msg)) });
    if (extra) extra(b);
    await b.commit();
    toast(msg);
  };
  $('#editClient') && ($('#editClient').onclick = () => {
    const m = modal(`<h2>Murojaatni tahrirlash</h2><form id="ef">${clientFormHtml(o)}<div class="err hidden" id="efErr"></div><button class="btn pri block">Saqlash</button></form>`);
    const form = m.el.querySelector('#ef');
    form.onsubmit = async e => {
      e.preventDefault();
      try {
        const d = readClientForm(form); delete d._branchId;
        if (o.stage !== 'murojaat' && d.mebelTuri !== o.mebelTuri && !isAdmin()) throw new Error("Mebel turini faqat murojaat bosqichida o'zgartirish mumkin");
        await upd(d, "Mijoz ma'lumotlari yangilandi"); m.close();
      } catch (er) { const x = form.querySelector('#efErr'); x.textContent = errText(er); x.classList.remove('hidden'); }
    };
  });
  on('calc', () => openCalcForOrder(o, pul));
  on('pdf', () => downloadPdf(o, pul, S, branchName(o.branchId)));
  on('cancel', async () => {
    const m = modal(`<h2>Murojaatni bekor qilish</h2><div class="field"><label>Sababi *</label><input class="inp" id="cs" maxlength="300"></div><button class="btn red block" id="csb">Bekor qilish</button>`);
    m.el.querySelector('#csb').onclick = async () => {
      const s = m.el.querySelector('#cs').value.trim();
      if (!s) { toast('Sababini yozing', true); return; }
      await upd({ stage: 'bekor', bekorSabab: s }, 'Murojaat bekor qilindi: ' + s); m.close();
    };
  });
  on('formal', () => formalize(o, pul, upd));
  on('olchovchi', () => pickOlchovchi(o, upd));
  // Shartnomachi
  on('sk-ok', () => skoringDecide(o, pul, 'tasdiq'));
  on('sk-no', () => skoringDecide(o, pul, 'bekor'));
  // O'lchovchi
  if ($('#olchovUp')) photoUploader($('#olchovUp'), o, 'olchov');
  on('olchandi', async () => {
    const iz = $('#olchovIzoh').value.trim();
    if (!iz) throw new Error("O'lchamlarni yozing");
    await upd({ stage: 'olchandi', olchov: { izoh: iz, t: Date.now(), n: S.me.fullName || '', u: S.me.id } }, "O'lchandi");
  });
  // Sotuvchi: o'lchovdan keyin
  on('toUsta', async () => {
    const t = pul?.result?.tanlangan;
    if (o.tolovTuri === 'muddatli' && pul?.skoring && t && t.qoldiq > (pul.skoring.limit || 0)) {
      if (!await confirmBox(`Yangi kredit summasi (${uzs(t.qoldiq)}) shartnomachi bergan limitdan (${uzs(pul.skoring.limit)}) oshdi. Buyurtma shartnomachiga qayta tekshiruvga yuboriladi.`, 'Yuborish')) return;
      await upd({ stage: 'skoring' }, 'Narx limitdan oshdi — shartnomachiga qayta yuborildi');
      return;
    }
    await upd({ stage: 'ustaga' }, 'Ustaga biriktirishga yuborildi');
  });
  // Rahbar
  const sel = $('#ustaSel');
  if (sel) {
    const prev = () => {
      const u = S.staff.find(x => x.id === sel.value);
      $('#ustaHaqiPrev').innerHTML = u ? `Usta haqi: <b>${uzs((pul?.ustaBaza || 0) * (u.ustaFoiz || 0))}</b> (${pct(u.ustaFoiz || 0)} × xom ashyo)` : '';
    };
    sel.onchange = prev; prev();
  }
  on('assign', async () => {
    const u = S.staff.find(x => x.id === sel.value);
    if (!u) throw new Error('Usta tanlang');
    const haqi = Math.round((pul?.ustaBaza || 0) * (u.ustaFoiz || 0));
    await upd({ stage: 'usta_tasdiq', ustaId: u.id, ustaName: u.fullName, ustaFoiz: u.ustaFoiz || 0, ustaHaqi: haqi }, `Usta biriktirildi: ${u.fullName}`);
  });
  // Usta
  on('u-ok', () => upd({ stage: 'kesish' }, 'Usta narxni tasdiqladi'));
  on('u-next', () => {
    const nx = { kesish: ['yigish', 'Xom ashyo keltirildi va kesildi'], yigish: ['qadoqlash', "Yig'ish tugadi"], qadoqlash: ['yetkazish', 'Qadoqlandi'] }[o.stage];
    return upd({ stage: nx[0] }, nx[1]);
  });
  if ($('#yetkUp')) photoUploader($('#yetkUp'), o, 'yetkazish');
  on('delivered', async () => {
    const n = $('#yetkUp').querySelectorAll('.ph').length;
    if (!n) throw new Error('Kamida 1 ta rasm yuklang');
    await upd({ stage: 'yakunlandi', yetkazildi: Date.now() }, `Mijozga yetkazib berildi (${n} ta rasm)`);
  });
  // Admin
  $('#admStageBtn') && ($('#admStageBtn').onclick = async () => {
    const s = $('#admStage').value;
    if (s === o.stage) return;
    if (!await confirmBox(`Bosqichni "${STAGES[s].t}" ga o'zgartirasizmi?`, "O'zgartirish")) return;
    try { await upd({ stage: s }, `Admin bosqichni o'zgartirdi: ${STAGES[o.stage]?.t} → ${STAGES[s].t}`); } catch (e) { toast(errText(e), true); }
  });
}

// ---------- Rasmiylashtirish (sotuvchi) ----------
async function formalize(o, pul, upd) {
  const t = pul.result.tanlangan;
  const muddatli = t.oy > 0;
  const needOl = o.mebelTuri !== 'tayyor';
  const ol = staffBy('olchovchi');
  const m = modal(`<h2>Rasmiylashtirish</h2>
    <div class="note">To'lov: <b>${muddatli ? esc(t.turi) + " muddatli to'lov" : 'Naqd'}</b> · naqd narx ${uzs(pul.result.naqd)}${muddatli ? `<br>Oylik ${uzs(t.oylik)}, oldindan ${uzs(t.old)}` : ''}<div class="hint">To'lov turini o'zgartirish uchun narxni qayta hisoblang.</div></div>
    ${muddatli ? `<h3>Pasport rasmlari (2 tomoni)</h3><div class="pp" id="ppUp"></div>` : ''}
    ${needOl ? `<h3>O'lchovchi</h3><select class="inp" id="olSel"><option value="">— tanlang —</option>${ol.map(u => `<option value="${u.id}" ${u.id === o.olchovchiId ? 'selected' : ''}>${esc(u.fullName)}</option>`).join('')}</select>` : ''}
    <div class="err hidden" id="fmErr"></div>
    <button class="btn pri block" id="fmBtn" style="margin-top:16px">${muddatli ? 'Shartnomachiga yuborish' : needOl ? "O'lchovga yuborish" : 'Ustaga yuborish'} →</button>`, { wide: true });
  if (muddatli) pasportUploader(m.el.querySelector('#ppUp'), o);
  m.el.querySelector('#fmBtn').onclick = async () => {
    const err = m.el.querySelector('#fmErr'); err.classList.add('hidden');
    try {
      const fields = { tolovTuri: muddatli ? 'muddatli' : 'naqd', formalAt: Date.now() };
      if (muddatli) {
        const sides = [...m.el.querySelectorAll('#ppUp [data-side]')].filter(x => x.dataset.has === '1').length;
        if (sides < 2) throw new Error("Pasportning ikkala tomoni rasmini yuklang");
      }
      if (needOl) {
        const u = S.staff.find(x => x.id === m.el.querySelector('#olSel').value);
        if (!u) throw new Error("O'lchovchini tanlang");
        fields.olchovchiId = u.id; fields.olchovchiName = u.fullName;
      }
      fields.stage = muddatli ? 'skoring' : needOl ? 'olchov' : 'ustaga';
      await upd(fields, `Rasmiylashtirildi: ${muddatli ? t.turi + ' muddatli' : 'naqd'} → ${STAGES[fields.stage].t}`);
      m.close();
    } catch (e) { err.textContent = errText(e); err.classList.remove('hidden'); }
  };
}

function pickOlchovchi(o, upd) {
  const ol = staffBy('olchovchi');
  const m = modal(`<h2>O'lchovchi</h2><select class="inp" id="olSel">${ol.map(u => `<option value="${u.id}" ${u.id === o.olchovchiId ? 'selected' : ''}>${esc(u.fullName)}</option>`).join('')}</select><button class="btn pri block" id="olBtn" style="margin-top:12px">Saqlash</button>`);
  m.el.querySelector('#olBtn').onclick = async () => {
    const u = S.staff.find(x => x.id === m.el.querySelector('#olSel').value);
    if (!u) return;
    await upd({ olchovchiId: u.id, olchovchiName: u.fullName }, `O'lchovchi: ${u.fullName}`); m.close();
  };
}

async function skoringDecide(o, pul, qaror) {
  const limit = parseNum($('#skLimit').value), izoh = $('#skIzoh').value.trim();
  if (qaror === 'tasdiq' && !limit) throw new Error('Summa limitini kiriting');
  if (qaror === 'bekor' && !izoh) throw new Error('Bekor qilish sababini izohga yozing');
  const q = pul?.result?.tanlangan?.qoldiq || 0;
  if (qaror === 'tasdiq' && limit < q && !await confirmBox(`Limit (${uzs(limit)}) kredit summasidan (${uzs(q)}) kam. Baribir shartnoma chiqarilsinmi?`, 'Ha, chiqarilsin')) return;
  const next = qaror === 'bekor' ? 'bekor' : (o.mebelTuri !== 'tayyor' && !o.olchov ? 'olchov' : 'ustaga');
  const b = writeBatch(db);
  b.update(doc(db, 'orders', o.id, 'pul', 'main'), { skoring: { limit, qaror, izoh, by: S.me.id, byName: S.me.fullName || '', at: Date.now() } });
  b.update(doc(db, 'orders', o.id), {
    stage: next, updatedAt: serverTimestamp(), ...(qaror === 'bekor' ? { bekorSabab: 'Shartnomachi: ' + izoh } : {}),
    log: arrayUnion(logEntry(qaror === 'tasdiq' ? `Shartnoma chiqarilsin (limit ${uzs(limit)})` : `Shartnoma bekor qilindi: ${izoh}`)),
  });
  await b.commit();
  toast(qaror === 'tasdiq' ? 'Tasdiqlandi' : 'Bekor qilindi');
}

// ---------- Narx hisoblash (buyurtma uchun) ----------
function openCalcForOrder(o, pul) {
  const page = $('#page');
  S.view = { type: 'order', id: o.id, editing: true };
  page.innerHTML = `<button class="btn sec sm" id="back">← Bekor qilish</button>
    <h2 style="margin-top:14px">Narx hisoblash · ${esc(o.client?.name || '')} <span class="no">№${o.no}</span></h2>
    <div id="calcRoot"></div>
    <div class="res-bar"><div class="in"><div class="price"><b id="rbPrice">—</b><span id="rbSub"></span></div>
      <button class="btn pri" id="saveCalc">Saqlash</button></div></div>`;
  $('#back').onclick = () => { S.view = { type: 'order', id: o.id }; openOrder(o.id); };
  const c = mountCalc($('#calcRoot'), {
    inputs: pul?.inputs, settings: calcSettings(), showTan: ['admin', 'rahbar'].includes(role()),
    onChange: r => { $('#rbPrice').textContent = r ? uzs(r.naqd) : '—'; $('#rbSub').textContent = r && r.tanlangan.oy ? `${r.tanlangan.turi}: ${uzs(r.tanlangan.oylik)} / oy` : 'Naqd'; },
  });
  $('#saveCalc').onclick = async () => {
    const r = c.getResult();
    if (!r || !r.naqd) { toast("Narx 0 — mahsulot qo'shing", true); return; }
    let izoh = '';
    const old = pul?.result?.naqd;
    const needReason = old && Math.round(old) !== Math.round(r.naqd) && o.stage !== 'murojaat';
    if (needReason) {
      izoh = await new Promise(res => {
        const m = modal(`<h2>Narx o'zgardi</h2><p>${uzs(old)} → <b>${uzs(r.naqd)}</b></p><div class="field"><label>O'zgartirish sababi *</label><textarea class="inp" id="rz" maxlength="500"></textarea></div><button class="btn pri block" id="rzb">Saqlash</button>`, { onClose: () => res(null) });
        m.el.querySelector('#rzb').onclick = () => { const v = m.el.querySelector('#rz').value.trim(); if (!v) { toast('Sababini yozing', true); return; } res(v); m.close(); };
      });
      if (izoh === null) return;
    }
    if (o.tolovTuri && o.stage !== 'murojaat' && ((r.tanlangan.oy > 0) !== (o.tolovTuri === 'muddatli'))) {
      toast("Rasmiylashtirilgan buyurtmada to'lov turini (naqd/muddatli) o'zgartirib bo'lmaydi", true); return;
    }
    $('#saveCalc').disabled = true;
    try {
      const b = writeBatch(db);
      const pd = pulDoc(c.getInputs(), r, o.branchId, o.sellerId);
      if (pul?.skoring) pd.skoring = pul.skoring;
      pd.narxTarix = pul?.narxTarix || [];
      if (needReason) pd.narxTarix = [...pd.narxTarix, { eski: old, yangi: r.naqd, izoh, t: Date.now(), n: S.me.fullName || '' }];
      b.set(doc(db, 'orders', o.id, 'pul', 'main'), pd);
      const msg = !old ? `Narx hisoblandi: ${uzs(r.naqd)}` : Math.round(old) === Math.round(r.naqd) ? 'Hisob yangilandi (narx o\'zgarmadi)' : `Narx o'zgardi: ${uzs(old)} → ${uzs(r.naqd)}${izoh ? ' (' + izoh + ')' : ''}`;
      b.update(doc(db, 'orders', o.id), { hasCalc: true, ish: r.ish, updatedAt: serverTimestamp(), log: arrayUnion(logEntry(msg)) });
      await b.commit();
      toast('Saqlandi');
      S.view = { type: 'order', id: o.id };
      openOrder(o.id);
    } catch (e) { toast(errText(e), true); $('#saveCalc').disabled = false; }
  };
}

// Mustaqil kalkulyator
function renderCalcPage(page) {
  page.innerHTML = `<h2>Kalkulyator</h2><p class="hint" style="margin-top:-6px">Tezkor narx hisoblash. Mijoz rozi bo'lsa, shu hisob bilan murojaat oching.</p><div id="calcRoot"></div>
    <div class="res-bar"><div class="in"><div class="price"><b id="rbPrice">—</b><span id="rbSub"></span></div>
    ${['sotuvchi', 'admin'].includes(role()) ? `<button class="btn pri" id="toOrder">Murojaat ochish</button>` : ''}</div></div>`;
  const c = mountCalc($('#calcRoot'), {
    inputs: S.calcDraft, settings: calcSettings(), showTan: ['admin', 'rahbar'].includes(role()),
    onChange: r => { S.calcDraft = c ? c.getInputs() : S.calcDraft; $('#rbPrice').textContent = r ? uzs(r.naqd) : '—'; $('#rbSub').textContent = r && r.tanlangan.oy ? `${r.tanlangan.turi}: ${uzs(r.tanlangan.oylik)} / oy` : 'Naqd'; },
  });
  $('#toOrder') && ($('#toOrder').onclick = () => {
    const r = c.getResult();
    if (!r || !r.naqd) { toast("Narx 0 — mahsulot qo'shing", true); return; }
    newOrderForm({ inputs: c.getInputs(), result: r });
  });
}

// ---------- Rasmlar ----------
async function loadPhotos(o) {
  const r = role();
  const wants = [];
  if ($('#ph-olchov')) wants.push(['olchov', $('#ph-olchov')]);
  if ($('#ph-yetkazish')) wants.push(['yetkazish', $('#ph-yetkazish')]);
  for (const [kind, el] of wants) {
    try {
      const s = await getDocs(query(collection(db, 'photos'), where('orderId', '==', o.id), where('kind', '==', kind)));
      el.innerHTML = s.docs.map(d => `<a href="#" data-img="${d.id}"><img src="${d.data().data}" alt=""></a>`).join('') || '<span class="muted">Rasm yo\'q</span>';
      bindZoom(el, s.docs);
    } catch (e) { el.innerHTML = `<span class="muted">${esc(errText(e))}</span>`; }
  }
  const pp = $('#ph-pasport');
  if (pp) {
    try {
      const cons = [where('orderId', '==', o.id), where('kind', '==', 'pasport')];
      if (r === 'sotuvchi') cons.push(where('branchId', '==', S.me.branchId));
      const s = await getDocs(query(collection(db, 'photos'), ...cons));
      pp.innerHTML = ['oldi', 'orqa'].map(side => { const d = s.docs.find(x => x.data().side === side); return `<div class="slot">${side === 'oldi' ? 'Old tomoni' : 'Orqa tomoni'}${d ? `<a href="#" data-img="${d.id}"><img src="${d.data().data}" alt=""></a>` : '<span class="muted">yo\'q</span>'}</div>`; }).join('');
      bindZoom(pp, s.docs);
    } catch (e) { pp.innerHTML = `<span class="muted">${esc(errText(e))}</span>`; }
  }
}
function bindZoom(el, docs) {
  el.querySelectorAll('[data-img]').forEach(a => a.onclick = e => {
    e.preventDefault();
    const d = docs.find(x => x.id === a.dataset.img);
    modal(`<img src="${d.data().data}" style="width:100%;border-radius:10px" alt="">`, { wide: true });
  });
}

async function savePhoto(o, kind, data, side) {
  const ref = doc(collection(db, 'photos'));
  await setDoc(ref, { orderId: o.id, branchId: o.branchId, kind, side: side || '', data, createdBy: S.me.id, createdAt: serverTimestamp() });
  return ref.id;
}

// Ko'p rasm yuklash (o'lchov, yetkazish)
async function photoUploader(el, o, kind) {
  let docs = [];
  const draw = () => {
    el.innerHTML = docs.map(d => `<div class="ph"><img src="${d.data}" alt=""><button data-del="${d.id}" title="O'chirish">×</button></div>`).join('') +
      `<label class="upl"><input type="file" accept="image/*" multiple capture="environment"><span style="font-size:26px">＋</span>Rasm qo'shish</label>`;
    el.querySelector('input').onchange = async e => {
      const files = [...e.target.files];
      const lbl = el.querySelector('.upl'); lbl.innerHTML = 'Yuklanmoqda…';
      for (const f of files) {
        try { const data = await compressImage(f); const id = await savePhoto(o, kind, data); docs.push({ id, data }); }
        catch (er) { toast(errText(er), true); }
      }
      draw();
    };
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!await confirmBox("Rasmni o'chirasizmi?", "O'chirish", true)) return;
      try { await deleteDoc(doc(db, 'photos', b.dataset.del)); docs = docs.filter(d => d.id !== b.dataset.del); draw(); } catch (er) { toast(errText(er), true); }
    });
  };
  try {
    const s = await getDocs(query(collection(db, 'photos'), where('orderId', '==', o.id), where('kind', '==', kind)));
    docs = s.docs.map(d => ({ id: d.id, data: d.data().data }));
  } catch (e) { /* bo'sh */ }
  draw();
}

// Pasport: ikki tomon
async function pasportUploader(el, o) {
  const cur = { oldi: null, orqa: null };
  try {
    const cons = [where('orderId', '==', o.id), where('kind', '==', 'pasport')];
    if (role() === 'sotuvchi') cons.push(where('branchId', '==', S.me.branchId));
    const s = await getDocs(query(collection(db, 'photos'), ...cons));
    s.docs.forEach(d => { cur[d.data().side] = { id: d.id, data: d.data().data }; });
  } catch (e) { /* bo'sh */ }
  const draw = () => {
    el.innerHTML = ['oldi', 'orqa'].map(side => `<div class="slot" data-side="${side}" data-has="${cur[side] ? 1 : 0}">${side === 'oldi' ? 'Old tomoni' : 'Orqa tomoni'}
      ${cur[side] ? `<div class="ph" style="aspect-ratio:3/2;border-radius:10px;overflow:hidden;position:relative"><img src="${cur[side].data}" alt=""><button class="btn sec sm" data-re="${side}" style="position:absolute;bottom:6px;right:6px">Almashtirish</button></div>`
        : `<label class="upl"><input type="file" accept="image/*" capture="environment" data-up="${side}"><span style="font-size:26px">📷</span>Rasmga olish</label>`}</div>`).join('');
    el.querySelectorAll('[data-up]').forEach(inp => inp.onchange = e => upload(inp.dataset.up, e.target.files[0]));
    el.querySelectorAll('[data-re]').forEach(b => b.onclick = () => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
      i.onchange = e => upload(b.dataset.re, e.target.files[0]); i.click();
    });
  };
  const upload = async (side, f) => {
    if (!f) return;
    const slot = el.querySelector(`[data-side="${side}"]`); slot.querySelector('.upl, .ph').outerHTML = '<div class="upl">Yuklanmoqda…</div>';
    try {
      const data = await compressImage(f, 1800, 390000);
      const id = await savePhoto(o, 'pasport', data, side);
      if (cur[side]) { try { await deleteDoc(doc(db, 'photos', cur[side].id)); } catch (e) { /* eski rasm qolsa ham zarar yo'q */ } }
      cur[side] = { id, data };
    } catch (er) { toast(errText(er), true); }
    draw();
  };
  draw();
}

// ---------- Tizimni sozlash / kirish formalari ----------
document.addEventListener('change', e => {
  const ids = e.target.dataset?.showpw; if (!ids) return;
  ids.split(',').forEach(id => { const el = document.getElementById(id); if (el) el.type = e.target.checked ? 'text' : 'password'; });
});
$('#sPhone').addEventListener('input', () => { const n = normPhone($('#sPhone').value); $('#sLoginPrev').textContent = n.length >= 12 ? `Loginingiz: +${n}` : ''; });
$('#setupForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const err = $('#setupErr'); err.classList.add('hidden');
  const name = $('#sName').value.trim(), phone = normPhone($('#sPhone').value), pw = $('#sPass').value, branch = $('#sBranch').value.trim();
  if (phone.length < 9) { err.textContent = "Telefon raqamini to'liq kiriting"; err.classList.remove('hidden'); return; }
  if (pw !== $('#sPass2').value) { err.textContent = 'Parollar bir xil emas'; err.classList.remove('hidden'); return; }
  $('#setupBtn').disabled = true; setupRunning = true;
  try {
    let cred;
    try { cred = await createUserWithEmailAndPassword(auth, emailFor(phone, 1), pw); }
    catch (e) { if (String(e.code).includes('email-already-in-use')) cred = await signInWithEmailAndPassword(auth, emailFor(phone, 1), pw); else throw e; }
    const uid = cred.user.uid;
    const branchRef = doc(collection(db, 'branches'));
    const b = writeBatch(db);
    b.set(doc(db, 'profiles', uid), { login: phone, fullName: name, phone, role: 'admin', branchId: '', active: true, createdAt: serverTimestamp() });
    b.set(doc(db, 'meta', 'setup'), { by: uid, at: serverTimestamp() });
    await b.commit();
    const b2 = writeBatch(db);
    b2.set(branchRef, { name: branch || 'Asosiy filial', address: '', phone: '', active: true, createdAt: serverTimestamp() });
    b2.set(doc(db, 'settings', 'main'), DEF_MAIN);
    await b2.commit();
    setupRunning = false;
    location.reload();
  } catch (e) {
    setupRunning = false; $('#setupBtn').disabled = false;
    err.textContent = errText(e); err.classList.remove('hidden');
  }
});
$('#loginForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const err = $('#loginErr'); err.classList.add('hidden'); $('#loginBtn').disabled = true;
  try { await loginWithPhone($('#lPhone').value, $('#lPass').value); location.reload(); return; }
  catch (e) { err.textContent = errText(e); err.classList.remove('hidden'); }
  $('#loginBtn').disabled = false;
});
$('#logoutBtn').addEventListener('click', () => {
  const m = modal(`<h2>${esc(S.me?.fullName || '')}</h2><p class="muted">${esc(ROLES[role()] || '')} · +${esc(S.me?.login || '')}</p>
    <h3>Parolni o'zgartirish</h3><div class="field"><input class="inp" type="password" id="np1" placeholder="Yangi parol (kamida 8 belgi)" autocomplete="new-password"></div>
    <button class="btn sec block" id="npBtn">Parolni saqlash</button>
    <button class="btn red block" id="outBtn" style="margin-top:16px">Chiqish</button>`);
  m.el.querySelector('#outBtn').onclick = () => signOut(auth).then(() => location.reload());
  m.el.querySelector('#npBtn').onclick = async () => {
    const p = m.el.querySelector('#np1').value;
    if (p.length < 8) { toast('Kamida 8 belgi', true); return; }
    try { await updatePassword(auth.currentUser, p); toast("Parol o'zgardi"); m.close(); }
    catch (e) { toast(e.code === 'auth/requires-recent-login' ? 'Xavfsizlik uchun chiqib, qayta kirib, keyin parolni o\'zgartiring' : errText(e), true); }
  };
});

ctx.createStaffAccount = createStaffAccount;
ctx.emailFor = emailFor;
ctx.loadStatic = loadStatic;
boot();
