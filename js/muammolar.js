// Muammolar: har bir sahifada pastki o'ng burchakdagi suzuvchi chat oynasi.
// Har bir muammo — alohida suhbat (topics/{id}), xabarlar — topics/{id}/msgs.
import { doc, collection, setDoc, updateDoc, deleteDoc, onSnapshot, increment } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { esc, toast, errText, modal, confirmBox, compressImage } from './util.js';

// O'qilmagan: mavzuni o'zi ochgan yoki admin — va oxirgi xabarni boshqa odam yozgan
export function unreadTopics(ctx) {
  const { S } = ctx;
  if (!S.me) return 0;
  const admin = S.me.role === 'admin';
  return S.topics.filter(t => (t.by === S.me.id || admin) && isUnread(ctx, t)).length;
}
const isUnread = (ctx, t) => t.lastBy !== ctx.S.me.id && (t.lastAt || 0) > ((ctx.S.me.seen || {})[t.id] || 0);

const COLORS = ['#E17076', '#4FAE4E', '#E5A64E', '#3D8BD9', '#8E78E0', '#E56BA3', '#3FB3B5', '#F08A4B'];
const colorOf = s => { let h = 0; for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
const avatar = (name, key, size = 40) => `<span class="cw-av" style="width:${size}px;height:${size}px;background:${colorOf(key || name)};font-size:${Math.round(size * 0.38)}px">${esc(initials(name))}</span>`;
const LOGO = size => `<span class="cw-av cw-logo" style="width:${size}px;height:${size}px"><img src="img/icon.svg" alt=""></span>`;
const hm = ms => new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayKey = ms => { const d = new Date(ms); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); };
function dayLabel(ms) {
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (dayKey(ms) === dayKey(Date.now())) return 'Bugun';
  if (dayKey(ms) === dayKey(y.getTime())) return 'Kecha';
  return new Date(ms).toLocaleDateString('ru-RU');
}
const listTime = ms => !ms ? '' : dayKey(ms) === dayKey(Date.now()) ? hm(ms) : new Date(ms).toLocaleDateString('ru-RU').slice(0, 5);

let W = null; // { ctx, el, view: 'list'|'chat', id, tab, unsub, open }

export function mountChat(ctx) {
  unmountChat();
  const el = document.createElement('div');
  el.id = 'cw';
  el.innerHTML = `<button class="cw-fab" id="cwFab" aria-label="Muammolar"><svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M12 3C6.5 3 2 6.9 2 11.7c0 2.4 1.1 4.6 3 6.2L4 22l4.6-2.3c1.1.3 2.2.5 3.4.5 5.5 0 10-3.9 10-8.6S17.5 3 12 3z"/></svg><span class="cw-badge hidden" id="cwBadge"></span></button>
    <div class="cw-box hidden" id="cwBox" role="dialog" aria-label="Muammolar"></div>`;
  document.body.appendChild(el);
  W = { ctx, el, view: 'list', id: null, tab: 'open', unsub: null, open: false };
  el.querySelector('#cwFab').onclick = () => toggle(!W.open);
  ctx.S.onTopicsChat = refresh;
  refresh();
}
export function unmountChat() {
  if (!W) return;
  W.unsub && W.unsub();
  W.el.remove();
  document.body.classList.remove('cw-on');
  W = null;
}

function toggle(open) {
  W.open = open;
  W.el.querySelector('#cwBox').classList.toggle('hidden', !open);
  W.el.classList.toggle('open', open);
  document.body.classList.toggle('cw-on', open);
  if (open) { if (W.view === 'chat') drawChat(); else drawList(); }
  else stopMsgs();
}
function stopMsgs() { if (W.unsub) { W.unsub(); W.unsub = null; } }

function refresh() {
  if (!W) return;
  const n = unreadTopics(W.ctx), b = W.el.querySelector('#cwBadge');
  b.textContent = n; b.classList.toggle('hidden', !n);
  if (!W.open) return;
  if (W.view === 'list') drawList();
  else if (W.id) updateChatHead();
}

const head = (inner, back) => `<div class="cw-head">
    ${back ? '<button class="cw-hb" data-back aria-label="Orqaga">‹</button>' : ''}
    ${inner}
    <button class="cw-hb" data-min aria-label="Yopish">✕</button>
  </div>`;
function bindHead(box) {
  box.querySelector('[data-min]').onclick = () => toggle(false);
  const b = box.querySelector('[data-back]');
  if (b) b.onclick = () => { stopMsgs(); W.view = 'list'; W.id = null; drawList(); };
}

// ---------- Ro'yxat ----------
function drawList() {
  const { S } = W.ctx, box = W.el.querySelector('#cwBox');
  const all = S.topics, nOpen = all.filter(t => t.status !== 'closed').length;
  const list = all.filter(t => (W.tab === 'open' ? t.status !== 'closed' : t.status === 'closed'));
  const row = t => {
    const un = isUnread(W.ctx, t);
    const who = t.lastBy === S.me.id ? 'Siz' : (t.lastByName || t.byName || '').split(' ')[0];
    const prev = t.replies ? `${esc(who)}: javob yozdi` : esc((t.text || '').slice(0, 70));
    return `<button class="cw-row ${un ? 'un' : ''}" data-t="${t.id}">${avatar(t.byName || t.title, t.by)}
      <span class="cw-mid"><span class="cw-l1"><b>${esc(t.title)}</b><i>${t.status === 'closed' ? '✓ ' : ''}${listTime(t.lastAt)}</i></span>
      <span class="cw-l2"><span>${t.orderNo ? `<em>№${esc(t.orderNo)}</em> ` : ''}${prev}</span>${un ? '<span class="cw-dot"></span>' : ''}</span></span></button>`;
  };
  box.innerHTML = `${head(`${LOGO(40)}<div class="cw-ht"><b>Bizga murojaat qiling!</b><span>Muammo yoki savolingizni yozing</span></div>`)}
    <div class="cw-seg"><button data-tt="open" class="${W.tab === 'open' ? 'on' : ''}">Ochiq <span>${nOpen}</span></button><button data-tt="closed" class="${W.tab === 'closed' ? 'on' : ''}">Hal qilingan <span>${all.length - nOpen}</span></button></div>
    <div class="cw-body cw-list">${list.map(row).join('') || `<div class="cw-empty">${W.tab === 'open' ? 'Ochiq muammo yo\'q 🎉' : "Hal qilingan muammo yo'q"}</div>`}</div>
    <div class="cw-foot"><button class="cw-new" id="cwNew">✎ Yangi muammo yozish</button></div>`;
  bindHead(box);
  box.querySelectorAll('[data-tt]').forEach(b => b.onclick = () => { W.tab = b.dataset.tt; drawList(); });
  box.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { W.view = 'chat'; W.id = b.dataset.t; drawChat(); });
  box.querySelector('#cwNew').onclick = () => { W.view = 'chat'; W.id = null; drawChat(); };
}

// ---------- Suhbat ----------
function chatHeadHtml(t) {
  if (!t) return `${LOGO(36)}<div class="cw-ht"><b>Yangi muammo</b><span>Baraka Mebel</span></div>`;
  const closed = t.status === 'closed';
  return `${avatar(t.byName || t.title, t.by, 36)}<div class="cw-ht"><b>${esc(t.title)}</b><span>${closed ? '✓ Hal qilindi' : 'Ochiq muammo'}${t.orderNo ? ` · <a href="#" data-order>№${esc(t.orderNo)}</a>` : ''}</span></div>`;
}
// Holat (ochiq/hal qilingan) o'zgarsa — suhbatni qayta chizamiz; aks holda yozilayotgan matn saqlanadi
function updateChatHead() {
  const t = W.ctx.S.topics.find(x => x.id === W.id), h = W.el.querySelector('.cw-head');
  if (t && h && h.dataset.st !== t.status) drawChat();
}

function drawChat() {
  const { S, db } = W.ctx, box = W.el.querySelector('#cwBox');
  stopMsgs();
  const t = W.id ? S.topics.find(x => x.id === W.id) : null;
  if (W.id && !t) { W.view = 'list'; W.id = null; drawList(); return; }
  const canClose = t && (S.me.role === 'admin' || t.by === S.me.id);
  const closed = t?.status === 'closed';
  box.innerHTML = `${head(chatHeadHtml(t), true)}
    <div class="cw-body cw-msgs" id="cwMsgs"></div>
    ${canClose ? `<div class="cw-bar"><button class="cw-act ${closed ? '' : 'ok'}" id="cwClose">${closed ? '↺ Qayta ochish' : '✓ Muammo hal qilindi'}</button></div>` : ''}
    <form class="cw-in" id="cwForm">
      <div id="cwPh"></div>
      <div class="cw-in1"><textarea name="text" rows="1" maxlength="3000" placeholder="Xabarni kiriting"></textarea><button class="cw-send" disabled aria-label="Yuborish">↑</button></div>
      <div class="cw-in2"><label class="cw-ic" title="Rasm biriktirish"><input type="file" accept="image/*" hidden>📎 Rasm</label></div>
    </form>`;
  box.querySelector('.cw-head').dataset.st = t?.status || '';
  bindHead(box);
  const msgs = box.querySelector('#cwMsgs');
  const ol = box.querySelector('[data-order]');
  if (ol) ol.onclick = e => { e.preventDefault(); if (S.orders.some(o => o.id === t.orderId)) { if (innerWidth < 600) toggle(false); W.ctx.openOrder(t.orderId); } else toast("Bu buyurtmani ko'rishga ruxsatingiz yo'q", true); };

  const greet = `<div class="cw-grp"><div class="cw-side">${LOGO(30)}</div><div class="cw-col"><div class="cw-who" style="color:var(--g)">Baraka Mebel</div><div class="cw-msg"><div class="cw-text">Assalomu alaykum! 👋
Muammo yoki savolingizni aniq yozib qoldiring. Masalan:
- qaysi bo'limda (kalkulyator, buyurtma, PDF…);
- buyurtma raqami bo'lsa — <b>№123</b> ko'rinishida yozing;
- iloji bo'lsa, rasm (skrinshot) qo'shing.

Sizga tez orada javob beramiz.</div></div></div></div>`;

  // Bir odamning ketma-ket xabarlari bitta guruhda: ism — tepada, avatar — pastda
  const draw = list => {
    let html = t ? '' : greet, day = '';
    const items = t ? [{ ...t, at: t.createdAt, first: true }, ...list] : [];
    for (let i = 0; i < items.length;) {
      const m = items[i], k = dayKey(m.at);
      if (k !== day) { html += `<div class="cw-day"><span>${dayLabel(m.at)}</span></div>`; day = k; }
      const g = [m];
      while (i + g.length < items.length && items[i + g.length].by === m.by && dayKey(items[i + g.length].at) === k) g.push(items[i + g.length]);
      i += g.length;
      const mine = m.by === S.me.id;
      html += `<div class="cw-grp ${mine ? 'me' : ''}">${mine ? '' : `<div class="cw-side">${avatar(m.byName, m.by, 30)}</div>`}<div class="cw-col">
        ${mine ? '' : `<div class="cw-who" style="color:${colorOf(m.by)}">${esc(m.byName)} <span>${esc(W.ctx.roleName(m.byRole))}</span></div>`}
        ${g.map(x => `<div class="cw-msg">${x.first && !(x.text || '').startsWith(t.title) ? `<div class="cw-title">${esc(t.title)}</div>` : ''}${x.photo ? `<img src="${x.photo}" data-zoom alt="">` : ''}${x.text ? `<div class="cw-text">${esc(x.text)}</div>` : ''}
          <div class="cw-meta">${x.delId ? `<a href="#" data-mdel="${x.delId}" title="O'chirish">🗑</a>` : ''}${hm(x.at)}${mine ? ' <b>✓✓</b>' : ''}</div></div>`).join('')}
      </div></div>`;
    }
    if (closed) html += '<div class="cw-day ok"><span>✓ Muammo hal qilindi</span></div>';
    const atBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
    msgs.innerHTML = html;
    if (atBottom || !draw.done) { msgs.scrollTop = msgs.scrollHeight; draw.done = true; }
  };
  msgs.addEventListener('click', async e => {
    const z = e.target.closest('[data-zoom]');
    if (z) modal(`<img src="${z.src}" style="width:100%;border-radius:10px" alt="">`, { wide: true });
    const d = e.target.closest('[data-mdel]');
    if (d) { e.preventDefault(); if (await confirmBox("Xabar o'chirilsinmi?", "O'chirish", true)) deleteDoc(doc(db, 'topics', W.id, 'msgs', d.dataset.mdel)).catch(er => toast(errText(er), true)); }
  });

  const markSeen = () => {
    S.me.seen = { ...(S.me.seen || {}), [t.id]: Date.now() };
    updateDoc(doc(db, 'profiles', S.me.id), { ['seen.' + t.id]: Date.now() }).catch(() => {});
    const n = unreadTopics(W.ctx), b = W.el.querySelector('#cwBadge');
    b.textContent = n; b.classList.toggle('hidden', !n);
  };
  if (t) {
    markSeen();
    W.unsub = onSnapshot(collection(db, 'topics', t.id, 'msgs'), snap => {
      draw(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.at - b.at)
        .map(m => ({ ...m, delId: (m.by === S.me.id || S.me.role === 'admin') ? m.id : null })));
      markSeen();
    }, () => { msgs.innerHTML = '<div class="cw-empty">Xabarlarni yuklab bo\'lmadi</div>'; });
  } else draw([]);

  const f = box.querySelector('#cwForm'), ta = f.text, send = f.querySelector('.cw-send');
  const fi = f.querySelector('input[type=file]');
  let photo = null;
  const sync = () => { send.disabled = !ta.value.trim() && !photo; };
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; sync(); };
  ta.addEventListener('input', grow);
  // Kompyuterda Enter — yuborish, Shift+Enter — yangi qator
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); f.requestSubmit(); } });
  const setPhoto = d => {
    photo = d;
    box.querySelector('#cwPh').innerHTML = d ? `<div class="cw-att"><img src="${d}" alt=""><button type="button" id="cwPhX" aria-label="Olib tashlash">×</button></div>` : '';
    const x = box.querySelector('#cwPhX'); if (x) x.onclick = () => { fi.value = ''; setPhoto(null); };
    sync();
  };
  fi.onchange = async () => { if (fi.files[0]) try { setPhoto(await compressImage(fi.files[0], 1280, 280000)); } catch (e) { toast(errText(e), true); } };

  f.onsubmit = async e => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text && !photo) return;
    send.disabled = true;
    const now = Date.now(), ph = photo;
    try {
      if (!t) {
        // Yangi muammo: birinchi qator — sarlavha, "№123" — buyurtmaga bog'lanadi
        const no = (text.match(/№\s*(\d+)/) || [])[1];
        const o = no ? S.orders.find(x => String(x.no) === no) : null;
        const title = (text.split('\n')[0] || 'Rasm').slice(0, 80);
        const ref = doc(collection(db, 'topics'));
        const d = { title, text, by: S.me.id, byName: S.me.fullName || '', byRole: S.me.role, branchId: S.me.branchId || '',
          orderId: o?.id || '', orderNo: o ? String(o.no) : '', status: 'open', replies: 0, createdAt: now, lastAt: now, lastBy: S.me.id, lastByName: S.me.fullName || '' };
        if (ph) d.photo = ph;
        await setDoc(ref, d);
        W.id = ref.id;
        if (!S.topics.some(x => x.id === ref.id)) S.topics.unshift({ id: ref.id, ...d });
        drawChat();
        return;
      }
      const m = { text, by: S.me.id, byName: S.me.fullName || '', byRole: S.me.role, at: now };
      if (ph) m.photo = ph;
      ta.value = ''; fi.value = ''; setPhoto(null); grow();
      await setDoc(doc(collection(db, 'topics', t.id, 'msgs')), m);
      await updateDoc(doc(db, 'topics', t.id), { lastAt: now, lastBy: S.me.id, lastByName: S.me.fullName || '', replies: increment(1) });
      msgs.scrollTop = msgs.scrollHeight;
    } catch (er) { toast(errText(er), true); sync(); }
    ta.focus();
  };
  const tc = box.querySelector('#cwClose');
  if (tc) tc.onclick = async () => {
    const closing = t.status !== 'closed';
    if (closing && !await confirmBox('Muammo hal qilindi deb belgilansinmi?', 'Ha, hal qilindi')) return;
    try {
      await updateDoc(doc(db, 'topics', t.id), closing ? { status: 'closed', closedBy: S.me.id, closedAt: Date.now() } : { status: 'open', lastAt: Date.now() });
      t.status = closing ? 'closed' : 'open';
      toast(closing ? 'Hal qilindi' : 'Qayta ochildi');
      drawChat();
    } catch (e) { toast(errText(e), true); }
  };
  if (innerWidth >= 600) ta.focus();
}
