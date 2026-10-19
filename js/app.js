import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, updatePassword, connectAuthEmulator }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, collection, collectionGroup, query, where, onSnapshot,
  serverTimestamp, writeBatch, runTransaction, arrayUnion, deleteDoc, deleteField, connectFirestoreEmulator }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig, EMU } from './firebase-config.js';
import { $, esc, uzs, pct, digits, normPhone, fmtPhone, fdate, fdt, todayStr, parseNum, toast, errText, modal, confirmBox, compressImage, phoneField } from './util.js';
import { mountCalc } from './calc-ui.js';
import { renderSettings } from './sozlamalar.js';
import { renderStaff, renderBranches, createStaffAccount } from './xodimlar.js';
import { downloadPdf, downloadFinalPdf } from './pdf.js';
import { renderReport } from './hisobot.js';
import { renderTopics, unreadTopics } from './muammolar.js';
import { DEFAULT_ROLES, mergeRoles, can as canP } from './perms.js';
import { HUDUDLAR, VILOYATLAR, fullAddress } from './hududlar.js';
import { installApp, canInstall } from './install.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
if (EMU) { connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); connectFirestoreEmulator(db, '127.0.0.1', 8080); }

export const LOGIN_DOMAIN = 'barakamebel.local';
export const emailFor = (phone, k) => k <= 1 ? `${phone}@${LOGIN_DOMAIN}` : `${phone}+v${k}@${LOGIN_DOMAIN}`;
const MAX_ALIAS = 8;

// Buyurtma bosqichlari
export const STAGES = {
  murojaat: { t: 'Murojaat', c: '' },
  skoring: { t: 'Shartnomachida', c: 'vio' },
  olchov: { t: "O'lchovda", c: 'gold' },
  olchandi: { t: "O'lchandi — narx tasdig'i", c: 'gold' },
  ustaga: { t: 'Ustaga biriktirish', c: 'warn' },
  usta_tasdiq: { t: "Usta qabul qilishi", c: 'warn' },
  kesish: { t: 'Xom ashyo / kesish', c: 'warn' },
  yigish: { t: "Yig'ilmoqda", c: 'warn' },
  qadoqlash: { t: 'Qadoqlanmoqda', c: 'warn' },
  yetkazish: { t: 'Yetkazishga tayyor', c: 'warn' },
  yakunlandi: { t: 'Yakunlandi', c: 'ok' },
  bekor: { t: 'Bekor qilindi', c: 'bad' },
};
export const PROD = ['kesish', 'yigish', 'qadoqlash', 'yetkazish'];
const ACTIVE = s => s !== 'yakunlandi' && s !== 'bekor';
const stageBadge = s => `<span class="badge ${STAGES[s]?.c || ''}">${esc(STAGES[s]?.t || s)}</span>`;
export function stagePath(o) {
  const p = ['murojaat'];
  if (o.tolovTuri === 'muddatli' || o.stage === 'skoring') p.push('skoring');
  if (o.mebelTuri !== 'tayyor') p.push('olchov', 'olchandi');
  p.push('ustaga', 'usta_tasdiq', ...PROD, 'yakunlandi');
  return p;
}

export const YANGI = 'Yangi murojaat';
const DEF_MAIN = {
  kategoriyalar: ['Spalniy garnitur', 'Prixojka', 'Yumshoq mebel', 'Oshxona mebeli', 'Shkaf / garderob', 'Ofis mebeli', 'Boshqa'],
  statuslar: [YANGI, 'Narx bilish uchun', 'Mijozning uyi hali bitmagan', "O'ylab ko'radi", "Qayta qo'ng'iroq qilish", 'Buyurtma beradi'],
  minRasm: 4,
};

// ---------- Holat ----------
export const S = {
  me: null, tab: null, branches: [], staff: [], roles: mergeRoles(), ustaFoiz: {},
  settings: { main: DEF_MAIN, kalk: {}, xom: {}, xomCustom: [], xomDeleted: [] },
  orders: [], ordersReady: false, view: null, filter: { q: '', chip: 'faol' }, unsub: [], topics: [],
};
export const can = k => canP(S.me, S.roles, S.ownerId, k);
const isAdmin = () => S.me?.role === 'admin';
export const isOwner = () => !!S.me && S.me.id === S.ownerId;
export const ctx = { db, auth, app, S, firebaseConfig, can, isOwner, rerender: () => go(S.tab) };
export const calcSettings = (ustaFoiz = 0) => ({ kalk: S.settings.kalk, xom: S.settings.xom, xomCustom: S.settings.xomCustom, xomDeleted: S.settings.xomDeleted, ustaFoiz });
const branchName = id => S.branches.find(b => b.id === id)?.name || '—';
export const roleName = r => S.roles[r]?.name || r;
// Faol xodimlar, rolida shu ruxsat bor (admin hisoblanmaydi — masalan ustalar ro'yxati)
export const staffWith = k => S.staff.filter(p => p.active && !p.deleted && !p.replacedBy && p.role !== 'admin' && S.roles[p.role]?.perms?.[k]);
const minRasm = () => Math.max(1, Number(S.settings.main.minRasm) || 4);
const logEntry = m => ({ t: Date.now(), u: S.me.id, n: S.me.fullName || '', m });
const show = id => ['boot', 'setup', 'login', 'app'].forEach(x => $('#' + x).classList.toggle('hidden', x !== id));
const dmy = s => s ? s.split('-').reverse().join('.') : '—';
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
// Muddat holati: kechikkan / yaqin / me'yorda
function muddatInfo(o) {
  if (!o.muddat) return null;
  if (o.stage === 'yakunlandi') {
    const done = o.yetkazildi ? new Date(o.yetkazildi) : null;
    if (!done) return null;
    const ds = done.getFullYear() + '-' + String(done.getMonth() + 1).padStart(2, '0') + '-' + String(done.getDate()).padStart(2, '0');
    const d = daysBetween(ds, o.muddat);
    return { cls: d < 0 ? 'late' : 'ok', t: d < 0 ? `${-d} kun kechikib bajarildi` : d === 0 ? 'Muddatida bajarildi' : `${d} kun oldin bajarildi` };
  }
  if (!ACTIVE(o.stage)) return null;
  const left = daysBetween(todayStr(), o.muddat);
  if (left < 0) return { cls: 'late', t: `${-left} kun kechikdi` };
  if (left <= 2) return { cls: 'soon', t: left === 0 ? 'Bugun topshirish kerak' : `${left} kun qoldi` };
  return { cls: '', t: `Muddat: ${dmy(o.muddat)}` };
}

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
        if (ps.exists() && ps.data().active && !ps.data().deleted) return cred;
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
        if (!p || !p.active || p.deleted) { await signOut(auth); loginError('Bu login faol emas. Admin bilan bog\'laning.'); return; }
        S.me = { id: user.uid, ...p };
        show('app');
        $('#page').innerHTML = '<div class="loading">Ma\'lumotlar yuklanmoqda…</div>';
        await loadStatic();
        if (isOwner()) await migrate();
        if (!S.roles[p.role] && p.role !== 'admin') { await signOut(auth); loginError('Sizning rolingiz o\'chirilgan. Admin bilan bog\'laning.'); return; }
        $('#meName').textContent = p.fullName || '';
        $('#meRole').textContent = (isOwner() ? 'Tizim egasi' : roleName(p.role)) + (p.branchId && !isAdmin() ? ' · ' + branchName(p.branchId) : '');
        subscribeOrders();
        subscribeTopics();
        S.tab = tabsFor()[0]?.id || 'muammo';
        go(S.tab);
      } catch (e) { console.error(e); show('login'); loginError(errText(e)); }
    });
  } catch (e) {
    $('#bootMsg').innerHTML = `<b style="color:var(--bad)">Serverga ulanib bo'lmadi.</b><br>${esc(errText(e))}<br><br>Internetni tekshirib, sahifani yangilang.`;
  }
}
function loginError(t) { const e = $('#loginErr'); e.textContent = t; e.classList.remove('hidden'); show('login'); }

export async function loadStatic() {
  const [br, st, sm, sk, sx, sr] = await Promise.all([
    getDocs(collection(db, 'branches')),
    getDocs(collection(db, 'profiles')),
    getDoc(doc(db, 'settings', 'main')),
    getDoc(doc(db, 'settings', 'kalk')),
    getDoc(doc(db, 'settings', 'xom')),
    getDoc(doc(db, 'settings', 'roles')),
  ]);
  S.branches = br.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  S.staff = st.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
  const main = { ...DEF_MAIN, ...(sm.exists() ? sm.data() : {}) };
  main.statuslar = [YANGI, ...(main.statuslar || []).filter(x => x && x !== YANGI)];
  const xom = sx.exists() ? sx.data() : {};
  S.settings = {
    main, kalk: sk.exists() ? (sk.data().cells || {}) : {},
    xom: xom.cells || {}, xomCustom: xom.custom || [], xomDeleted: xom.deleted || [],
  };
  S.rolesRaw = sr.exists() ? (sr.data().roles || {}) : {};
  S.roles = mergeRoles(S.rolesRaw);
  const me = S.staff.find(p => p.id === S.me?.id);
  if (me) S.me = { ...S.me, ...me };
  // Usta foizlari (faqat ruxsati borlar o'qiy oladi)
  S.ustaFoiz = {};
  if (isAdmin() || can('see_usta_foiz') || can('calc') || can('assign_usta') || can('report')) {
    try { (await getDocs(collection(db, 'ustaFoiz'))).docs.forEach(d => { S.ustaFoiz[d.id] = Number(d.data().foiz) || 0; }); } catch (e) { /* ruxsat yo'q */ }
  }
}

// Bir martalik ko'chirish (2-versiya): usta foizi va haqi himoyalangan hujjatlarga
async function migrate() {
  try {
    const m = await getDoc(doc(db, 'meta', 'migr'));
    if (m.exists() && m.data().v >= 2) return;
    const b = writeBatch(db);
    let n = 0;
    for (const p of S.staff) if (p.ustaFoiz !== undefined) {
      b.set(doc(db, 'ustaFoiz', p.id), { foiz: Number(p.ustaFoiz) || 0 }); b.update(doc(db, 'profiles', p.id), { ustaFoiz: deleteField() }); n += 2;
    }
    const os = await getDocs(collection(db, 'orders'));
    for (const d of os.docs) {
      const o = d.data();
      if (o.ustaHaqi !== undefined || o.ustaFoiz !== undefined) {
        b.set(doc(db, 'orders', d.id, 'pul', 'main'), { ustaId: o.ustaId || '', ustaHaqi: o.ustaHaqi ?? 0, ustaFoiz: o.ustaFoiz ?? 0 }, { merge: true });
        if (o.ustaId) { b.set(doc(db, 'orders', d.id, 'usta', 'main'), { ustaId: o.ustaId, haqi: o.ustaHaqi ?? 0 }); n++; }
        b.update(d.ref, { ustaHaqi: deleteField(), ustaFoiz: deleteField() }); n += 2;
      }
      if (n > 400) break;
    }
    b.set(doc(db, 'meta', 'migr'), { v: 2, at: Date.now() });
    await b.commit();
    if (n) await loadStatic();
  } catch (e) { console.warn('migratsiya', e); }
}

function subscribeOrders() {
  const uid = S.me.id;
  const col = collection(db, 'orders');
  const qs = [];
  if (isAdmin() || can('ord_all')) qs.push(col);
  else {
    if (can('ord_branch')) qs.push(query(col, where('branchId', '==', S.me.branchId || '-')));
    if (can('skoring')) qs.push(query(col, where('tolovTuri', '==', 'muddatli')));
    if (can('olchov')) qs.push(query(col, where('olchovchiId', '==', uid)));
    if (can('work')) qs.push(query(col, where('ustaId', '==', uid)));
  }
  S.ordersReady = !qs.length;
  const parts = qs.map(() => null);
  qs.forEach((q, i) => S.unsub.push(onSnapshot(q, snap => {
    const stamp = id => { const o = S.orders.find(x => x.id === id); return o ? (o.updatedAt?.toMillis?.() || 0) + ':' + o.stage : ''; };
    const before = S.view?.type === 'order' ? stamp(S.view.id) : '';
    parts[i] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (parts.some(p => p === null)) return;
    const map = new Map();
    parts.flat().forEach(o => map.set(o.id, o));
    S.orders = [...map.values()].sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
    S.ordersReady = true;
    renderTabs();
    if (!S.view) { if (!document.querySelector('.modal-bg') && LIVE_TABS.includes(S.tab)) go(S.tab, true); }
    // Ochiq buyurtma faqat o'zi o'zgarganda qayta chiziladi (yozilayotgan matn yo'qolmasin)
    else if (S.view.type === 'order' && !S.view.editing && stamp(S.view.id) !== before) openOrder(S.view.id, true);
  }, e => { $('#page').innerHTML = `<div class="err">${esc(errText(e))}</div>`; })));
}
const LIVE_TABS = ['dash', 'orders', 'assign', 'prod', 'skoring', 'olchov', 'work', 'history'];

function subscribeTopics() {
  S.unsub.push(onSnapshot(collection(db, 'topics'), snap => {
    S.topics = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    renderTabs();
    if (S.tab === 'muammo' && S.onTopics) S.onTopics();
  }, () => { /* ruxsat yo'q */ }));
}

// ---------- Tablar (ruxsatlar bo'yicha) ----------
function tabsFor() {
  const o = S.orders;
  const cnt = f => o.filter(f).length;
  const t = [];
  const seesOrders = isAdmin() || can('ord_all') || can('ord_branch');
  if (isAdmin() || can('dash')) t.push({ id: 'dash', t: 'Bosh sahifa' });
  if (can('assign_usta')) {
    t.push({ id: 'assign', t: 'Ustaga biriktirish', n: cnt(x => x.stage === 'ustaga') });
    t.push({ id: 'prod', t: 'Ishlab chiqarish', n: cnt(x => ['usta_tasdiq', ...PROD].includes(x.stage) && muddatInfo(x)?.cls === 'late') });
  }
  if (seesOrders) t.push({ id: 'orders', t: can('ord_all') || isAdmin() ? 'Buyurtmalar' : 'Murojaatlar', n: cnt(x => (x.stage === 'murojaat' && x.qaytaSana && x.qaytaSana <= todayStr()) || (x.stage === 'olchandi' && !can('ord_all'))) });
  if (can('skoring') && !isAdmin()) t.push({ id: 'skoring', t: 'Tekshiruv', n: cnt(x => x.stage === 'skoring') });
  if (can('olchov') && !isAdmin()) t.push({ id: 'olchov', t: "O'lchovlar", n: cnt(x => x.stage === 'olchov' && x.olchovchiId === S.me.id) });
  if (can('work') && !isAdmin()) t.push({ id: 'work', t: 'Ishlarim', n: cnt(x => ['usta_tasdiq', ...PROD].includes(x.stage) && x.ustaId === S.me.id) });
  if (!seesOrders && (can('skoring') || can('olchov') || can('work'))) t.push({ id: 'history', t: 'Bajarilgan' });
  if (can('calc')) t.push({ id: 'calc', t: 'Kalkulyator' });
  if (isAdmin() || can('report')) t.push({ id: 'report', t: 'Hisobot' });
  t.push({ id: 'muammo', t: '💬 Muammolar', n: unreadTopics(ctx) });
  if (isAdmin() || can('add_usta') || can('staff_view')) t.push({ id: 'staff', t: isAdmin() || can('staff_view') ? 'Xodimlar' : 'Ustalar' });
  if (isAdmin()) t.push({ id: 'branches', t: 'Filiallar' });
  if (isAdmin() || can('xom_narx')) t.push({ id: 'settings', t: isAdmin() ? 'Sozlamalar' : 'Xom ashyo narxlari' });
  return t;
}
function renderTabs() {
  $('#tabs').innerHTML = tabsFor().map(t => `<button data-tab="${t.id}" class="${S.tab === t.id && !S.view ? 'on' : ''}">${esc(t.t)}${t.n ? `<span class="cnt">${t.n}</span>` : ''}</button>`).join('');
}
$('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { S.tab = b.dataset.tab; S.view = null; go(S.tab); window.scrollTo(0, 0); } });

function go(tab, soft) {
  if (!S.me) return;
  if (!soft) S.view = null;
  S.onTopics = null;
  renderTabs();
  const page = $('#page');
  if (!S.ordersReady && LIVE_TABS.includes(tab)) { page.innerHTML = '<div class="loading">Yuklanmoqda…</div>'; return; }
  const work = ['usta_tasdiq', ...PROD];
  switch (tab) {
    case 'dash': return renderDash(page);
    case 'orders': return renderOrderList(page, { title: can('ord_all') || isAdmin() ? 'Buyurtmalar' : 'Murojaatlar', chips: true, newBtn: can('ord_create') });
    case 'assign': return renderOrderList(page, { stages: ['ustaga'], title: 'Ustaga biriktirilishi kerak', noChips: true });
    case 'prod': return renderOrderList(page, { stages: work, title: 'Ishlab chiqarishda', groupByUsta: true, sortMuddat: true });
    case 'skoring': return renderOrderList(page, { stages: ['skoring'], only: o => o.tolovTuri === 'muddatli', title: 'Tekshiruv kutilmoqda' });
    case 'olchov': return renderOrderList(page, { stages: ['olchov'], only: o => o.olchovchiId === S.me.id, title: "O'lchash kerak" });
    case 'work': return renderOrderList(page, { stages: work, only: o => o.ustaId === S.me.id, title: 'Mening ishlarim', sortMuddat: true });
    case 'history': return renderOrderList(page, { title: 'Bajarilgan ishlar', only: o => !(o.stage === 'skoring' && can('skoring')) && !(o.stage === 'olchov' && o.olchovchiId === S.me.id) && !(work.includes(o.stage) && o.ustaId === S.me.id) });
    case 'calc': return renderCalcPage(page);
    case 'report': return renderReport(page, ctx);
    case 'muammo': return renderTopics(page, ctx);
    case 'staff': return renderStaff(page, ctx);
    case 'branches': return renderBranches(page, ctx);
    case 'settings': return renderSettings(page, ctx);
  }
}
ctx.go = go;
ctx.openOrder = id => openOrder(id);

// ---------- Bosh sahifa ----------
async function renderDash(page) {
  const o = S.orders;
  const by = s => o.filter(x => x.stage === s).length;
  const late = o.filter(x => muddatInfo(x)?.cls === 'late').length;
  page.innerHTML = `<h2>Bosh sahifa</h2>
    ${late ? `<button class="note bad" style="width:100%;text-align:left;cursor:pointer" data-late>⚠ <b>${late} ta ish muddatidan kechikmoqda</b> — ko'rish uchun bosing</button>` : ''}
    <div class="stats">
      ${['murojaat', 'skoring', 'olchov', 'olchandi', 'ustaga', 'usta_tasdiq', 'kesish', 'yigish', 'qadoqlash', 'yetkazish', 'yakunlandi', 'bekor']
        .map(s => `<button class="stat" data-st="${s}"><b>${by(s)}</b><span>${esc(STAGES[s].t)}</span></button>`).join('')}
    </div>
    <h3>Filiallar bo'yicha</h3>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Filial</th><th class="r">Murojaat</th><th class="r">Jarayonda</th><th class="r">Yakunlangan</th><th class="r">Bu oy sotuv</th></tr></thead><tbody>
      ${S.branches.map(b => { const bo = o.filter(x => x.branchId === b.id); return `<tr><td>${esc(b.name)}</td><td class="r">${bo.filter(x => x.stage === 'murojaat').length}</td><td class="r">${bo.filter(x => ACTIVE(x.stage) && x.stage !== 'murojaat').length}</td><td class="r">${bo.filter(x => x.stage === 'yakunlandi').length}</td><td class="r" data-br="${b.id}">…</td></tr>`; }).join('')}
    </tbody></table></div>
    <p class="hint">"Bu oy sotuv" — shu oy rasmiylashtirilgan buyurtmalarning naqd narxi yig'indisi.</p>`;
  page.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { S.tab = 'orders'; S.filter.chip = 'all'; S.filter.stage = b.dataset.st; go('orders'); });
  const lb = page.querySelector('[data-late]');
  if (lb) lb.onclick = () => { S.tab = 'orders'; S.filter.chip = 'late'; S.filter.stage = null; go('orders'); };
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
  if (f.only) list = list.filter(f.only);
  const chips = [
    { id: 'faol', t: 'Faol', f: x => ACTIVE(x.stage) },
    { id: 'yangi', t: 'Yangi', f: x => x.stage === 'murojaat' && (x.status || YANGI) === YANGI },
    { id: 'murojaat', t: 'Murojaatlar', f: x => x.stage === 'murojaat' },
    { id: 'jarayon', t: 'Jarayonda', f: x => ACTIVE(x.stage) && x.stage !== 'murojaat' },
    { id: 'qayta', t: "Bugun qo'ng'iroq", f: x => x.stage === 'murojaat' && x.qaytaSana && x.qaytaSana <= todayStr() },
    { id: 'late', t: 'Kechikayotgan', f: x => muddatInfo(x)?.cls === 'late' },
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
  if (q) list = list.filter(x => [x.client?.name, x.client?.phone, String(x.no), x.kategoriya, x.sellerName, x.client?.tuman].join(' ').toLowerCase().includes(q));
  if ((isAdmin() || can('ord_all')) && S.filter.branch) list = list.filter(x => x.branchId === S.filter.branch);
  if (f.sortMuddat) list.sort((a, b) => (a.muddat || '9999').localeCompare(b.muddat || '9999'));
  const seesPhone = !(can('work') && !can('ord_all') && !can('ord_branch') && !isAdmin());

  const item = o => {
    const alert = o.stage === 'murojaat' && o.qaytaSana && o.qaytaSana <= todayStr();
    const mi = muddatInfo(o);
    return `<button class="oitem ${alert || mi?.cls === 'late' ? 'alert' : ''}" data-open="${o.id}">
      <div class="top"><span class="nm">${esc(o.client?.name || 'Nomsiz')}</span>${stageBadge(o.stage)}</div>
      <div class="meta"><span class="no">№${o.no || '—'}</span><span>${esc(o.kategoriya || '')}</span><span>${o.mebelTuri === 'tayyor' ? 'Tayyor' : "Yig'iladigan"}</span>
        ${seesPhone ? `<span>${esc(fmtPhone(o.client?.phone))}</span>` : ''}
        ${o.client?.tuman ? `<span>${esc(o.client.tuman)}</span>` : ''}
        ${isAdmin() || can('ord_all') || can('skoring') ? `<span>${esc(branchName(o.branchId))}</span>` : ''}
        ${o.ustaName && o.ustaId !== S.me.id ? `<span>Usta: ${esc(o.ustaName)}</span>` : ''}
        ${mi ? `<span class="badge ${mi.cls}">${esc(mi.t)}</span>` : ''}
        ${o.stage === 'murojaat' ? `<span>${esc(o.status || YANGI)}${o.qaytaSana ? ' · qayta: ' + esc(dmy(o.qaytaSana)) : ''}</span>` : ''}
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
      ${(isAdmin() || can('ord_all')) && S.branches.length > 1 ? `<select class="inp" id="brf" style="flex:0 1 200px"><option value="">Barcha filiallar</option>${S.branches.map(b => `<option value="${b.id}" ${S.filter.branch === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>` : ''}
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

const datalist = (id, items) => `<datalist id="${id}">${items.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
function hududHtml(c) {
  return `<div class="row2">
    <div class="field"><label>Viloyat</label><input class="inp" name="viloyat" list="dlVil" autocomplete="off" maxlength="60" value="${esc(c.viloyat || '')}" placeholder="Tanlang yoki yozing">${datalist('dlVil', VILOYATLAR)}</div>
    <div class="field"><label>Tuman / shahar</label><input class="inp" name="tuman" list="dlTum" autocomplete="off" maxlength="60" value="${esc(c.tuman || '')}" placeholder="Tanlang yoki yozing">${datalist('dlTum', HUDUDLAR[c.viloyat] || [])}</div>
  </div>`;
}
export function bindHudud(form) {
  const v = form.querySelector('[name=viloyat]'), t = form.querySelector('[name=tuman]');
  if (!v) return;
  v.addEventListener('change', () => {
    const list = HUDUDLAR[v.value] || [];
    form.querySelector('#dlTum').innerHTML = list.map(x => `<option value="${esc(x)}">`).join('');
    if (t.value && !list.includes(t.value)) t.value = '';
  });
}
export { hududHtml };

function clientFormHtml(o = {}) {
  const m = S.settings.main;
  const isNew = !o.id;
  const br = S.branches.find(b => b.id === (o.branchId || S.me.branchId)) || (isAdmin() ? S.branches[0] : null);
  const c = o.client || { viloyat: br?.viloyat || '', tuman: br?.tuman || '' };
  const statuses = m.statuslar.includes(o.status) || !o.status ? m.statuslar : [o.status, ...m.statuslar];
  return `
    <div class="field"><label>Mijoz ismi *</label><input class="inp" name="name" required maxlength="80" value="${esc(c.name || '')}"></div>
    <div class="field"><label>Telefon raqami *</label>${phoneField('phone', c.phone, 'required')}</div>
    ${hududHtml(c)}
    <div class="field"><label>Manzil (ko'cha, uy, mo'ljal)</label><input class="inp" name="address" maxlength="200" value="${esc(c.address || '')}"></div>
    <div class="row2">
      <div class="field"><label>Mebel turi *</label><select class="inp" name="mebelTuri"><option value="yigiladigan" ${o.mebelTuri !== 'tayyor' ? 'selected' : ''}>Yig'iladigan (o'lchov bilan)</option><option value="tayyor" ${o.mebelTuri === 'tayyor' ? 'selected' : ''}>Tayyor mebel</option></select></div>
      <div class="field"><label>Kategoriya *</label><select class="inp" name="kategoriya">${m.kategoriyalar.map(k => `<option ${k === o.kategoriya ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
    </div>
    <div class="row2">
      ${isNew ? '' : `<div class="field"><label>Murojaat statusi</label><select class="inp" name="status">${statuses.map(k => `<option ${k === (o.status || YANGI) ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>`}
      <div class="field"><label>Qayta murojaat sanasi</label><input class="inp" type="date" name="qaytaSana" value="${esc(o.qaytaSana || '')}"></div>
    </div>
    ${isAdmin() && isNew && S.branches.length > 1 ? `<div class="field"><label>Filial</label><select class="inp" name="branchId">${S.branches.filter(b => b.active !== false).map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div>` : ''}
    <div class="field"><label>Izoh</label><textarea class="inp" name="izoh" maxlength="1000">${esc(o.izoh || '')}</textarea></div>`;
}
function readClientForm(form) {
  const fd = new FormData(form);
  const phone = normPhone(fd.get('phone'));
  if (phone.length !== 12) throw new Error("Telefon raqamini to'liq kiriting (9 ta raqam)");
  const d = {
    client: { name: String(fd.get('name')).trim(), phone, viloyat: String(fd.get('viloyat') || '').trim(), tuman: String(fd.get('tuman') || '').trim(), address: String(fd.get('address') || '').trim() },
    mebelTuri: fd.get('mebelTuri'), kategoriya: fd.get('kategoriya'),
    qaytaSana: fd.get('qaytaSana') || '', izoh: String(fd.get('izoh') || '').trim(),
    _branchId: fd.get('branchId'),
  };
  if (fd.has('status')) d.status = fd.get('status');
  return d;
}

function newOrderForm(prefill) {
  const m = modal(`<h2>Yangi murojaat</h2><form id="nf">${clientFormHtml()}<div class="err hidden" id="nfErr"></div><button class="btn pri block">Saqlash</button></form>`);
  const form = m.el.querySelector('#nf');
  bindHudud(form);
  const brSel = form.querySelector('[name=branchId]');
  if (brSel) brSel.onchange = () => { const b = S.branches.find(x => x.id === brSel.value); if (b) { form.viloyat.value = b.viloyat || ''; form.tuman.value = b.tuman || ''; form.viloyat.dispatchEvent(new Event('change')); form.tuman.value = b.tuman || ''; } };
  form.onsubmit = async e => {
    e.preventDefault();
    const btn = form.querySelector('button.pri'); btn.disabled = true;
    try {
      const d = readClientForm(form);
      const branchId = isAdmin() ? (d._branchId || S.branches[0]?.id) : S.me.branchId;
      if (!branchId) throw new Error("Avval filial qo'shing yoki xodimga filial biriktiring");
      delete d._branchId;
      const no = await nextNo();
      const ref = doc(collection(db, 'orders'));
      const b = writeBatch(db);
      const now = Date.now();
      b.set(ref, {
        ...d, status: YANGI, no, branchId, sellerId: S.me.id, sellerName: S.me.fullName || '', stage: 'murojaat', tolovTuri: '', hasCalc: false,
        ish: null, olchovchiId: '', olchovchiName: '', ustaId: '', ustaName: '', taklifUstaId: '', taklifUstaName: '',
        stageAt: { murojaat: now }, log: [logEntry('Murojaat yaratildi')], createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      if (prefill) {
        const u = ustaInfo(prefill.inputs._usta);
        b.set(doc(db, 'orders', ref.id, 'pul', 'main'), pulDoc(prefill.inputs, prefill.result, branchId, S.me.id));
        b.update(ref, { hasCalc: true, ish: prefill.result.ish, taklifUstaId: u?.id || '', taklifUstaName: u?.name || '' });
      }
      await b.commit();
      m.close(); toast('Murojaat saqlandi'); openOrder(ref.id);
    } catch (er) { const x = form.querySelector('#nfErr'); x.textContent = errText(er); x.classList.remove('hidden'); btn.disabled = false; }
  };
}

const ustaInfo = id => { const p = S.staff.find(x => x.id === id); return p ? { id: p.id, name: p.fullName, foiz: S.ustaFoiz[p.id] || 0 } : null; };
const ustaOptions = () => staffWith('work').map(p => ({ id: p.id, name: p.fullName + (p.mutaxassislik ? ' · ' + p.mutaxassislik : ''), foiz: S.ustaFoiz[p.id] || 0 }));

function pulDoc(inputs, result, branchId, sellerId, prev) {
  const { ish, ...res } = result;
  const d = { inputs, result: res, ustaBaza: result.ustaBaza || 0, planFoiz: result.ustaFoiz || 0, planUstaId: inputs._usta || '', branchId, sellerId, calcAt: Date.now(), calcBy: S.me.fullName || '' };
  if (prev) for (const k of ['skoring', 'ustaHaqi', 'ustaFoiz', 'ustaId', 'narxTarix']) if (prev[k] !== undefined) d[k] = prev[k];
  return d;
}

// ---------- Buyurtma kartochkasi ----------
async function openOrder(id, soft) {
  const o = S.orders.find(x => x.id === id);
  const page = $('#page');
  S.view = { type: 'order', id };
  renderTabs();
  if (!o) { page.innerHTML = '<div class="empty">Buyurtma topilmadi yoki uni ko\'rishga ruxsatingiz yo\'q</div>'; return; }
  let pul = null;
  if (isAdmin() || can('ord_all') || can('ord_branch') || can('skoring') || can('assign_usta') || can('report')) {
    try { const s = await getDoc(doc(db, 'orders', id, 'pul', 'main')); pul = s.exists() ? s.data() : null; } catch (e) { pul = null; }
  }
  if (S.view?.id !== id) return;
  const scrollY = soft ? window.scrollY : 0;
  page.innerHTML = orderHtml(o, pul);
  bindOrder(page, o, pul);
  window.scrollTo(0, scrollY);
  loadPhotos(o);
  const uc = $('#ustaHaqiCard');
  if (uc) getDoc(doc(db, 'orders', id, 'usta', 'main')).then(s => { if (s.exists()) uc.innerHTML = `· haqingiz <b>${uzs(s.data().haqi)}</b>`; }).catch(() => {});
  const uh = $('#ustaHaqiMe');
  if (uh) getDoc(doc(db, 'orders', id, 'usta', 'main')).then(s => { uh.innerHTML = s.exists() ? `Sizning haqingiz: <b>${uzs(s.data().haqi)}</b>` : ''; }).catch(() => { uh.textContent = ''; });
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

const seesMoney = () => isAdmin() || can('ord_all') || can('ord_branch') || can('skoring');
const seesFoiz = () => isOwner() || can('see_usta_foiz');

function moneyHtml(o, pul) {
  if (!pul?.result || !seesMoney()) return '';
  const r = pul.result, t = r.tanlangan;
  const sk = pul.skoring;
  return `<div class="card"><h3>Narx va to'lov</h3>
    ${linesHtml(r.lines, true)}
    ${isAdmin() || can('see_cost') ? `<div class="note">Tan narx: <b>${uzs(r.tan)}</b> · Ustama: <b>${uzs(r.ustama)}</b> · Xom ashyo: ${uzs(r.xomAshyo)}</div>` : ''}
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

const sellerOk = o => isAdmin() || (can('ord_edit') && (can('ord_all') || o.branchId === S.me.branchId));
const pdfReady = (o, pul) => (isAdmin() || can('pdf')) && pul?.result && o.stage !== 'bekor' && pul.skoring?.qaror !== 'bekor';

function orderHtml(o, pul) {
  const workerOnly = !isAdmin() && !can('ord_all') && !can('ord_branch') && !can('skoring');
  const actions = actionsHtml(o, pul);
  const mi = muddatInfo(o);
  const showPas = (isAdmin() || can('pasport_view') || can('pasport_upload')) && o.tolovTuri === 'muddatli' && o.stage !== 'murojaat';
  const pasEdit = (isAdmin() || can('pasport_upload')) && sellerOk(o) && o.stage === 'skoring';
  return `
    <button class="btn sec sm" id="back">← Ro'yxatga</button>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:14px 0 6px;flex-wrap:wrap">
      <h2 style="margin:0">${esc(o.client?.name || '')} <span class="no">№${o.no}</span></h2><div>${mi ? `<span class="badge ${mi.cls}">${esc(mi.t)}</span> ` : ''}${stageBadge(o.stage)}</div>
    </div>
    ${o.stage !== 'bekor' ? stepsHtml(o) : ''}
    ${actions ? `<div class="card" style="border-color:var(--g);border-width:2px">${actions}</div>` : ''}
    <div class="card"><h3>Mijoz</h3><div class="kv">
      ${!(workerOnly && can('work')) ? `<div class="k">Telefon</div><div class="v"><a href="tel:+${esc(o.client?.phone)}">${esc(fmtPhone(o.client?.phone))}</a></div>` : ''}
      <div class="k">Manzil</div><div class="v">${esc(fullAddress(o.client) || '—')}</div>
      <div class="k">Mebel turi</div><div class="v">${o.mebelTuri === 'tayyor' ? 'Tayyor mebel' : "Yig'iladigan"}</div>
      <div class="k">Kategoriya</div><div class="v">${esc(o.kategoriya || '—')}</div>
      ${!workerOnly ? `<div class="k">Status</div><div class="v">${esc(o.status || YANGI)}</div>
      <div class="k">Qayta murojaat</div><div class="v">${esc(dmy(o.qaytaSana))}</div>` : ''}
      <div class="k">Filial</div><div class="v">${esc(branchName(o.branchId))}</div>
      <div class="k">Sotuvchi</div><div class="v">${esc(o.sellerName || '—')}</div>
      ${o.tolovTuri && !workerOnly ? `<div class="k">To'lov</div><div class="v">${o.tolovTuri === 'muddatli' ? "Muddatli to'lov" : 'Naqd'}</div>` : ''}
      ${o.olchovchiName ? `<div class="k">O'lchovchi</div><div class="v">${esc(o.olchovchiName)}</div>` : ''}
      ${o.ustaName || o.taklifUstaName ? `<div class="k">Usta</div><div class="v">${esc(o.ustaName || o.taklifUstaName)}${!o.ustaName ? ' <span class="hint">(sotuvchi taklifi)</span>' : ''}${seesFoiz() && pul?.ustaHaqi != null ? ` · usta haqi <b>${uzs(pul.ustaHaqi)}</b> (${pct(pul.ustaFoiz)})` : ''}${o.ustaId === S.me.id ? ' <span id="ustaHaqiCard"></span>' : ''}</div>` : ''}
      ${o.muddat ? `<div class="k">Yakunlash muddati</div><div class="v">${esc(dmy(o.muddat))}${mi ? ` · <span class="${mi.cls}">${esc(mi.t)}</span>` : ''}</div>` : ''}
      ${o.izoh ? `<div class="k">Izoh</div><div class="v" style="white-space:pre-wrap">${esc(o.izoh)}</div>` : ''}
      ${o.bekorSabab ? `<div class="k">Bekor sababi</div><div class="v">${esc(o.bekorSabab)}</div>` : ''}
    </div>
    ${sellerOk(o) && (o.stage === 'murojaat' || isAdmin()) ? `<button class="btn sec sm" id="editClient" style="margin-top:10px">Tahrirlash</button>` : ''}
    </div>
    ${moneyHtml(o, pul)}
    ${o.olchov ? `<div class="card"><h3>O'lchov natijasi</h3><div style="white-space:pre-wrap">${esc(o.olchov.izoh || '')}</div><p class="hint">${esc(o.olchov.n || '')}, ${fdt(o.olchov.t)}</p><div class="photos" id="ph-olchov"></div></div>` : ''}
    ${workerOnly || can('assign_usta') || isAdmin() ? ishHtml(o) : ''}
    ${showPas ? `<div class="card"><h3>Pasport</h3>${pasEdit ? '<div class="pp" id="ppUp"></div>' : '<div class="pp" id="ph-pasport"><span class="muted">Yuklanmoqda…</span></div>'}</div>` : ''}
    ${o.stage === 'yakunlandi' ? `<div class="card"><h3>Yetkazib berish rasmlari</h3><div class="photos" id="ph-yetkazish"></div></div>` : ''}
    ${isAdmin() ? `<div class="card"><h3>Admin</h3>
      <div class="row2"><select class="inp" id="admStage">${Object.keys(STAGES).map(s => `<option value="${s}" ${s === o.stage ? 'selected' : ''}>${esc(STAGES[s].t)}</option>`).join('')}</select><button class="btn sec" id="admStageBtn">Bosqichni o'zgartirish</button></div>
      ${o.muddat && ACTIVE(o.stage) ? `<button class="btn sec sm" id="admMuddat" style="margin-top:10px">Yakunlash muddatini o'zgartirish</button>` : ''}
      <p class="hint">Faqat xatoni tuzatish uchun. Har bir o'zgarish tarixga yoziladi.</p></div>` : ''}
    ${!workerOnly ? `<div class="card"><h3>Tarix</h3><ul class="log">${(o.log || []).slice().reverse().map(l => `<li>${esc(l.m)}<div class="t">${esc(l.n)}, ${fdt(l.t)}</div></li>`).join('')}</ul></div>` : ''}`;
}

const photoCounter = (id, n) => `<div class="hint" id="${id}" style="margin:6px 0 0">Rasmlar: <span class="${n >= minRasm() ? 'cnt-ok' : 'cnt-no'}">${n} / ${minRasm()}</span></div>`;

// Har bir rol uchun shu bosqichdagi asosiy amallar
function actionsHtml(o, pul) {
  const me = S.me.id, adm = isAdmin();
  const st = o.stage;
  const pdfBtns = [
    pdfReady(o, pul) ? `<button class="btn gold" data-a="pdf">⬇ PDF narx taklifi</button>` : '',
    st === 'yakunlandi' && (adm || can('final_pdf')) ? `<button class="btn gold" data-a="finalpdf">⬇ Yakuniy PDF</button>` : '',
  ].join('');
  const blocks = [];
  const wait = t => blocks.push(`<p class="muted" style="margin:0">⏳ ${t}</p>`);
  if (st === 'murojaat' && sellerOk(o)) {
    blocks.push(`<h3 style="margin-top:0">Keyingi qadam</h3>
      <div class="row2">${can('calc') || adm ? `<button class="btn ${pul ? 'sec' : 'pri'}" data-a="calc">${pul ? 'Narxni qayta hisoblash' : 'Narx hisoblash'}</button>` : ''}
      ${pul ? `<button class="btn pri" data-a="formal">Rasmiylashtirish →</button>` : ''}</div>
      ${adm || can('ord_cancel') ? `<button class="btn sec sm" data-a="cancel" style="margin-top:10px">Murojaatni bekor qilish</button>` : ''}`);
  }
  if (st === 'skoring') {
    if (adm || can('skoring')) {
      const t = pul?.result?.tanlangan;
      blocks.push(`<h3 style="margin-top:0">Shartnoma qarori</h3>
        ${pul?.skoring ? `<div class="note">Qayta tekshiruv: narx o'zgargan. Avvalgi limit ${uzs(pul.skoring.limit)}.</div>` : ''}
        <div id="pasNote"></div>
        <p>Kredit summasi (qoldiq): <b>${uzs(t?.qoldiq)}</b> · ${esc(t?.turi || '')}</p>
        <div class="field"><label>Summa limiti, so'm</label><input class="inp" id="skLimit" inputmode="numeric" data-money value="${esc(String(pul?.skoring?.limit || t?.qoldiq || '').replace(/\B(?=(\d{3})+(?!\d))/g, ' '))}"></div>
        <div class="field"><label>Izoh</label><input class="inp" id="skIzoh" maxlength="300"></div>
        <div class="row2"><button class="btn green" data-a="sk-ok">✓ Shartnoma chiqarilsin</button><button class="btn red" data-a="sk-no">✕ Shartnoma bekor qilinsin</button></div>`);
    } else wait('Shartnomachi qarorini kutmoqda');
  }
  if (st === 'olchov') {
    if ((can('olchov') && o.olchovchiId === me) || adm) {
      blocks.push(`<h3 style="margin-top:0">O'lchov${adm && o.olchovchiId !== me ? ` <span class="hint">(${esc(o.olchovchiName)} nomidan)</span>` : ''}</h3>
        <div class="field"><label>Rasmlar (joyi, devorlar, burchaklar) — kamida ${minRasm()} ta</label><div class="photos" id="olchovUp"></div>${photoCounter('olCnt', 0)}</div>
        <div class="field"><label>Aniq o'lchamlar va izoh *</label><textarea class="inp" id="olchovIzoh" maxlength="3000" placeholder="Masalan: devor uzunligi 320 sm, shift 270 sm, chap tomonda rozetka..."></textarea></div>
        <button class="btn pri block" data-a="olchandi">O'lchandi ✓</button>`);
    } else wait(`O'lchovchi ${esc(o.olchovchiName || '')} o'lchashini kutmoqda`);
    if (sellerOk(o) && !adm) blocks.push(`<button class="btn sec sm" data-a="olchovchi" style="margin-top:8px">O'lchovchini almashtirish</button>`);
  }
  if (st === 'olchandi') {
    if (sellerOk(o)) blocks.push(`<h3 style="margin-top:0">O'lchov keldi — narxni tekshiring</h3>
      <p class="hint">Aniq o'lcham bo'yicha narx o'zgarsa, qayta hisoblang va sababini yozing.</p>
      <div class="row2">${can('calc') || adm ? `<button class="btn sec" data-a="calc">Narxni qayta hisoblash</button>` : ''}<button class="btn pri" data-a="toUsta">Ustaga yuborish →</button></div>`);
    else wait('Sotuvchi narxni tasdiqlashini kutmoqda');
  }
  if (st === 'ustaga' || st === 'usta_tasdiq') {
    if (adm || can('assign_usta')) {
      const ustalar = staffWith('work');
      const sel = o.ustaId || o.taklifUstaId;
      blocks.push(`<h3 style="margin-top:0">${st === 'ustaga' ? 'Ustaga biriktirish' : 'Ustani almashtirish'}</h3>
        ${o.taklifUstaName && st === 'ustaga' ? `<p class="hint" style="margin-top:-4px">Sotuvchi tanlagan usta: <b>${esc(o.taklifUstaName)}</b></p>` : ''}
        <div class="field"><select class="inp" id="ustaSel"><option value="">— usta tanlang —</option>${ustalar.map(u => `<option value="${u.id}" ${u.id === sel ? 'selected' : ''}>${esc(u.fullName)}${u.mutaxassislik ? ' · ' + esc(u.mutaxassislik) : ''}</option>`).join('')}</select></div>
        <div id="ustaHaqiPrev" class="hint"></div>
        <button class="btn pri block" data-a="assign">${st === 'ustaga' ? 'Tasdiqlash va biriktirish' : 'Almashtirish'}</button>`);
    } else if (st === 'ustaga') wait('Mebel rahbari ustani biriktirishini kutmoqda');
  }
  if (['usta_tasdiq', ...PROD].includes(st)) {
    const mine = o.ustaId === me && can('work');
    const nom = adm && !mine ? ` <span class="hint">(${esc(o.ustaName)} nomidan)</span>` : '';
    if (mine || adm) {
      if (st === 'usta_tasdiq') blocks.push(`<h3 style="margin-top:0">Yangi ish${nom}</h3>
        <p id="ustaHaqiMe" class="muted">Usta haqi yuklanmoqda…</p>
        <div class="field"><label>Ishni yakunlash sanasi *</label><input class="inp" type="date" id="muddatIn" min="${todayStr()}"><div class="hint">Sanani keyin o'zgartirib bo'lmaydi, diqqat bilan tanlang.</div></div>
        <button class="btn green block" data-a="u-ok">Ishni qabul qilaman ✓</button>`);
      if (st === 'kesish') blocks.push(`<h3 style="margin-top:0">Ish jarayoni${nom}</h3><button class="btn pri block" data-a="u-next">✓ Xom ashyo olib kelindi va kesildi</button>`);
      if (st === 'yigish') blocks.push(`<h3 style="margin-top:0">Ish jarayoni${nom}</h3><button class="btn pri block" data-a="u-next">✓ Yig'ish tugadi</button>`);
      if (st === 'qadoqlash') blocks.push(`<h3 style="margin-top:0">Ish jarayoni${nom}</h3><button class="btn pri block" data-a="u-next">✓ Qadoqlandi</button>`);
      if (st === 'yetkazish') blocks.push(`<h3 style="margin-top:0">Mijozga yetkazib berish${nom}</h3><p class="hint">O'rnatilgan mebelning rasmlarini yuklang (kamida ${minRasm()} ta).</p><div class="photos" id="yetkUp"></div>${photoCounter('yeCnt', 0)}<button class="btn green block" data-a="delivered" style="margin-top:12px">Mijozga yetkazib berildi ✓</button>`);
    } else if (st === 'usta_tasdiq') wait(`Usta ${esc(o.ustaName || '')} ishni qabul qilishini kutmoqda`);
    else wait(`Usta ${esc(o.ustaName || '')} ishlamoqda: ${esc(STAGES[st].t)}`);
  }
  if (pdfBtns) blocks.push(`<div class="row2" style="margin-top:${blocks.length ? 12 : 0}px">${pdfBtns}</div>`);
  return blocks.join('');
}

function bindOrder(page, o, pul) {
  $('#back').onclick = () => { S.view = null; go(S.tab); };
  const on = (a, f) => page.querySelectorAll(`[data-a="${a}"]`).forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { await f(b); } catch (e) { toast(errText(e), true); if (e?.code) console.error(e); }
    b.disabled = false;
  });
  // Bosqich o'zgarsa, uning vaqti stageAt ga yoziladi (yakuniy hisobot uchun)
  const upd = async (fields, msg, extra) => {
    const b = writeBatch(db);
    const f = { ...fields, updatedAt: serverTimestamp(), log: arrayUnion(logEntry(msg)) };
    if (fields.stage && fields.stage !== o.stage) f['stageAt.' + fields.stage] = Date.now();
    b.update(doc(db, 'orders', o.id), f);
    if (extra) extra(b);
    await b.commit();
    toast(msg);
  };
  $('#editClient') && ($('#editClient').onclick = () => {
    const m = modal(`<h2>Murojaatni tahrirlash</h2><form id="ef">${clientFormHtml(o)}<div class="err hidden" id="efErr"></div><button class="btn pri block">Saqlash</button></form>`);
    const form = m.el.querySelector('#ef');
    bindHudud(form);
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
  on('finalpdf', () => downloadFinalPdf(o, S, ctx));
  on('cancel', async () => {
    const m = modal(`<h2>Murojaatni bekor qilish</h2><div class="field"><label>Sababi *</label><input class="inp" id="cs" maxlength="300"></div><button class="btn red block" id="csb">Bekor qilish</button>`);
    m.el.querySelector('#csb').onclick = async () => {
      const s = m.el.querySelector('#cs').value.trim();
      if (!s) { toast('Sababini yozing', true); return; }
      try { await upd({ stage: 'bekor', bekorSabab: s }, 'Murojaat bekor qilindi: ' + s); m.close(); } catch (e) { toast(errText(e), true); }
    };
  });
  on('formal', () => formalize(o, pul, upd));
  on('olchovchi', () => pickOlchovchi(o, upd));
  // Shartnomachi
  on('sk-ok', () => skoringDecide(o, pul, 'tasdiq'));
  on('sk-no', () => skoringDecide(o, pul, 'bekor'));
  // Pasportni keyinroq qo'shish (shartnomachida turganda)
  if ($('#ppUp')) pasportUploader($('#ppUp'), o);
  // O'lchovchi
  let olN = 0, yeN = 0;
  const setCnt = (id, n) => { const el = $('#' + id); if (el) el.outerHTML = photoCounter(id, n); };
  if ($('#olchovUp')) photoUploader($('#olchovUp'), o, 'olchov', n => { olN = n; setCnt('olCnt', n); });
  on('olchandi', async () => {
    const iz = $('#olchovIzoh').value.trim();
    if (olN < minRasm()) throw new Error(`Kamida ${minRasm()} ta rasm yuklang (hozir ${olN} ta)`);
    if (!iz) throw new Error("O'lchamlarni yozing");
    await upd({ stage: 'olchandi', olchov: { izoh: iz, t: Date.now(), n: S.me.fullName || '', u: o.olchovchiId === S.me.id ? S.me.id : o.olchovchiId } }, `O'lchandi (${olN} ta rasm)`);
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
      const u = ustaInfo(sel.value);
      const box = $('#ustaHaqiPrev');
      if (!u || !seesFoiz()) { box.innerHTML = ''; return; }
      const haqi = Math.round((pul?.ustaBaza || 0) * u.foiz);
      const plan = Math.round((pul?.ustaBaza || 0) * (pul?.planFoiz || 0));
      box.innerHTML = `Usta haqi: <b>${uzs(haqi)}</b> (${pct(u.foiz)})${haqi > plan && plan ? `<div class="note bad" style="margin-top:6px">Bu usta foizi narx hisoblangan ustanikidan yuqori — Baraka foydasi ${uzs(haqi - plan)} kamayadi. Mijoz narxi o'zgarmaydi.</div>` : ''}`;
    };
    sel.onchange = prev; prev();
  }
  on('assign', async () => {
    const u = ustaInfo(sel.value);
    if (!u) throw new Error('Usta tanlang');
    const haqi = Math.round((pul?.ustaBaza || 0) * u.foiz);
    await upd({ stage: 'usta_tasdiq', ustaId: u.id, ustaName: S.staff.find(x => x.id === u.id)?.fullName || u.name },
      o.ustaId && o.ustaId !== u.id ? `Usta almashtirildi: ${o.ustaName} → ${u.name}` : `Usta biriktirildi: ${u.name}`,
      b => {
        b.set(doc(db, 'orders', o.id, 'pul', 'main'), { ustaId: u.id, ustaHaqi: haqi, ustaFoiz: u.foiz }, { merge: true });
        b.set(doc(db, 'orders', o.id, 'usta', 'main'), { ustaId: u.id, haqi }); // usta o'z haqini ko'radi
      });
  });
  // Usta (yoki admin usta nomidan)
  const nomidan = o.ustaId !== S.me.id ? ` (${S.me.fullName} usta ${o.ustaName} nomidan)` : '';
  on('u-ok', async () => {
    const d = $('#muddatIn').value;
    if (!d) throw new Error('Ishni yakunlash sanasini tanlang');
    if (d < todayStr()) throw new Error("O'tgan sanani tanlab bo'lmaydi");
    if (!await confirmBox(`Ishni <b>${dmy(d)}</b> gacha yakunlaysizmi? Sanani keyin o'zgartirib bo'lmaydi.`, 'Ha, qabul qilaman')) return;
    await upd({ stage: 'kesish', muddat: d }, `Usta ishni qabul qildi, muddat: ${dmy(d)}${nomidan}`);
  });
  on('u-next', () => {
    const nx = { kesish: ['yigish', 'Xom ashyo keltirildi va kesildi'], yigish: ['qadoqlash', "Yig'ish tugadi"], qadoqlash: ['yetkazish', 'Qadoqlandi'] }[o.stage];
    return upd({ stage: nx[0] }, nx[1] + nomidan);
  });
  if ($('#yetkUp')) photoUploader($('#yetkUp'), o, 'yetkazish', n => { yeN = n; setCnt('yeCnt', n); });
  on('delivered', async () => {
    if (yeN < minRasm()) throw new Error(`Kamida ${minRasm()} ta rasm yuklang (hozir ${yeN} ta)`);
    const now = Date.now();
    const mi = muddatInfo({ ...o, stage: 'yakunlandi', yetkazildi: now });
    await upd({ stage: 'yakunlandi', yetkazildi: now }, `Mijozga yetkazib berildi (${yeN} ta rasm)${mi ? ' — ' + mi.t : ''}${nomidan}`);
  });
  // Admin
  $('#admStageBtn') && ($('#admStageBtn').onclick = async () => {
    const s = $('#admStage').value;
    if (s === o.stage) return;
    if (!await confirmBox(`Bosqichni "${STAGES[s].t}" ga o'zgartirasizmi?`, "O'zgartirish")) return;
    try { await upd({ stage: s }, `Admin bosqichni o'zgartirdi: ${STAGES[o.stage]?.t} → ${STAGES[s].t}`); } catch (e) { toast(errText(e), true); }
  });
  $('#admMuddat') && ($('#admMuddat').onclick = () => {
    const m = modal(`<h2>Yakunlash muddati</h2><p class="muted">Hozirgi: ${esc(dmy(o.muddat))}</p>
      <div class="field"><label>Yangi sana</label><input class="inp" type="date" id="nm" value="${esc(o.muddat)}"></div>
      <div class="field"><label>Sababi *</label><input class="inp" id="nmz" maxlength="300"></div><button class="btn pri block" id="nmb">Saqlash</button>`);
    m.el.querySelector('#nmb').onclick = async () => {
      const d = m.el.querySelector('#nm').value, z = m.el.querySelector('#nmz').value.trim();
      if (!d || !z) { toast('Sana va sababini yozing', true); return; }
      try { await upd({ muddat: d }, `Admin muddatni o'zgartirdi: ${dmy(o.muddat)} → ${dmy(d)} (${z})`); m.close(); } catch (e) { toast(errText(e), true); }
    };
  });
}

// ---------- Rasmiylashtirish (sotuvchi) ----------
async function formalize(o, pul, upd) {
  const t = pul.result.tanlangan;
  const muddatli = t.oy > 0;
  const needOl = o.mebelTuri !== 'tayyor';
  const ol = staffWith('olchov');
  const m = modal(`<h2>Rasmiylashtirish</h2>
    <div class="note">To'lov: <b>${muddatli ? esc(t.turi) + " muddatli to'lov" : 'Naqd'}</b> · naqd narx ${uzs(pul.result.naqd)}${muddatli ? `<br>Oylik ${uzs(t.oylik)}, oldindan ${uzs(t.old)}` : ''}<div class="hint">To'lov turini o'zgartirish uchun narxni qayta hisoblang.</div></div>
    ${muddatli && (isAdmin() || can('pasport_upload')) ? `<h3>Pasport rasmlari <span class="hint">(ixtiyoriy)</span></h3><div class="pp" id="ppUp"></div><p class="hint">Rasm hozir bo'lmasa, keyinroq ham qo'shish mumkin.</p>` : ''}
    ${needOl ? `<h3>O'lchovchi</h3><select class="inp" id="olSel"><option value="">— tanlang —</option>${ol.map(u => `<option value="${u.id}" ${u.id === o.olchovchiId ? 'selected' : ''}>${esc(u.fullName)}</option>`).join('')}</select>` : ''}
    <div class="err hidden" id="fmErr"></div>
    <button class="btn pri block" id="fmBtn" style="margin-top:16px">${muddatli ? 'Shartnomachiga yuborish' : needOl ? "O'lchovga yuborish" : 'Ustaga yuborish'} →</button>
    ${muddatli ? `<button class="btn sec block hidden" id="fmSkip" style="margin-top:8px">Rasmsiz davom etish →</button>` : ''}`, { wide: true });
  const pp = m.el.querySelector('#ppUp');
  const sides = () => pp ? [...pp.querySelectorAll('[data-side]')].filter(x => x.dataset.has === '1').length : 0;
  if (pp) pasportUploader(pp, o, () => { const sk = m.el.querySelector('#fmSkip'); if (sk) sk.classList.toggle('hidden', sides() === 2); m.el.querySelector('#fmBtn').classList.toggle('hidden', sides() < 2 && muddatli); });
  const go2 = async () => {
    const err = m.el.querySelector('#fmErr'); err.classList.add('hidden');
    try {
      const fields = { tolovTuri: muddatli ? 'muddatli' : 'naqd', formalAt: Date.now() };
      if (needOl) {
        const u = S.staff.find(x => x.id === m.el.querySelector('#olSel').value);
        if (!u) throw new Error("O'lchovchini tanlang");
        fields.olchovchiId = u.id; fields.olchovchiName = u.fullName;
      }
      fields.stage = muddatli ? 'skoring' : needOl ? 'olchov' : 'ustaga';
      const ps = sides();
      await upd(fields, `Rasmiylashtirildi: ${muddatli ? t.turi + ' muddatli' : 'naqd'} → ${STAGES[fields.stage].t}${muddatli ? (ps === 2 ? ' (pasport bilan)' : ps ? ' (pasportning 1 tomoni)' : ' (pasportsiz)') : ''}`);
      m.close();
    } catch (e) { err.textContent = errText(e); err.classList.remove('hidden'); }
  };
  m.el.querySelector('#fmBtn').onclick = go2;
  const skip = m.el.querySelector('#fmSkip');
  if (skip) skip.onclick = go2;
}

function pickOlchovchi(o, upd) {
  const ol = staffWith('olchov');
  const m = modal(`<h2>O'lchovchi</h2><select class="inp" id="olSel">${ol.map(u => `<option value="${u.id}" ${u.id === o.olchovchiId ? 'selected' : ''}>${esc(u.fullName)}</option>`).join('')}</select><button class="btn pri block" id="olBtn" style="margin-top:12px">Saqlash</button>`);
  m.el.querySelector('#olBtn').onclick = async () => {
    const u = S.staff.find(x => x.id === m.el.querySelector('#olSel').value);
    if (!u) return;
    try { await upd({ olchovchiId: u.id, olchovchiName: u.fullName }, `O'lchovchi: ${u.fullName}`); m.close(); } catch (e) { toast(errText(e), true); }
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
    stage: next, updatedAt: serverTimestamp(), ['stageAt.' + next]: Date.now(), ...(qaror === 'bekor' ? { bekorSabab: 'Shartnomachi: ' + izoh } : {}),
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
  const inputs = { ...(pul?.inputs || {}) };
  if (!inputs._usta && o.taklifUstaId) inputs._usta = o.taklifUstaId;
  const c = mountCalc($('#calcRoot'), {
    inputs, settings: calcSettings(), ustalar: ustaOptions(), showTan: isAdmin() || can('see_cost'), canDiscount: isAdmin() || can('discount'),
    onChange: r => { $('#rbPrice').textContent = r ? uzs(r.naqd) : '—'; $('#rbSub').textContent = r && r.tanlangan.oy ? `${r.tanlangan.turi}: ${uzs(r.tanlangan.oylik)} / oy` : 'Naqd'; },
  });
  $('#saveCalc').onclick = async () => {
    const r = c.getResult();
    if (!r || !r.naqd) { toast("Narx 0 — mahsulot qo'shing", true); return; }
    if ((r.on.spalniy || r.on.korpus) && !c.ustaId()) { toast('Ustani tanlang', true); return; }
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
      const pd = pulDoc(c.getInputs(), r, o.branchId, o.sellerId, pul);
      pd.narxTarix = pul?.narxTarix || [];
      if (needReason) pd.narxTarix = [...pd.narxTarix, { eski: old, yangi: r.naqd, izoh, t: Date.now(), n: S.me.fullName || '' }];
      b.set(doc(db, 'orders', o.id, 'pul', 'main'), pd);
      const msg = !old ? `Narx hisoblandi: ${uzs(r.naqd)}` : Math.round(old) === Math.round(r.naqd) ? 'Hisob yangilandi (narx o\'zgarmadi)' : `Narx o'zgardi: ${uzs(old)} → ${uzs(r.naqd)}${izoh ? ' (' + izoh + ')' : ''}`;
      const u = ustaInfo(c.ustaId());
      b.update(doc(db, 'orders', o.id), { hasCalc: true, ish: r.ish, taklifUstaId: u?.id || '', taklifUstaName: u?.name || '', updatedAt: serverTimestamp(), log: arrayUnion(logEntry(msg)) });
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
    ${isAdmin() || can('pdf') ? `<button class="btn gold" id="calcPdf">⬇ PDF</button>` : ''}
    ${isAdmin() || can('ord_create') ? `<button class="btn pri" id="toOrder">Murojaat ochish</button>` : ''}</div></div>`;
  let c = null;
  c = mountCalc($('#calcRoot'), {
    inputs: S.calcDraft, settings: calcSettings(), ustalar: ustaOptions(), showTan: isAdmin() || can('see_cost'), canDiscount: isAdmin() || can('discount'),
    onChange: r => { if (c) S.calcDraft = c.getInputs(); $('#rbPrice').textContent = r ? uzs(r.naqd) : '—'; $('#rbSub').textContent = r && r.tanlangan.oy ? `${r.tanlangan.turi}: ${uzs(r.tanlangan.oylik)} / oy` : 'Naqd'; },
  });
  $('#toOrder') && ($('#toOrder').onclick = () => {
    const r = c.getResult();
    if (!r || !r.naqd) { toast("Narx 0 — mahsulot qo'shing", true); return; }
    if ((r.on.spalniy || r.on.korpus) && !c.ustaId()) { toast('Ustani tanlang', true); return; }
    newOrderForm({ inputs: c.getInputs(), result: r });
  });
  $('#calcPdf') && ($('#calcPdf').onclick = async () => {
    const r = c.getResult();
    if (!r || !r.naqd) { toast("Narx 0 — mahsulot qo'shing", true); return; }
    try { await downloadPdf({ no: '—', client: { name: '' }, sellerName: S.me.fullName, mebelTuri: 'yigiladigan' }, { result: r }, S, branchName(S.me.branchId)); } catch (e) { toast(errText(e), true); }
  });
}

// ---------- Rasmlar ----------
async function loadPhotos(o) {
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
  const note = $('#pasNote');
  if (pp || note) {
    try {
      const s = await pasportDocs(o);
      if (pp) {
        pp.innerHTML = ['oldi', 'orqa'].map(side => { const d = s.find(x => x.data().side === side); return `<div class="slot">${side === 'oldi' ? 'Old tomoni' : 'Orqa tomoni'}${d ? `<a href="#" data-img="${d.id}"><img src="${d.data().data}" alt=""></a>` : '<span class="muted">yuklanmagan</span>'}</div>`; }).join('');
        bindZoom(pp, s);
      }
      if (note && s.length < 2) note.innerHTML = `<div class="note">⚠ Pasport rasmi ${s.length ? 'faqat bir tomoni' : ''} yuklanmagan${s.length ? '' : ''}.</div>`;
    } catch (e) { if (pp) pp.innerHTML = `<span class="muted">${esc(errText(e))}</span>`; }
  }
}
async function pasportDocs(o) {
  const cons = [where('orderId', '==', o.id), where('kind', '==', 'pasport')];
  if (!isAdmin() && !can('ord_all') && !can('skoring')) cons.push(where('branchId', '==', S.me.branchId || '-'));
  return (await getDocs(query(collection(db, 'photos'), ...cons))).docs;
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

// Ko'p rasm yuklash (o'lchov, yetkazish). onCount(n) — yuklangan rasmlar soni
async function photoUploader(el, o, kind, onCount) {
  let docs = [];
  const draw = () => {
    el.innerHTML = docs.map(d => `<div class="ph"><img src="${d.data}" alt=""><button data-del="${d.id}" title="O'chirish">×</button></div>`).join('') +
      `<label class="upl"><input type="file" accept="image/*" multiple><span style="font-size:26px">＋</span>Rasm qo'shish</label>`;
    onCount && onCount(docs.length);
    el.querySelector('input').onchange = async e => {
      const files = [...e.target.files];
      const lbl = el.querySelector('.upl'); lbl.innerHTML = 'Yuklanmoqda…';
      for (const f of files) {
        try { const data = await compressImage(f, 1400, 260000); const id = await savePhoto(o, kind, data); docs.push({ id, data }); }
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

// Pasport: ikki tomon (ixtiyoriy). onChange — rasm qo'shilganda
async function pasportUploader(el, o, onChange) {
  const cur = { oldi: null, orqa: null };
  try { (await pasportDocs(o)).forEach(d => { cur[d.data().side] = { id: d.id, data: d.data().data }; }); } catch (e) { /* bo'sh */ }
  const draw = () => {
    el.innerHTML = ['oldi', 'orqa'].map(side => `<div class="slot" data-side="${side}" data-has="${cur[side] ? 1 : 0}">${side === 'oldi' ? 'Old tomoni' : 'Orqa tomoni'}
      ${cur[side] ? `<div class="ph" style="aspect-ratio:3/2;border-radius:10px;overflow:hidden;position:relative"><img src="${cur[side].data}" alt=""><button class="btn sec sm" data-re="${side}" style="position:absolute;bottom:6px;right:6px">Almashtirish</button></div>`
        : `<label class="upl"><input type="file" accept="image/*" data-up="${side}"><span style="font-size:26px">📷</span>Rasmga olish</label>`}</div>`).join('');
    el.querySelectorAll('[data-up]').forEach(inp => inp.onchange = e => upload(inp.dataset.up, e.target.files[0]));
    el.querySelectorAll('[data-re]').forEach(b => b.onclick = () => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
      i.onchange = e => upload(b.dataset.re, e.target.files[0]); i.click();
    });
    onChange && onChange();
  };
  const upload = async (side, f) => {
    if (!f) return;
    const slot = el.querySelector(`[data-side="${side}"]`); slot.querySelector('.upl, .ph').outerHTML = '<div class="upl">Yuklanmoqda…</div>';
    try {
      const data = await compressImage(f, 1800, 390000);
      const id = await savePhoto(o, 'pasport', data, side);
      if (cur[side]) { try { await deleteDoc(doc(db, 'photos', cur[side].id)); } catch (e) { /* eski rasm qolsa ham zarar yo'q */ } }
      cur[side] = { id, data };
      if (o.stage === 'skoring') toast("Pasport rasmi qo'shildi");
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
$('#setupForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const err = $('#setupErr'); err.classList.add('hidden');
  const name = $('#sName').value.trim(), phone = normPhone($('#setupForm [name=sPhone]').value), pw = $('#sPass').value, branch = $('#sBranch').value.trim();
  if (phone.length !== 12) { err.textContent = "Telefon raqamini to'liq kiriting"; err.classList.remove('hidden'); return; }
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
    b2.set(branchRef, { name: branch || 'Asosiy filial', address: '', phone: '', viloyat: '', tuman: '', active: true, createdAt: serverTimestamp() });
    b2.set(doc(db, 'settings', 'main'), DEF_MAIN);
    b2.set(doc(db, 'meta', 'migr'), { v: 2, at: Date.now() });
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
  try { await loginWithPhone($('#loginForm [name=lPhone]').value, $('#lPass').value); location.reload(); return; }
  catch (e) { err.textContent = errText(e); err.classList.remove('hidden'); }
  $('#loginBtn').disabled = false;
});
$('#logoutBtn').addEventListener('click', () => {
  const m = modal(`<h2>${esc(S.me?.fullName || '')}</h2><p class="muted">${esc(isOwner() ? 'Tizim egasi' : roleName(S.me?.role))} · ${esc(fmtPhone(S.me?.login))}</p>
    <h3>Parolni o'zgartirish</h3><div class="field"><input class="inp" type="password" id="np1" placeholder="Yangi parol (kamida 8 belgi)" autocomplete="new-password"></div>
    <button class="btn sec block" id="npBtn">Parolni saqlash</button>
    ${canInstall() ? `<button class="btn gold block" id="instBtn" style="margin-top:16px">📲 Ilovani telefonga o'rnatish</button>` : ''}
    <button class="btn red block" id="outBtn" style="margin-top:16px">Chiqish</button>`);
  m.el.querySelector('#instBtn') && (m.el.querySelector('#instBtn').onclick = () => { m.close(); installApp(); });
  m.el.querySelector('#outBtn').onclick = () => signOut(auth).then(() => location.reload());
  m.el.querySelector('#npBtn').onclick = async () => {
    const p = m.el.querySelector('#np1').value;
    if (p.length < 8) { toast('Kamida 8 belgi', true); return; }
    try { await updatePassword(auth.currentUser, p); toast("Parol o'zgardi"); m.close(); }
    catch (e) { toast(e.code === 'auth/requires-recent-login' ? 'Xavfsizlik uchun chiqib, qayta kirib, keyin parolni o\'zgartiring' : errText(e), true); }
  };
});
// Kirish va sozlash oynalaridagi telefon maydonlari (+998 bilan)
$('#lPhoneWrap').innerHTML = phoneField('lPhone', '', 'required autocomplete="username"');
$('#sPhoneWrap').innerHTML = phoneField('sPhone', '', 'required');

ctx.createStaffAccount = createStaffAccount;
ctx.emailFor = emailFor;
ctx.loadStatic = loadStatic;
ctx.roleName = roleName;
ctx.staffWith = staffWith;
ctx.STAGES = STAGES;
ctx.stagePath = stagePath;
ctx.DEFAULT_ROLES = DEFAULT_ROLES;
ctx.hududHtml = hududHtml;
ctx.bindHudud = bindHudud;
ctx.muddatInfo = muddatInfo;
boot();
