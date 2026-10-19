// Muammolar: har bir muammo alohida mavzu, ichida javoblar (chat kabi)
import { doc, collection, setDoc, updateDoc, deleteDoc, onSnapshot, increment } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { esc, fdt, toast, errText, modal, confirmBox, compressImage } from './util.js';

let tab = 'open';
let unsubMsgs = null;

// O'qilmagan: mavzuni o'zi ochgan yoki admin — va oxirgi xabarni boshqa odam yozgan
export function unreadTopics(ctx) {
  const { S } = ctx;
  if (!S.me) return 0;
  const seen = S.me.seen || {};
  const admin = S.me.role === 'admin';
  return S.topics.filter(t => (t.by === S.me.id || admin) && t.lastBy !== S.me.id && (t.lastAt || 0) > (seen[t.id] || 0)).length;
}
const isUnread = (ctx, t) => t.lastBy !== ctx.S.me.id && (t.lastAt || 0) > ((ctx.S.me.seen || {})[t.id] || 0);

export function renderTopics(page, ctx) {
  if (unsubMsgs) { unsubMsgs(); unsubMsgs = null; }
  const { S } = ctx;
  const list = S.topics.filter(t => (tab === 'open' ? t.status !== 'closed' : t.status === 'closed'));
  const nOpen = S.topics.filter(t => t.status !== 'closed').length;
  page.innerHTML = `<h2>💬 Muammolar</h2>
    <div class="toolbar"><button class="btn pri" id="newT">+ Muammo yozish</button></div>
    <div class="chips"><button class="chip ${tab === 'open' ? 'on' : ''}" data-tt="open">Ochiq (${nOpen})</button><button class="chip ${tab === 'closed' ? 'on' : ''}" data-tt="closed">Hal qilingan (${S.topics.length - nOpen})</button></div>
    <div class="olist">${list.map(t => `<button class="oitem" data-t="${t.id}">
      <div class="top"><span class="nm">${esc(t.title)}${isUnread(ctx, t) ? '<span class="dot" title="Yangi javob"></span>' : ''}</span>${t.status === 'closed' ? '<span class="badge ok">Hal qilindi</span>' : '<span class="badge warn">Ochiq</span>'}</div>
      <div class="meta"><span>${esc(t.byName)} · ${esc(ctx.roleName(t.byRole))}</span>${t.orderNo ? `<span class="no">№${esc(t.orderNo)}</span>` : ''}<span>${t.replies || 0} ta javob</span><span>${fdt(t.lastAt)}</span></div>
    </button>`).join('') || '<div class="empty">Hozircha yo\'q</div>'}</div>`;
  page.querySelectorAll('[data-tt]').forEach(b => b.onclick = () => { tab = b.dataset.tt; renderTopics(page, ctx); });
  page.querySelectorAll('[data-t]').forEach(b => b.onclick = () => openTopic(page, ctx, b.dataset.t));
  page.querySelector('#newT').onclick = () => newTopic(page, ctx);
  S.onTopics = () => renderTopics(page, ctx);
}

function photoPicker(form) {
  let data = null;
  const box = form.querySelector('[data-photo]');
  const input = box.querySelector('input');
  input.onchange = async () => {
    const f = input.files[0];
    if (!f) return;
    box.querySelector('span').textContent = 'Yuklanmoqda…';
    try { data = await compressImage(f, 1280, 280000); box.querySelector('span').innerHTML = `<img src="${data}" style="height:48px;border-radius:6px;vertical-align:middle"> rasm tanlandi`; }
    catch (e) { toast(errText(e), true); box.querySelector('span').textContent = '📎 Rasm'; }
  };
  return { get: () => data, reset: () => { data = null; input.value = ''; box.querySelector('span').textContent = '📎 Rasm'; } };
}
const photoBtn = `<label class="btn sec sm" data-photo style="cursor:pointer"><input type="file" accept="image/*" hidden><span>📎 Rasm</span></label>`;

function newTopic(page, ctx) {
  const { S } = ctx;
  const orders = S.orders.slice().sort((a, b) => (b.no || 0) - (a.no || 0)).slice(0, 300);
  const m = modal(`<h2>Muammo yozish</h2><form id="tf">
    <div class="field"><label>Sarlavha *</label><input class="inp" name="title" required maxlength="150" placeholder="Masalan: Kalkulyatorda oshxona narxi chiqmayapti"></div>
    <div class="field"><label>Muammoning tavsifi</label><textarea class="inp" name="text" maxlength="3000"></textarea></div>
    ${orders.length ? `<div class="field"><label>Buyurtma (ixtiyoriy)</label><select class="inp" name="order"><option value="">—</option>${orders.map(o => `<option value="${o.id}">№${o.no} · ${esc(o.client?.name || '')}</option>`).join('')}</select></div>` : ''}
    <div class="field">${photoBtn}</div>
    <div class="err hidden" id="tfErr"></div><button class="btn pri block">Yuborish</button></form>`);
  const f = m.el.querySelector('#tf');
  const ph = photoPicker(f);
  f.onsubmit = async e => {
    e.preventDefault();
    const btn = f.querySelector('button.pri'); btn.disabled = true;
    try {
      const o = f.order?.value ? S.orders.find(x => x.id === f.order.value) : null;
      const now = Date.now();
      const ref = doc(collection(ctx.db, 'topics'));
      const d = { title: f.title.value.trim(), text: f.text.value.trim(), by: S.me.id, byName: S.me.fullName || '', byRole: S.me.role, branchId: S.me.branchId || '',
        orderId: o?.id || '', orderNo: o ? String(o.no) : '', status: 'open', replies: 0, createdAt: now, lastAt: now, lastBy: S.me.id, lastByName: S.me.fullName || '' };
      if (ph.get()) d.photo = ph.get();
      await setDoc(ref, d);
      m.close(); toast('Yuborildi'); openTopic(page, ctx, ref.id);
    } catch (er) { const x = f.querySelector('#tfErr'); x.textContent = errText(er); x.classList.remove('hidden'); btn.disabled = false; }
  };
}

function openTopic(page, ctx, id) {
  const { S, db } = ctx;
  S.onTopics = null;
  const t = S.topics.find(x => x.id === id);
  if (!t) { renderTopics(page, ctx); return; }
  const canClose = S.me.role === 'admin' || t.by === S.me.id;
  const markSeen = () => {
    S.me.seen = { ...(S.me.seen || {}), [id]: Date.now() };
    updateDoc(doc(db, 'profiles', S.me.id), { ['seen.' + id]: Date.now() }).catch(() => {});
  };
  markSeen();
  const bubble = (who, whoRole, text, photo, at, mine, delId) => `<div class="msg ${mine ? 'me' : ''}"><div class="who">${esc(who)} · ${esc(ctx.roleName(whoRole))} · ${fdt(at)}${delId ? ` · <a href="#" data-mdel="${delId}">o'chirish</a>` : ''}</div>
    ${text ? `<div style="white-space:pre-wrap">${esc(text)}</div>` : ''}${photo ? `<img src="${photo}" data-zoom alt="">` : ''}</div>`;
  page.innerHTML = `<button class="btn sec sm" id="tBack">← Muammolar</button>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:14px 0 6px;flex-wrap:wrap">
      <h2 style="margin:0">${esc(t.title)}</h2>${t.status === 'closed' ? '<span class="badge ok">Hal qilindi</span>' : '<span class="badge warn">Ochiq</span>'}</div>
    ${t.orderId ? `<p><a href="#" id="tOrder">№${esc(t.orderNo)} buyurtmani ochish →</a></p>` : ''}
    <div class="chat" id="chat">${bubble(t.byName, t.byRole, t.text, t.photo, t.createdAt, t.by === S.me.id)}</div>
    <form id="rf" class="card" style="margin-top:12px"><textarea class="inp" name="text" maxlength="3000" placeholder="Javob yozing…" style="min-height:70px"></textarea>
      <div class="row2" style="margin-top:8px;align-items:center">${photoBtn}<button class="btn pri">Yuborish</button></div></form>
    ${canClose ? `<button class="btn ${t.status === 'closed' ? 'sec' : 'green'} block" id="tClose">${t.status === 'closed' ? 'Qayta ochish' : 'Hal qilindi ✓'}</button>` : ''}`;
  page.querySelector('#tBack').onclick = () => { if (unsubMsgs) { unsubMsgs(); unsubMsgs = null; } renderTopics(page, ctx); };
  const to = page.querySelector('#tOrder');
  if (to) to.onclick = e => { e.preventDefault(); if (S.orders.some(o => o.id === t.orderId)) ctx.openOrder(t.orderId); else toast("Bu buyurtmani ko'rishga ruxsatingiz yo'q", true); };
  const chat = page.querySelector('#chat');
  chat.addEventListener('click', async e => {
    const z = e.target.closest('[data-zoom]');
    if (z) modal(`<img src="${z.src}" style="width:100%;border-radius:10px" alt="">`, { wide: true });
    const d = e.target.closest('[data-mdel]');
    if (d) { e.preventDefault(); if (await confirmBox("Xabar o'chirilsinmi?", "O'chirish", true)) deleteDoc(doc(db, 'topics', id, 'msgs', d.dataset.mdel)).catch(er => toast(errText(er), true)); }
  });
  unsubMsgs = onSnapshot(collection(db, 'topics', id, 'msgs'), snap => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.at - b.at);
    chat.innerHTML = bubble(t.byName, t.byRole, t.text, t.photo, t.createdAt, t.by === S.me.id) +
      msgs.map(m => bubble(m.byName, m.byRole, m.text, m.photo, m.at, m.by === S.me.id, (m.by === S.me.id || S.me.role === 'admin') ? m.id : null)).join('');
    markSeen();
  }, () => {});
  const rf = page.querySelector('#rf');
  const ph = photoPicker(rf);
  rf.onsubmit = async e => {
    e.preventDefault();
    const text = rf.text.value.trim();
    if (!text && !ph.get()) return;
    const btn = rf.querySelector('button.pri'); btn.disabled = true;
    try {
      const now = Date.now();
      const m = { text, by: S.me.id, byName: S.me.fullName || '', byRole: S.me.role, at: now };
      if (ph.get()) m.photo = ph.get();
      await setDoc(doc(collection(db, 'topics', id, 'msgs')), m);
      await updateDoc(doc(db, 'topics', id), { lastAt: now, lastBy: S.me.id, lastByName: S.me.fullName || '', replies: increment(1) });
      rf.text.value = ''; ph.reset();
    } catch (er) { toast(errText(er), true); }
    btn.disabled = false;
  };
  const tc = page.querySelector('#tClose');
  if (tc) tc.onclick = async () => {
    const closing = t.status !== 'closed';
    try {
      await updateDoc(doc(db, 'topics', id), closing ? { status: 'closed', closedBy: S.me.id, closedAt: Date.now() } : { status: 'open', lastAt: Date.now() });
      t.status = closing ? 'closed' : 'open';
      toast(closing ? 'Hal qilindi' : 'Qayta ochildi');
      openTopic(page, ctx, id);
    } catch (e) { toast(errText(e), true); }
  };
}
