// Hisobot: rasmiylashtirilgan buyurtmalar bo'yicha tannarx, chegirma, sotilgan summa va foyda
import { getDocs, collectionGroup } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { esc, uzs, pct, toast, errText } from './util.js';

const F = { period: 'month', from: '', to: '', branch: '', seller: '', done: false };
let xlsxPromise = null;
const loadXlsx = () => window.XLSX ? Promise.resolve() : (xlsxPromise ||= new Promise((res, rej) => {
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  s.onload = res; s.onerror = () => { xlsxPromise = null; rej(new Error("Excel kutubxonasini yuklab bo'lmadi")); };
  document.head.appendChild(s);
}));

const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function range() {
  const now = new Date();
  if (F.period === 'month') return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), Infinity];
  if (F.period === 'prev') return [new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), new Date(now.getFullYear(), now.getMonth(), 1).getTime()];
  if (F.period === 'year') return [new Date(now.getFullYear(), 0, 1).getTime(), Infinity];
  if (F.period === 'custom') return [F.from ? new Date(F.from + 'T00:00:00').getTime() : 0, F.to ? new Date(F.to + 'T00:00:00').getTime() + 86400000 : Infinity];
  return [0, Infinity];
}

// Bitta buyurtma qatori. Tannarx: hisobdagi tan narx, usta haqi — haqiqatda biriktirilgan ustaniki.
function rowOf(o, p) {
  const r = p.result || {}, t = r.tanlangan || {};
  const plan = (p.ustaBaza || 0) * (p.planFoiz || 0);
  const actual = p.ustaHaqi != null ? p.ustaHaqi : plan;
  const tan = (r.tan || 0) - plan + actual;
  const muddatli = (t.oy || 0) > 0;
  const sotuv = muddatli ? (t.jami || 0) : (r.naqd || 0);
  return {
    o, name: o.client?.name || '', xarid: [...new Set((r.lines || []).map(l => l.mahsulot))].join(', '),
    tolov: muddatli ? t.turi : 'Naqd', tan, cheg: r.chegirma || 0, chegFoiz: r.chegFoiz || 0, sotuv,
    foyda: sotuv - tan, savdo: (r.naqd || 0) - tan, ustamaF: muddatli ? (t.jami || 0) - (r.naqd || 0) : 0,
  };
}

export async function renderReport(page, ctx) {
  const { S } = ctx;
  page.innerHTML = '<h2>Hisobot</h2><div class="loading">Yuklanmoqda…</div>';
  let pul;
  try {
    const snap = await getDocs(collectionGroup(ctx.db, 'pul'));
    pul = new Map(snap.docs.map(d => [d.ref.parent.parent.id, d.data()]));
  } catch (e) { page.innerHTML = `<h2>Hisobot</h2><div class="err">${esc(errText(e))}</div>`; return; }
  const draw = () => {
    const [a, b] = range();
    let list = S.orders.filter(o => o.formalAt && o.stage !== 'bekor' && pul.get(o.id)?.result && o.formalAt >= a && o.formalAt < b);
    if (F.branch) list = list.filter(o => o.branchId === F.branch);
    if (F.seller) list = list.filter(o => o.sellerId === F.seller);
    if (F.done) list = list.filter(o => o.stage === 'yakunlandi');
    list.sort((x, y) => y.formalAt - x.formalAt);
    const rows = list.map(o => rowOf(o, pul.get(o.id)));
    const sum = k => rows.reduce((s, r) => s + r[k], 0);
    const sellers = [...new Map(S.orders.filter(o => o.sellerId).map(o => [o.sellerId, o.sellerName])).entries()];
    page.innerHTML = `<h2>Hisobot</h2>
      <div class="toolbar">
        <select class="inp" id="rpP" style="flex:0 1 170px">${[['month', 'Bu oy'], ['prev', "O'tgan oy"], ['year', 'Bu yil'], ['all', 'Hammasi'], ['custom', 'Tanlangan davr']].map(([v, l]) => `<option value="${v}" ${F.period === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        ${F.period === 'custom' ? `<input class="inp" type="date" id="rpFrom" value="${F.from}" style="flex:0 1 160px"><input class="inp" type="date" id="rpTo" value="${F.to}" style="flex:0 1 160px">` : ''}
        ${S.branches.length > 1 ? `<select class="inp" id="rpB" style="flex:0 1 180px"><option value="">Barcha filiallar</option>${S.branches.map(x => `<option value="${x.id}" ${F.branch === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : ''}
        <select class="inp" id="rpS" style="flex:0 1 180px"><option value="">Barcha sotuvchilar</option>${sellers.map(([id, n]) => `<option value="${id}" ${F.seller === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
        <label class="showpw" style="margin:0"><input type="checkbox" id="rpD" ${F.done ? 'checked' : ''}> Faqat yakunlanganlar</label>
        <button class="btn sec" id="rpX">⬇ Excel</button>
      </div>
      <div class="stats">
        <div class="stat"><b>${rows.length}</b><span>Buyurtma</span></div>
        <div class="stat"><b style="font-size:18px">${uzs(sum('sotuv'))}</b><span>Sotilgan summa</span></div>
        <div class="stat"><b style="font-size:18px">${uzs(sum('tan'))}</b><span>Tannarx</span></div>
        <div class="stat"><b style="font-size:18px;color:${sum('foyda') < 0 ? 'var(--bad)' : 'var(--ok)'}">${uzs(sum('foyda'))}</b><span>Foyda</span></div>
      </div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mijoz F.I.O.</th><th>Xarid</th><th>Holati</th><th>To'lov</th><th class="r">Mebel qanchaga tushdi</th><th class="r">Chegirma</th><th class="r">Sotilgan summa</th><th class="r">Foyda</th></tr></thead><tbody>
        ${rows.map((r, i) => `<tr data-i="${i}" style="cursor:pointer"><td><b>${esc(r.name)}</b><div class="hint">№${r.o.no}</div></td><td>${esc(r.xarid)}</td><td>${esc(ctx.STAGES[r.o.stage]?.t || r.o.stage)}</td><td>${esc(r.tolov)}</td>
          <td class="r">${uzs(r.tan)}</td><td class="r">${r.cheg ? `${uzs(r.cheg)}<div class="hint">${pct(r.chegFoiz)}</div>` : '—'}</td><td class="r">${uzs(r.sotuv)}</td>
          <td class="r" style="font-weight:700;color:${r.foyda < 0 ? 'var(--bad)' : 'var(--ok)'}">${uzs(r.foyda)}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">Bu davrda rasmiylashtirilgan buyurtma yo\'q</td></tr>'}
        ${rows.length ? `<tr style="background:var(--surface2);font-weight:700"><td colspan="4">JAMI</td><td class="r">${uzs(sum('tan'))}</td><td class="r">${uzs(sum('cheg'))}</td><td class="r">${uzs(sum('sotuv'))}</td>
          <td class="r" style="color:${sum('foyda') < 0 ? 'var(--bad)' : 'var(--ok)'}">${uzs(sum('foyda'))}<div class="hint" style="font-weight:500">savdo: ${uzs(sum('savdo'))}<br>muddatli ustama: ${uzs(sum('ustamaF'))}</div></td></tr>` : ''}
      </tbody></table></div>
      <p class="hint">Rasmiylashtirilgan buyurtmalar (bekor qilinganlardan tashqari), rasmiylashtirilgan sana bo'yicha. Tannarx = xom ashyo + haqiqatda biriktirilgan ustaning haqi. Muddatli to'lovda sotilgan summa — oylik ustama bilan jami summa.</p>`;
    const p = page.querySelector('#rpP'); p.onchange = () => { F.period = p.value; draw(); };
    const fr = page.querySelector('#rpFrom'), to = page.querySelector('#rpTo');
    if (fr) fr.onchange = () => { F.from = fr.value; draw(); };
    if (to) to.onchange = () => { F.to = to.value; draw(); };
    const br = page.querySelector('#rpB'); if (br) br.onchange = () => { F.branch = br.value; draw(); };
    page.querySelector('#rpS').onchange = e => { F.seller = e.target.value; draw(); };
    page.querySelector('#rpD').onchange = e => { F.done = e.target.checked; draw(); };
    page.querySelectorAll('[data-i]').forEach(tr => tr.onclick = () => ctx.openOrder(rows[+tr.dataset.i].o.id));
    page.querySelector('#rpX').onclick = async () => {
      try {
        await loadXlsx();
        const data = [['№', 'Mijoz F.I.O.', 'Xarid', 'Holati', "To'lov", 'Mebel qanchaga tushdi', 'Chegirma', 'Chegirma %', 'Sotilgan summa', 'Foyda', 'Rasmiylashtirilgan']];
        rows.forEach(r => data.push([r.o.no, r.name, r.xarid, ctx.STAGES[r.o.stage]?.t || r.o.stage, r.tolov, Math.round(r.tan), Math.round(r.cheg), Math.round(r.chegFoiz * 1000) / 10, Math.round(r.sotuv), Math.round(r.foyda), ymd(new Date(r.o.formalAt))]));
        data.push(['', 'JAMI', '', '', '', Math.round(sum('tan')), Math.round(sum('cheg')), '', Math.round(sum('sotuv')), Math.round(sum('foyda')), '']);
        const ws = window.XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = [6, 24, 40, 18, 10, 18, 14, 10, 18, 16, 14].map(w => ({ wch: w }));
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, 'Hisobot');
        window.XLSX.writeFile(wb, `Baraka-mebel-hisobot-${ymd(new Date())}.xlsx`);
      } catch (e) { toast(errText(e), true); }
    };
  };
  draw();
}
