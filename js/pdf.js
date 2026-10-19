// Mijoz uchun narx taklifi (PDF) — Excel'dagi "Mijoz uchun" varag'iga o'xshash
import { esc, uzs, fmtPhone, toast } from './util.js';

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

export async function downloadPdf(o, pul, S, branchName) {
  if (!pul?.result) { toast('Avval narxni hisoblang', true); return; }
  toast('PDF tayyorlanmoqda…');
  await loadLib();
  const st = { kalk: S.settings.kalk, xom: S.settings.xom };
  const nomi = K.current('Sozlamalar!C13', st) || 'BARAKA MEBEL';
  const kontakt = K.current('Sozlamalar!C14', st) || '';
  const r = pul.result, t = r.tanlangan;
  const sana = new Date().toLocaleDateString('ru-RU');
  const el = document.createElement('div');
  el.innerHTML = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#141C2E;font-size:12px;padding:6px 4px;width:720px">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #E8B921;padding-bottom:8px">
      <div><div style="font-size:24px;font-weight:700;color:#00297D;letter-spacing:.5px">${esc(nomi)}</div><div style="color:#5F6B82">${esc(kontakt)}</div></div>
      <div style="text-align:right"><div style="font-size:18px;font-weight:700;color:#00297D">NARX TAKLIFI</div><div>№ ${esc(o.no)} · ${sana}</div></div>
    </div>
    <table style="width:100%;margin:12px 0;font-size:12px"><tr>
      <td><b>Mijoz:</b> ${esc(o.client?.name || '')}</td><td><b>Telefon:</b> ${esc(fmtPhone(o.client?.phone))}</td></tr>
      <tr><td><b>Sotuvchi:</b> ${esc(o.sellerName || '')}</td><td><b>Filial:</b> ${esc(branchName || '')}</td></tr>
      ${o.client?.address ? `<tr><td colspan="2"><b>Manzil:</b> ${esc(o.client.address)}</td></tr>` : ''}
    </table>
    <div style="font-weight:700;color:#00297D;margin:10px 0 6px;font-size:14px">Buyurtma tarkibi</div>
    <table style="width:100%;border-collapse:collapse;font-size:11.5px">
      <thead><tr style="background:#EAF0FA">${['№', 'Mahsulot', 'Tavsif', 'Miqdori', 'Birlik narxi', "Summa (so'm)"].map((h, i) => `<th style="padding:6px;border:1px solid #DCE2EC;text-align:${i >= 4 ? 'right' : 'left'}">${h}</th>`).join('')}</tr></thead>
      <tbody>${r.lines.map((l, i) => `<tr><td style="padding:5px 6px;border:1px solid #DCE2EC">${i + 1}</td><td style="padding:5px 6px;border:1px solid #DCE2EC"><b>${esc(l.mahsulot)}</b></td><td style="padding:5px 6px;border:1px solid #DCE2EC">${esc(l.tavsif)}</td><td style="padding:5px 6px;border:1px solid #DCE2EC;white-space:nowrap">${esc(l.miqdor)}</td><td style="padding:5px 6px;border:1px solid #DCE2EC;text-align:right;white-space:nowrap">${uzs(l.birlik)}</td><td style="padding:5px 6px;border:1px solid #DCE2EC;text-align:right;white-space:nowrap">${uzs(l.summa)}</td></tr>`).join('')}</tbody>
    </table>
    <table style="width:100%;margin-top:8px;font-size:13px">
      ${r.chegirma ? `<tr><td style="text-align:right">Jami:</td><td style="text-align:right;width:170px">${uzs(r.sotuv)}</td></tr><tr><td style="text-align:right">Chegirma:</td><td style="text-align:right">− ${uzs(r.chegirma)}</td></tr>` : ''}
      <tr><td style="text-align:right;font-weight:700">NAQD NARX:</td><td style="text-align:right;font-weight:700;font-size:16px;color:#00297D">${uzs(r.naqd)}</td></tr>
    </table>
    <div style="font-weight:700;color:#00297D;margin:14px 0 6px;font-size:14px">To'lov sharti</div>
    <div style="background:#FDF5D9;border:1px solid #F1D77F;border-radius:6px;padding:8px 10px">
      <b>${t.oy ? esc(t.turi) + " muddatli to'lov" : "Naqd to'lov"}</b>${t.oy ? ` — oldindan to'lov ${uzs(t.old)}, oylik to'lov <b>${uzs(t.oylik)}</b> × ${t.oy} oy, jami ${uzs(t.jami)}` : ` — ${uzs(r.naqd)}`}
    </div>
    <div style="font-weight:700;color:#00297D;margin:14px 0 6px;font-size:14px">To'lov variantlari</div>
    <table style="width:100%;border-collapse:collapse;font-size:11.5px">
      <thead><tr style="background:#EAF0FA">${["To'lov turi", "Oylik to'lov", 'Oy', "Oldindan to'lov", "Jami to'lov"].map((h, i) => `<th style="padding:6px;border:1px solid #DCE2EC;text-align:${i ? 'right' : 'left'}">${h}</th>`).join('')}</tr></thead>
      <tbody>${r.tariflar.map(v => { const sel = v.oy === t.oy; const c = `padding:5px 6px;border:1px solid #DCE2EC;${sel ? 'background:#E3F4EA;font-weight:700;' : ''}`; return `<tr><td style="${c}">${esc(v.turi)}</td><td style="${c}text-align:right">${v.oy ? uzs(v.oylik) : '—'}</td><td style="${c}text-align:right">${v.oy || '—'}</td><td style="${c}text-align:right">${v.oy ? uzs(t.old) : '—'}</td><td style="${c}text-align:right">${uzs(v.jami)}</td></tr>`; }).join('')}</tbody>
    </table>
    <p style="color:#5F6B82;font-size:10.5px;margin-top:8px">Narxlar ${sana} holatiga ko'ra hisoblangan. Yashil qator — tanlangan to'lov turi.${o.mebelTuri !== 'tayyor' && !o.olchov ? " Yakuniy narx o'lchovdan keyin aniqlanadi." : ''}</p>
    <table style="width:100%;margin-top:36px;font-size:12px"><tr>
      <td>Sotuvchi: ______________________</td><td style="text-align:right">Mijoz: ______________________</td></tr></table>
  </div>`;
  const name = `Baraka-mebel-${o.no}-${(o.client?.name || 'mijoz').replace(/[^\p{L}\p{N}]+/gu, '_')}.pdf`;
  await window.html2pdf().set({
    margin: [10, 10, 10, 10], filename: name, image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] },
  }).from(el.firstElementChild).save();
}
