// PDF'lar: mijoz uchun narx taklifi va ichki yakuniy hisobot (bajarilish muddati)
import { getDocs, query, collection, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { esc, uzs, fmtPhone, toast, fdt } from './util.js';
import { fullAddress } from './hududlar.js';

const K = window.KALK;
let libPromise = null;
function loadLib() {
  if (window.html2pdf) return Promise.resolve();
  if (!libPromise) libPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    s.onload = res; s.onerror = () => { libPromise = null; rej(new Error("PDF kutubxonasini yuklab bo'lmadi (internetni tekshiring)")); };
    document.head.appendChild(s);
  });
  return libPromise;
}

// A4: 210 mm − 2×10 mm chet = 190 mm ≈ 718 px (96 dpi). Mazmun 700 px — doim sig'adi.
const W = 700;
const td = (extra = '') => `padding:5px 6px;border:1px solid #DCE2EC;vertical-align:top;word-break:break-word;${extra}`;
const th = (right) => `padding:6px;border:1px solid #DCE2EC;text-align:${right ? 'right' : 'left'};background:#EAF0FA;font-weight:700`;

// Safari (Mac, iPhone) ekrandan tashqaridagi (left:-10000px) elementni noto'g'ri suratga oladi —
// faqat bitta tor ustun chiqadi. Shuning uchun sahifa ekranning chap-yuqori burchagida yasaladi,
// ustidan "tayyorlanmoqda" pardasi yopib turadi (html2canvas faqat elementning o'zini chizadi).
async function render(html, filename) {
  await loadLib();
  const cover = document.createElement('div');
  cover.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#fff;display:flex;align-items:center;justify-content:center;font:600 16px system-ui,sans-serif;color:#00297D';
  cover.textContent = 'PDF tayyorlanmoqda…';
  const holder = document.createElement('div');
  holder.style.cssText = `position:absolute;left:0;top:0;width:${W}px;background:#fff;z-index:2147482000`;
  holder.innerHTML = html;
  document.body.append(holder, cover);
  const sx = window.scrollX, sy = window.scrollY;
  window.scrollTo(0, 0);
  try {
    // Rasmlar (logotip, yetkazish rasmlari) yuklanib bo'lsin
    await Promise.all([...holder.querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
    const el = holder.firstElementChild;
    // iPhone'da canvas hajmi cheklangan (~16 mln piksel) — uzun hujjatda sifat biroz pasaytiriladi
    const scale = Math.max(1, Math.min(2, Math.sqrt(16e6 / (W * Math.max(1, el.scrollHeight)))));
    await window.html2pdf().set({
      margin: [10, 10, 12, 10], filename, image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale, useCORS: true, width: W, windowWidth: W, x: 0, y: 0, scrollX: 0, scrollY: 0, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.keep'] },
    }).from(el).save();
  } finally { holder.remove(); cover.remove(); window.scrollTo(sx, sy); }
}
const safeName = s => (s || 'mijoz').replace(/[^\p{L}\p{N}]+/gu, '_');

function header(nomi, kontakt, title, sub, badge) {
  return `<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;border-bottom:3px solid #E8B921;padding-bottom:8px">
      <div style="min-width:0"><img src="img/logo-full.png" alt="" style="height:46px;display:block;margin-bottom:4px"><div style="font-size:13px;font-weight:700;color:#00297D">${esc(nomi)}</div><div style="color:#5F6B82;font-size:11px">${esc(kontakt || '')}</div></div>
      <div style="text-align:right;flex:none"><div style="font-size:16px;font-weight:700;color:#00297D">${title}</div>${badge || ''}<div style="font-size:11px">${sub}</div></div>
    </div>`;
}

export async function downloadPdf(o, pul, S, branchName) {
  if (!pul?.result) { toast('Avval narxni hisoblang', true); return; }
  toast('PDF tayyorlanmoqda…');
  const st = { kalk: S.settings.kalk, xom: S.settings.xom };
  const nomi = K.current('Sozlamalar!C13', st) || 'BARAKA MEBEL';
  const kontakt = K.current('Sozlamalar!C14', st) || '';
  const r = pul.result, t = r.tanlangan;
  const sana = new Date().toLocaleDateString('ru-RU');
  const ok = pul.skoring?.qaror === 'tasdiq';
  const muddatli = t.oy > 0;
  const title = ok ? 'NARX TAKLIFI — TASDIQLANGAN' : 'NARX TAKLIFI';
  const badge = ok ? `<div style="color:#1E8A4C;font-weight:700;font-size:11px">✓ Tasdiqlangan: ${new Date(pul.skoring.at).toLocaleDateString('ru-RU')}</div>` : '';
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#141C2E;font-size:11.5px;width:${W}px;box-sizing:border-box">
    ${header(nomi, kontakt, title, `№ ${esc(o.no)} · ${sana}`, badge)}
    <table style="width:100%;margin:10px 0;font-size:11.5px;border-collapse:collapse"><tr>
      <td style="padding:2px 0;width:55%"><b>Mijoz:</b> ${esc(o.client?.name || '')}</td><td style="padding:2px 0"><b>Telefon:</b> ${esc(fmtPhone(o.client?.phone))}</td></tr>
      <tr><td style="padding:2px 0"><b>Sotuvchi:</b> ${esc(o.sellerName || '')}</td><td style="padding:2px 0"><b>Filial:</b> ${esc(branchName || '')}</td></tr>
      ${fullAddress(o.client) ? `<tr><td colspan="2" style="padding:2px 0"><b>Manzil:</b> ${esc(fullAddress(o.client))}</td></tr>` : ''}
    </table>
    <div style="font-weight:700;color:#00297D;margin:8px 0 6px;font-size:13px">Buyurtma tarkibi</div>
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px">
      <colgroup><col style="width:26px"><col style="width:96px"><col><col style="width:62px"><col style="width:100px"><col style="width:104px"></colgroup>
      <thead><tr><th style="${th()}">№</th><th style="${th()}">Mahsulot</th><th style="${th()}">Tavsif</th><th style="${th()}">Miqdori</th><th style="${th(1)}">Birlik narxi</th><th style="${th(1)}">Summa</th></tr></thead>
      <tbody>${r.lines.map((l, i) => `<tr><td style="${td()}">${i + 1}</td><td style="${td()}"><b>${esc(l.mahsulot)}</b></td><td style="${td()}">${esc(l.tavsif)}</td><td style="${td()}">${esc(l.miqdor)}</td><td style="${td('text-align:right;white-space:nowrap')}">${uzs(l.birlik)}</td><td style="${td('text-align:right;white-space:nowrap')}">${uzs(l.summa)}</td></tr>`).join('')}</tbody>
    </table>
    <table class="keep" style="width:100%;margin-top:8px;font-size:12.5px;border-collapse:collapse">
      ${r.chegirma ? `<tr><td style="text-align:right;padding:2px 8px">Jami:</td><td style="text-align:right;width:150px;padding:2px 0">${uzs(r.sotuv)}</td></tr><tr><td style="text-align:right;padding:2px 8px">Chegirma:</td><td style="text-align:right;padding:2px 0">− ${uzs(r.chegirma)}</td></tr>` : ''}
      <tr><td style="text-align:right;font-weight:700;padding:2px 8px">NAQD NARX:</td><td style="text-align:right;font-weight:700;font-size:15px;color:#00297D;padding:2px 0;white-space:nowrap">${uzs(r.naqd)}</td></tr>
    </table>
    <div class="keep">
    <div style="font-weight:700;color:#00297D;margin:12px 0 6px;font-size:13px">To'lov sharti</div>
    <div style="background:#FDF5D9;border:1px solid #F1D77F;border-radius:6px;padding:8px 10px">
      <b>${muddatli ? esc(t.turi) + " muddatli to'lov" : "Naqd to'lov"}</b>${muddatli ? ` — oldindan to'lov ${uzs(t.old)}, oylik to'lov <b>${uzs(t.oylik)}</b> × ${t.oy} oy, jami ${uzs(t.jami)}` : ` — ${uzs(r.naqd)}`}
      ${muddatli && !ok ? `<div style="color:#B7791F;margin-top:4px;font-size:10.5px">Muddatli to'lov shartnoma tekshiruvidan keyin tasdiqlanadi.</div>` : ''}
    </div></div>
    <div class="keep">
    <div style="font-weight:700;color:#00297D;margin:12px 0 6px;font-size:13px">To'lov variantlari</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr>${["To'lov turi", "Oylik to'lov", 'Oy', "Oldindan to'lov", "Jami to'lov"].map((h, i) => `<th style="${th(i)}">${h}</th>`).join('')}</tr></thead>
      <tbody>${r.tariflar.map(v => { const sel = v.oy === t.oy; const c = td(sel ? 'background:#E3F4EA;font-weight:700;' : ''); return `<tr><td style="${c}">${esc(v.turi)}</td><td style="${c}text-align:right">${v.oy ? uzs(v.oylik) : '—'}</td><td style="${c}text-align:right">${v.oy || '—'}</td><td style="${c}text-align:right">${v.oy ? uzs(t.old) : '—'}</td><td style="${c}text-align:right">${uzs(v.jami)}</td></tr>`; }).join('')}</tbody>
    </table></div>
    <p style="color:#5F6B82;font-size:10px;margin-top:8px">Narxlar ${sana} holatiga ko'ra hisoblangan. Yashil qator — tanlangan to'lov turi.${o.mebelTuri !== 'tayyor' && !o.olchov ? " Yakuniy narx o'lchovdan keyin aniqlanadi." : ''}</p>
    <table class="keep" style="width:100%;margin-top:30px;font-size:11.5px"><tr>
      <td>Sotuvchi: ______________________</td><td style="text-align:right">Mijoz: ______________________</td></tr></table>
  </div>`;
  await render(html, `Baraka-mebel-${o.no}-${safeName(o.client?.name)}.pdf`);
}

// ---------- Yakuniy (ichki) hisobot: muddat va bosqichlar, narxsiz ----------
const DAY = 86400000;
const dur = ms => {
  if (ms == null || ms < 0) return '—';
  if (ms < 3600000) return Math.max(1, Math.round(ms / 60000)) + ' daqiqa';
  if (ms < DAY) return Math.round(ms / 3600000) + ' soat';
  const d = Math.floor(ms / DAY), h = Math.round((ms - d * DAY) / 3600000);
  return d + ' kun' + (h ? ' ' + h + ' soat' : '');
};
const dstr = ms => ms ? new Date(ms).toLocaleDateString('ru-RU') + ' ' + new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—';

// Bosqich boshlangan vaqti: stageAt yoki tarixdan (eski buyurtmalar uchun)
function stageTimes(o, ctx) {
  const at = { ...(o.stageAt || {}) };
  const created = o.createdAt?.toMillis?.() || (o.log?.[0]?.t) || null;
  if (!at.murojaat && created) at.murojaat = created;
  const pats = [
    ['skoring', /Rasmiylashtirildi.*Shartnomachida|shartnomachiga qayta/], ['olchov', /Rasmiylashtirildi.*O'lchovda|Shartnoma chiqarilsin/],
    ['olchandi', /^O'lchandi/], ['ustaga', /Ustaga biriktirishga yuborildi|Rasmiylashtirildi.*Ustaga/], ['usta_tasdiq', /Usta biriktirildi|Usta almashtirildi/],
    ['kesish', /ishni qabul qildi|narxni tasdiqladi/], ['yigish', /kesildi/], ['qadoqlash', /Yig'ish tugadi/], ['yetkazish', /^Qadoqlandi/], ['yakunlandi', /yetkazib berildi/],
  ];
  for (const [st, re] of pats) if (!at[st]) { const l = (o.log || []).find(x => re.test(x.m)); if (l) at[st] = l.t; }
  if (!at.yakunlandi && o.yetkazildi) at.yakunlandi = o.yetkazildi;
  return at;
}

export async function downloadFinalPdf(o, S, ctx) {
  toast('Yakuniy PDF tayyorlanmoqda…');
  const st = { kalk: S.settings.kalk, xom: S.settings.xom };
  const nomi = K.current('Sozlamalar!C13', st) || 'BARAKA MEBEL';
  const at = stageTimes(o, ctx);
  const path = ctx.stagePath(o);
  const rows = path.slice(0, -1).map((s, i) => {
    const start = at[s], end = at[path[i + 1]];
    return { s, start, end, ms: start && end ? end - start : null };
  }).filter(r => r.start);
  const total = at.yakunlandi && at.murojaat ? at.yakunlandi - at.murojaat : null;
  const work = at.yakunlandi && at.kesish ? at.yakunlandi - at.kesish : null;
  const mi = ctx.muddatInfo(o);
  const doneD = at.yakunlandi ? new Date(at.yakunlandi) : null;
  let big = '', bigColor = '#0E7490', bigText = '';
  if (o.muddat && doneD) {
    const ds = new Date(doneD.getFullYear(), doneD.getMonth(), doneD.getDate());
    const md = new Date(o.muddat + 'T00:00:00');
    const diff = Math.round((md - ds) / DAY);
    if (diff > 0) { big = diff + ' kun'; bigText = "va'da qilingan muddatdan oldin bajarildi"; }
    else if (diff === 0) { big = '✓'; bigText = 'muddatida bajarildi'; }
    else { big = (-diff) + ' kun'; bigText = 'kechikib bajarildi'; bigColor = '#C8372D'; }
  }
  let photos = [];
  try { photos = (await getDocs(query(collection(ctx.db, 'photos'), where('orderId', '==', o.id), where('kind', '==', 'yetkazish')))).docs.map(d => d.data().data); } catch (e) { /* ruxsat yo'q */ }
  const who = [['Sotuvchi', o.sellerName], ["O'lchovchi", o.olchovchiName && ctx.staffName(o.olchovchiId, o.olchovchiName)], ['Usta', o.ustaName && ctx.staffName(o.ustaId, o.ustaName)]].filter(x => x[1]);
  const skLog = (o.log || []).find(l => /Shartnoma chiqarilsin|Shartnoma bekor/.test(l.m));
  if (skLog) who.splice(1, 0, ['Shartnomachi', skLog.n]);
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#141C2E;font-size:11.5px;width:${W}px;box-sizing:border-box">
    ${header(nomi, 'Ichki hisobot', 'BAJARILISH HISOBOTI', `№ ${esc(o.no)} · ${new Date().toLocaleDateString('ru-RU')}`)}
    <table style="width:100%;margin:10px 0;font-size:11.5px"><tr><td><b>Mijoz:</b> ${esc(o.client?.name || '')}</td><td><b>Kategoriya:</b> ${esc(o.kategoriya || '')}</td></tr>
      <tr><td colspan="2"><b>Manzil:</b> ${esc(fullAddress(o.client) || '—')}</td></tr></table>
    <div class="keep" style="display:flex;gap:14px;align-items:stretch;margin:6px 0 12px">
      <div style="flex:0 0 220px;border:2px solid ${bigColor};border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:44px;font-weight:700;color:${bigColor};line-height:1.05">${big || '—'}</div>
        <div style="color:${bigColor};font-weight:700;margin-top:4px">${esc(bigText || (o.muddat ? '' : 'muddat belgilanmagan'))}</div>
      </div>
      <table style="flex:1;border-collapse:collapse;font-size:12px">
        <tr><td style="${td()}">Va'da qilingan sana</td><td style="${td('font-weight:700')}">${o.muddat ? esc(o.muddat.split('-').reverse().join('.')) : '—'}</td></tr>
        <tr><td style="${td()}">Haqiqiy yakunlangan</td><td style="${td('font-weight:700')}">${dstr(at.yakunlandi)}</td></tr>
        <tr><td style="${td()}">Jami ketgan vaqt (murojaatdan)</td><td style="${td('font-weight:700')}">${dur(total)}</td></tr>
        <tr><td style="${td()}">Usta ishi (qabul qilgandan)</td><td style="${td('font-weight:700')}">${dur(work)}</td></tr>
      </table>
    </div>
    <div style="font-weight:700;color:#00297D;margin:8px 0 6px;font-size:13px">Bosqichlar</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr><th style="${th()}">Bosqich</th><th style="${th()}">Boshlandi</th><th style="${th()}">Tugadi</th><th style="${th(1)}">Ketgan vaqt</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td style="${td()}">${esc(ctx.STAGES[r.s].t)}</td><td style="${td()}">${dstr(r.start)}</td><td style="${td()}">${dstr(r.end)}</td><td style="${td('text-align:right;font-weight:700')}">${dur(r.ms)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="keep">
    <div style="font-weight:700;color:#00297D;margin:12px 0 6px;font-size:13px">Kim bajardi</div>
    <table style="width:100%;border-collapse:collapse;font-size:11.5px">${who.map(w => `<tr><td style="${td('width:160px')}">${w[0]}</td><td style="${td('font-weight:700')}">${esc(w[1])}</td></tr>`).join('')}</table></div>
    ${photos.length ? `<div style="font-weight:700;color:#00297D;margin:12px 0 6px;font-size:13px">Yetkazib berish rasmlari</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${photos.map(p => `<img src="${p}" style="width:${Math.floor((W - 18) / 4)}px;height:${Math.floor((W - 18) / 4)}px;object-fit:cover;border-radius:6px;border:1px solid #DCE2EC">`).join('')}</div>` : ''}
    <p style="color:#5F6B82;font-size:10px;margin-top:10px">Ichki hisobot. Tuzildi: ${fdt(Date.now())}</p>
  </div>`;
  await render(html, `Baraka-mebel-${o.no}-hisobot.pdf`);
}
