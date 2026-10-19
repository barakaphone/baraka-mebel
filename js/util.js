// Umumiy yordamchilar
export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sum = n => Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const uzs = n => sum(n) + ' so\'m';
export const pct = (n, d = 1) => (Math.round((n || 0) * 100 * Math.pow(10, d)) / Math.pow(10, d)).toString().replace('.', ',') + '%';
export const digits = v => String(v ?? '').replace(/\D/g, '');
export const normPhone = v => { const d = digits(v); return d.length === 9 ? '998' + d : d; };
export const fmtPhone = v => {
  const d = normPhone(v);
  if (d.length !== 12) return v ? '+' + d : '';
  return `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
};
export const toDate = ts => !ts ? null : ts.toDate ? ts.toDate() : new Date(ts);
export const fdate = ts => { const d = toDate(ts); return d ? d.toLocaleDateString('ru-RU') : '—'; };
export const fdt = ts => { const d = toDate(ts); return d ? d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—'; };
export const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
export const parseNum = v => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };

export function toast(t, bad) {
  const e = $('#toast'); e.textContent = t; e.classList.toggle('bad', !!bad); e.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('show'), 2800);
}

export const errText = e => {
  const c = e?.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'Telefon raqami yoki parol noto\'g\'ri';
  if (c.includes('email-already-in-use')) return 'Bu telefon raqami bilan xodim allaqachon ro\'yxatdan o\'tgan';
  if (c.includes('weak-password')) return 'Parol juda oddiy, kamida 6 belgi kiriting';
  if (c.includes('too-many-requests')) return 'Juda ko\'p urinish. Birozdan keyin qayta urinib ko\'ring';
  if (c.includes('network') || c.includes('unavailable')) return 'Internet aloqasi yo\'q';
  if (c.includes('permission-denied')) return 'Ruxsat yo\'q (xavfsizlik qoidalari rad etdi)';
  if (c === 'x-inactive') return 'Bu login bloklangan yoki parol yangilangan. Admin bergan yangi parol bilan kiring';
  return e?.message || String(e);
};

// Modal oyna
export function modal(html, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-bg';
  wrap.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''}"><button class="mclose" aria-label="Yopish">×</button>${html}</div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('noscroll');
  const close = () => { wrap.remove(); if (!document.querySelector('.modal-bg')) document.body.classList.remove('noscroll'); opts.onClose && opts.onClose(); };
  wrap.querySelector('.mclose').onclick = close;
  wrap.addEventListener('click', e => { if (e.target === wrap && !opts.sticky) close(); });
  return { el: wrap.querySelector('.modal'), close };
}

export function confirmBox(text, okText = 'Ha', danger = false) {
  return new Promise(res => {
    const m = modal(`<p class="mtext">${text}</p><div class="row2"><button class="btn sec" data-no>Yo'q</button><button class="btn ${danger ? 'red' : 'pri'}" data-ok>${esc(okText)}</button></div>`, { onClose: () => res(false) });
    m.el.querySelector('[data-no]').onclick = () => { m.close(); };
    m.el.querySelector('[data-ok]').onclick = () => { res(true); m.close(); };
  });
}

// Rasmni siqish: uzun tomoni maxSide gacha, JPEG, hajmi maxLen belgidan oshmasin
export function compressImage(file, maxSide = 1600, maxLen = 380000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let side = maxSide, out = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        const k = Math.min(1, side / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        let q = 0.85;
        out = cv.toDataURL('image/jpeg', q);
        while (out.length > maxLen && q > 0.45) { q -= 0.1; out = cv.toDataURL('image/jpeg', q); }
        if (out.length <= maxLen) break;
        side = Math.round(side * 0.75);
      }
      out.length <= maxLen ? resolve(out) : reject(new Error('Rasm juda katta'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Rasmni o\'qib bo\'lmadi')); };
    img.src = url;
  });
}

// ---------- Telefon va pul maydonlari ----------
// Telefon: "+998" doim turadi, qolgan 9 raqam "91 697 07 20" ko'rinishida
export const phoneLocal = v => {
  let d = digits(v);
  if (d.length > 9 && d.startsWith('998')) d = d.slice(3);
  d = d.slice(0, 9);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');
};
export const phoneField = (name, value, extra = '') =>
  `<div class="phone-in"><span>+998</span><input class="inp" name="${name}" data-phone inputmode="numeric" autocomplete="off" placeholder="90 123 45 67" value="${esc(value ? phoneLocal(value) : '')}" ${extra}></div>`;
// Pul: "2 500 000"
export const moneyFmt = v => { const d = digits(v); return d ? d.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : ''; };

function keepCaret(el, formatted) {
  // kursor oldidagi raqamlar soni saqlanadi
  const pos = el.selectionStart ?? el.value.length;
  const before = digits(el.value.slice(0, pos)).length;
  el.value = formatted;
  let i = 0, seen = 0;
  while (i < formatted.length && seen < before) { if (/\d/.test(formatted[i])) seen++; i++; }
  try { el.setSelectionRange(i, i); } catch (e) { /* type=tel emas */ }
}
document.addEventListener('input', e => {
  const t = e.target;
  if (t.matches?.('[data-phone]')) keepCaret(t, phoneLocal(t.value));
  else if (t.matches?.('[data-money]')) keepCaret(t, moneyFmt(t.value));
}, true);
