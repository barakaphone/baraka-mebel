// Muammolar: har bir muammo alohida mavzu, ko'rinishi Telegram chatlariga o'xshash
import { doc, collection, setDoc, updateDoc, deleteDoc, onSnapshot, increment } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { esc, toast, errText, modal, confirmBox, compressImage } from './util.js';

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

// Telegram uslubidagi yordamchilar
const COLORS = ['#E17076', '#7BC862', '#E5A64E', '#65AADD', '#A695E7', '#EE7AAE', '#6EC9CB', '#FAA774'];
const colorOf = s => { let h = 0; for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
const avatar = (name, key, size = 46) => `<span class="tg-av" style="width:${size}px;height:${size}px;background:${colorOf(key || name)};font-size:${Math.round(size * 0.38)}px">${esc(initials(name))}</span>`;
const hm = ms => new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayKey = ms => { const d = new Date(ms); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); };
function dayLabel(ms) {
  const d = new Date(ms), now = new Date();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (dayKey(ms) === dayKey(now.getTime())) return 'Bugun';
  if (dayKey(ms) === dayKey(y.getTime())) return 'Kecha';
  return d.toLocaleDateString('ru-RU');
}
function listTime(ms) {
  if (!ms) return '';
  if (dayKey(ms) === dayKey(Date.now())) return hm(ms);
  const d = new Date(ms), diff = (Date.now() - ms) / 86400000;
  if (diff < 6) return ['Yak', 'Du', 'Se', 'Chor', 'Pay', 'Ju', 'Sha'][d.getDay()];
  return d.toLocaleDateString('ru-RU').slice(0, 5);
}

export function renderTopics(page, ctx) {
  if (unsubMsgs) { unsubMsgs(); unsubMsgs = null; }
  document.body.classList.remove('tg-open');
  const { S } = ctx;
  const all = S.topics;
  const list = all.filter(t => (tab === 'open' ? t.status !== 'closed' : t.status === 'closed'));
  const nOpen = all.filter(t => t.status !== 'closed').length;
  const row = t => {
    const un = isUnread(ctx, t);
    const who = t.lastBy === S.me.id ? 'Siz' : (t.lastByName || t.byName || '').split(' ')[0];
    const preview = t.replies ? `${esc(who)}: javob yozdi` : esc((t.text || 'Yangi muammo').slice(0, 80));
    return `<button class="tg-row" data-t="${t.id}">
      ${avatar(t.title, t.id)}
      <span class="tg-mid"><span class="tg-l1"><b>${esc(t.title)}</b><span class="tg-time ${un ? 'un' : ''}">${t.status === 'closed' ? '<span class="tg-ok">✓✓</span> ' : ''}${listTime(t.lastAt)}</span></span>
        <span class="tg-l2"><span class="tg-prev">${t.orderNo ? `<span class="tg-no">№${esc(t.orderNo)}</span> ` : ''}${preview}</span>${un ? '<span class="tg-badge">yangi</span>' : t.replies ? `<span class="tg-cnt">${t.replies}</span>` : ''}</span></span>
    </button>`;
  };
  page.innerHTML = `<div class="tg-list">
      <div class="tg-head"><h2>💬 Muammolar</h2></div>
      <div class="tg-seg"><button class="${tab === 'open' ? 'on' : ''}" data-tt="open">Ochiq <span>${nOpen}</span></button><button class="${tab === 'closed' ? 'on' : ''}" data-tt="closed">Hal qilingan <span>${all.length - nOpen}</span></button></div>
      <div class="tg-rows">${list.map(row).join('') || `<div class="empty">${tab === 'open' ? "Ochiq muammo yo'q 🎉<br><span class=\"hint\">Muammo bo'lsa, pastdagi ✎ tugmasini bosing</span>" : "Hal qilingan muammo yo'q"}</div>`}</div>
      <button class="tg-fab" id="newT" title="Muammo yozish" aria-label="Muammo yozish">✎</button>
    </div>`;
  page.querySelectorAll('[data-tt]').forEach(b => b.onclick = () => { tab = b.dataset.tt; renderTopics(page, ctx); });
  page.querySelectorAll('[data-t]').forEach(b => b.onclick = () => openTopic(page, ctx, b.dataset.t));
  page.querySelector('#newT').onclick = () => newTopic(page, ctx);
  S.onTopics = () => renderTopics(page, ctx);
}

function photoPicker(root, onPick) {
  let data = null;
  const input = root.querySelector('input[type=file]');
  input.onchange = async () => {
    const f = input.files[0];
    if (!f) return;
    try { data = await compressImage(f, 1280, 280000); onPick && onPick(data); }
    catch (e) { toast(errText(e), true); }
  };
  return { get: () => data, reset: () => { data = null; input.value = ''; onPick && onPick(null); } };
}

function newTopic(page, ctx) {
  const { S } = ctx;
  const orders = S.orders.slice().sort((a, b) => (b.no || 0) - (a.no || 0)).slice(0, 300);
  const m = modal(`<h2>Yangi muammo</h2><form id="tf">
    <div class="field"><label>Sarlavha *</label><input class="inp" name="title" required maxlength="150" placeholder="Masalan: Kalkulyatorda oshxona narxi chiqmayapti"></div>
    <div class="field"><label>Muammoning tavsifi</label><textarea class="inp" name="text" maxlength="3000"></textarea></div>
    ${orders.length ? `<div class="field"><label>Buyurtma (ixtiyoriy)</label><select class="inp" name="order"><option value="">—</option>${orders.map(o => `<option value="${o.id}">№${o.no} · ${esc(o.client?.name || '')}</option>`).join('')}</select></div>` : ''}
    <div class="field"><label class="btn sec sm" style="cursor:pointer"><input type="file" accept="image/*" hidden><span id="tfPh">📎 Rasm biriktirish</span></label></div>
    <div class="err hidden" id="tfErr"></div><button class="btn pri block">Yuborish</button></form>`);
  const f = m.el.querySelector('#tf');
  const ph = photoPicker(f, d => { f.querySelector('#tfPh').innerHTML = d ? `<img src="${d}" style="height:40px;border-radius:6px;vertical-align:middle"> rasm tanlandi` : '📎 Rasm biriktirish'; });
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
      m.close(); openTopic(page, ctx, ref.id);
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
  document.body.classList.add('tg-open');
  const closed = t.status === 'closed';
  page.innerHTML = `<div class="tg-chat">
    <div class="tg-bar">
      <button class="tg-back" id="tBack" aria-label="Orqaga">←</button>
      ${avatar(t.title, t.id, 40)}
      <div class="tg-bt"><b>${esc(t.title)}</b><span id="tSub">${closed ? '✓ Hal qilindi' : 'Ochiq muammo'}${t.orderNo ? ` · <a href="#" id="tOrder">№${esc(t.orderNo)} buyurtma</a>` : ''}</span></div>
      ${canClose ? `<button class="btn ${closed ? 'sec' : 'green'} sm" id="tClose">${closed ? 'Qayta ochish' : '✓ Hal qilindi'}</button>` : ''}
    </div>
    <div class="tg-msgs" id="chat"><div class="loading">…</div></div>
    <form class="tg-input" id="rf">
      <label class="tg-ic" title="Rasm"><input type="file" accept="image/*" hidden>📎</label>
      <div class="tg-tx"><div id="rfPh"></div><textarea name="text" rows="1" maxlength="3000" placeholder="Xabar yozing…"></textarea></div>
      <button class="tg-send" aria-label="Yuborish">➤</button>
    </form>
  </div>`;
  const chat = page.querySelector('#chat');
  const back = () => { if (unsubMsgs) { unsubMsgs(); unsubMsgs = null; } renderTopics(page, ctx); window.scrollTo(0, 0); };
  page.querySelector('#tBack').onclick = back;
  const to = page.querySelector('#tOrder');
  if (to) to.onclick = e => { e.preventDefault(); if (S.orders.some(o => o.id === t.orderId)) { document.body.classList.remove('tg-open'); ctx.openOrder(t.orderId); } else toast("Bu buyurtmani ko'rishga ruxsatingiz yo'q", true); };

  const bubble = (m, mine, first) => `<div class="tg-msg ${mine ? 'me' : ''}">
      ${!mine ? `<div class="tg-who" style="color:${colorOf(m.by)}">${esc(m.byName)} <span>· ${esc(ctx.roleName(m.byRole))}</span></div>` : ''}
      ${first ? `<div class="tg-title">${esc(t.title)}</div>` : ''}
      ${m.photo ? `<img src="${m.photo}" data-zoom alt="">` : ''}
      ${m.text ? `<div class="tg-text">${esc(m.text)}</div>` : ''}
      <div class="tg-meta">${m.delId ? `<a href="#" data-mdel="${m.delId}" title="O'chirish">🗑</a> ` : ''}${hm(m.at)}${mine ? ' <span class="tg-ok">✓✓</span>' : ''}</div>
    </div>`;
  const draw = msgs => {
    const all = [{ ...t, at: t.createdAt, first: true }, ...msgs];
    let html = '', lastDay = '';
    for (const m of all) {
      const k = dayKey(m.at);
      if (k !== lastDay) { html += `<div class="tg-day"><span>${dayLabel(m.at)}</span></div>`; lastDay = k; }
      html += bubble(m, m.by === S.me.id, m.first);
    }
    if (t.status === 'closed') html += `<div class="tg-day"><span>✓ Muammo hal qilindi</span></div>`;
    const atBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 80;
    chat.innerHTML = html;
    if (atBottom || !draw.done) { chat.scrollTop = chat.scrollHeight; draw.done = true; }
  };
  chat.addEventListener('click', async e => {
    const z = e.target.closest('[data-zoom]');
    if (z) modal(`<img src="${z.src}" style="width:100%;border-radius:10px" alt="">`, { wide: true });
    const d = e.target.closest('[data-mdel]');
    if (d) { e.preventDefault(); if (await confirmBox("Xabar o'chirilsinmi?", "O'chirish", true)) deleteDoc(doc(db, 'topics', id, 'msgs', d.dataset.mdel)).catch(er => toast(errText(er), true)); }
  });
  unsubMsgs = onSnapshot(collection(db, 'topics', id, 'msgs'), snap => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.at - b.at)
      .map(m => ({ ...m, delId: (m.by === S.me.id || S.me.role === 'admin') ? m.id : null }));
    draw(msgs);
    markSeen();
  }, () => { chat.innerHTML = '<div class="empty">Xabarlarni yuklab bo\'lmadi</div>'; });

  const rf = page.querySelector('#rf');
  const ta = rf.text;
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; };
  ta.addEventListener('input', grow);
  // Kompyuterda Enter — yuborish, Shift+Enter — yangi qator
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); rf.requestSubmit(); } });
  const ph = photoPicker(rf, d => { page.querySelector('#rfPh').innerHTML = d ? `<div class="tg-att"><img src="${d}" alt=""><button type="button" id="rfX">×</button></div>` : ''; const x = page.querySelector('#rfX'); if (x) x.onclick = () => ph.reset(); });
  rf.onsubmit = async e => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text && !ph.get()) return;
    const btn = rf.querySelector('.tg-send'); btn.disabled = true;
    try {
      const now = Date.now();
      const m = { text, by: S.me.id, byName: S.me.fullName || '', byRole: S.me.role, at: now };
      if (ph.get()) m.photo = ph.get();
      ta.value = ''; grow(); ph.reset();
      await setDoc(doc(collection(db, 'topics', id, 'msgs')), m);
      await updateDoc(doc(db, 'topics', id), { lastAt: now, lastBy: S.me.id, lastByName: S.me.fullName || '', replies: increment(1) });
      chat.scrollTop = chat.scrollHeight;
    } catch (er) { toast(errText(er), true); }
    btn.disabled = false; ta.focus();
  };
  const tc = page.querySelector('#tClose');
  if (tc) tc.onclick = async () => {
    const closing = t.status !== 'closed';
    if (closing && !await confirmBox('Muammo hal qilindi deb belgilansinmi?', 'Ha, hal qilindi')) return;
    try {
      await updateDoc(doc(db, 'topics', id), closing ? { status: 'closed', closedBy: S.me.id, closedAt: Date.now() } : { status: 'open', lastAt: Date.now() });
      t.status = closing ? 'closed' : 'open';
      toast(closing ? 'Hal qilindi' : 'Qayta ochildi');
      openTopic(page, ctx, id);
    } catch (e) { toast(errText(e), true); }
  };
}
