// Bildirishnomalar (🔔): sotuvchiga o'lchandi, usta qabul qildi, narx/muddat o'zgardi —
// notifs/{id} hujjatlari. Mebelni yetkazish kuni kelgani — buyurtmalardan hisoblanadi (saqlanmaydi).
import { doc, collection, query, where, onSnapshot, updateDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { esc, fdt, todayStr, toast, errText, modal } from './util.js';

const PROD = ['kesish', 'yigish', 'qadoqlash', 'yetkazish'];
let B = null; // { ctx, list, first }

// Paketga bildirishnoma qo'shish (buyurtma o'zgarishi bilan birga yoziladi)
export function addNotif(ctx, b, o, kind, text, to = o.sellerId) {
  const { S, db } = ctx;
  if (!to || to === S.me.id) return;
  b.set(doc(collection(db, 'notifs')), {
    to, orderId: o.id, orderNo: String(o.no || ''), client: o.client?.name || '', kind, text,
    by: S.me.id, byName: S.me.fullName || '', at: Date.now(), read: false,
  });
}

const dmy = s => s ? s.split('-').reverse().join('.') : '';
// Sotuvchining buyurtmalari: muddat kuni keldi yoki o'tdi, hali yetkazilmagan
function reminders(ctx) {
  const { S } = ctx, today = todayStr();
  return S.orders.filter(o => o.sellerId === S.me.id && PROD.includes(o.stage) && o.muddat && o.muddat <= today).map(o => ({
    id: 'd_' + o.id, orderId: o.id, orderNo: o.no, client: o.client?.name || '', kind: 'kun', virtual: true,
    text: o.muddat === today ? `🚚 Bugun mebelga chiqish kuni (muddat: ${dmy(o.muddat)})` : `🚚 Mebelga chiqish kuni o'tdi (muddat: ${dmy(o.muddat)}) — hali yetkazilmagan`,
    at: new Date(o.muddat + 'T08:00:00').getTime(), read: (S.me.seen || {})['d_' + o.id] === o.muddat, muddat: o.muddat,
  }));
}
const items = () => [...reminders(B.ctx), ...B.list].sort((a, b) => (a.read - b.read) || (b.at - a.at));

export function mountBell(ctx) {
  const btn = document.getElementById('bellBtn');
  B = { ctx, list: [], first: true };
  btn.classList.remove('hidden');
  btn.onclick = openList;
  ctx.S.unsub.push(onSnapshot(query(collection(ctx.db, 'notifs'), where('to', '==', ctx.S.me.id)), snap => {
    const fresh = !B.first && snap.docChanges().some(c => c.type === 'added');
    B.list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    B.first = false;
    refreshBell();
    if (fresh) {
      const last = B.list.filter(x => !x.read).sort((a, b) => b.at - a.at)[0];
      if (last) { toast(`🔔 №${last.orderNo} ${last.client}: ${last.text}`); ping(); }
    }
  }, () => { /* ruxsat yo'q */ }));
}

export function refreshBell() {
  if (!B) return;
  const n = items().filter(x => !x.read).length;
  const badge = document.getElementById('bellCnt');
  badge.textContent = n > 99 ? '99+' : n;
  badge.classList.toggle('hidden', !n);
}

// Ilova ochiq bo'lsa: qisqa ovoz va tebranish
function ping() {
  try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch (e) { /* yo'q */ }
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + 0.18); setTimeout(() => a.close(), 400);
  } catch (e) { /* yo'q */ }
}

async function markRead(x) {
  const { S, db } = B.ctx;
  if (x.read) return;
  x.read = true;
  if (x.virtual) {
    S.me.seen = { ...(S.me.seen || {}), [x.id]: x.muddat };
    await updateDoc(doc(db, 'profiles', S.me.id), { ['seen.' + x.id]: x.muddat });
  } else await updateDoc(doc(db, 'notifs', x.id), { read: true });
}

function openList() {
  const list = items();
  const m = modal(`<h2>🔔 Bildirishnomalar</h2>
    ${list.length ? `<div class="nlist">${list.map((x, i) => `<button class="nitem ${x.read ? '' : 'un'}" data-i="${i}">
      <div class="nt"><b>№${esc(x.orderNo)} ${esc(x.client)}</b><span>${x.virtual ? 'Bugun' : esc(fdt(x.at))}</span></div>
      <div>${esc(x.text)}</div>${x.byName ? `<div class="hint">${esc(x.byName)}</div>` : ''}</button>`).join('')}</div>
      ${list.some(x => !x.read) ? '<button class="btn sec block" id="nAll" style="margin-top:12px">Hammasini o\'qildi deb belgilash</button>' : ''}`
      : '<div class="empty">Hozircha bildirishnoma yo\'q</div>'}`);
  m.el.querySelectorAll('[data-i]').forEach(b => b.onclick = async () => {
    const x = list[+b.dataset.i];
    m.close();
    B.ctx.openOrder(x.orderId);
    try { await markRead(x); } catch (e) { /* keyinroq */ }
    refreshBell();
  });
  const all = m.el.querySelector('#nAll');
  if (all) all.onclick = async () => {
    try {
      const { db } = B.ctx;
      const b = writeBatch(db);
      list.filter(x => !x.read && !x.virtual).forEach(x => { b.update(doc(db, 'notifs', x.id), { read: true }); x.read = true; });
      await b.commit();
      for (const x of list.filter(x => !x.read && x.virtual)) await markRead(x);
      refreshBell(); m.close();
    } catch (e) { toast(errText(e), true); }
  };
}
