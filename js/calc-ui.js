// Narx kalkulyatori oynasi: Excel varaqlari (Buyurtma, Spalniy, Oshxona, Korpus mebel)
// shakllar ko'rinishida. Har o'zgarishda hisob qayta bajariladi.
import { esc, uzs, pct, parseNum, digits, moneyFmt, toast } from './util.js';

const K = window.KALK;

const SECTIONS = [
  { key: 'Buyurtma!B11', id: 'spalniy', name: 'Spalniy garnitur' },
  { key: 'Buyurtma!B12', id: 'oshxona', name: 'Oshxona mebeli' },
  { key: 'Buyurtma!B13', id: 'korpus', name: 'Korpus mebel (shkaf, prixojka, garderob)' },
];

// "Yuz qismi (eshiklar, tsokol)" → sarlavha + kichik izoh
function splitLabel(label, unit) {
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(label || '');
  const main = m ? m[1] : (label || '');
  const sub = [m ? m[2] : '', unit].filter(Boolean).join(' · ');
  return `<label><span class="lt">${esc(main)}</span>${sub ? `<span class="ls">${esc(sub)}</span>` : ''}</label>`;
}

function inputHtml(key, val, f) {
  if (f.opts) return `<select class="inp sm" data-k="${esc(key)}">${f.opts.map(o => `<option ${String(o) === String(val) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  if (f.text) return `<input class="inp sm" data-k="${esc(key)}" value="${esc(val)}" maxlength="80">`;
  return `<input class="inp sm" data-k="${esc(key)}" inputmode="decimal" value="${esc(val)}" ${f.optional ? 'placeholder="avtomatik"' : ''}>`;
}
const fmtPct = x => (Math.round((x || 0) * 1000) / 10).toString().replace('.', ',');

// opts: {inputs, settings, ustalar:[{id,name,foiz}], showTan, canDiscount, payMode: 'naqd'|'muddatli'|undefined, onChange(result)}
// payMode: buyurtmaning to'lov turi — naqdda muddatli to'lovga oid maydonlar umuman chiqmaydi
export function mountCalc(root, opts) {
  const inputs = Object.assign(K.defaults(), opts.inputs || {});
  const allTt = K.tolovTurlari(opts.settings);
  const naqdT = allTt.find(t => /naqd/i.test(t)) || allTt[0];
  const tts = opts.payMode === 'naqd' ? [naqdT] : opts.payMode === 'muddatli' ? allTt.filter(t => t !== naqdT) : allTt;
  if (!tts.includes(inputs['Buyurtma!B20'])) inputs['Buyurtma!B20'] = opts.payMode === 'muddatli' ? (tts.find(t => /6/.test(t)) || tts[0]) : tts[0];
  const naqdOnly = opts.payMode === 'naqd';
  const ustalar = opts.ustalar || [];
  let korCount = Math.max(1, K.KOR_COLS.filter(c => parseNum(inputs[`Korpus mebel!${c}9`]) > 0).length);
  let oshCount = Math.max(1, K.OSH_ROWS.filter(r => inputs['Oshxona!B' + r]).length);
  let result = null;
  const settingsNow = () => ({ ...opts.settings, ustaFoiz: ustalar.find(u => u.id === inputs._usta)?.foiz || 0 });

  // Matraslar ro'yxati sozlamalardan (tanlangani o'chirilgan bo'lsa ham ko'rinib turadi)
  const matrasOpts = () => { const o = K.matrasOpts(opts.settings); return o.includes(inputs['Spalniy!C20']) || !inputs['Spalniy!C20'] ? o : [...o, inputs['Spalniy!C20']]; };
  function render() {
    const on = id => inputs[SECTIONS.find(s => s.id === id).key] === 'Ha';
    const lists = K.oshxonaLists(opts.settings);
    const groups = [];
    for (const f of K.spalniyFields) {
      let g = groups.find(x => x.name === f.group);
      if (!g) { g = { name: f.group, fields: [] }; groups.push(g); }
      g.fields.push(f);
    }
    const spHtml = groups.map((g, gi) => {
      const cnt = g.fields.find(f => /soni$/i.test(f.label || ''));
      const n = cnt ? parseNum(inputs[cnt.key]) : null;
      return `<details class="grp" ${gi < 2 ? 'open' : ''}><summary>${esc(g.name)} ${n !== null ? `<span class="badge ${n > 0 ? '' : 'grey'}">${n} dona</span>` : ''}</summary><div class="body">
        ${g.fields.map(f => `<div class="field">${splitLabel(f.label, f.unit)}${inputHtml(f.key, inputs[f.key], f.key === 'Spalniy!C20' ? { ...f, opts: matrasOpts() } : f)}</div>`).join('')}
      </div></details>`;
    }).join('');

    const oshHtml = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>№</th><th>Xomashyo</th><th>Balandligi (m)</th><th>Uzunligi (m)</th><th></th></tr></thead><tbody>
      ${K.OSH_ROWS.slice(0, oshCount).map((r, i) => {
        const mat = inputs['Oshxona!B' + r];
        const bals = lists.pairs[mat] || [];
        return `<tr><td>${i + 1}</td>
        <td><select class="inp sm" data-k="Oshxona!B${r}" data-osh="${r}"><option value="">—</option>${lists.mats.map(m => `<option ${String(mat) === String(m) ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></td>
        <td><select class="inp sm" data-k="Oshxona!C${r}" ${mat ? '' : 'disabled'}><option value="">—</option>${bals.map(b => `<option ${String(inputs['Oshxona!C' + r]) === String(b) ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></td>
        <td><input class="inp sm" inputmode="decimal" data-k="Oshxona!D${r}" value="${esc(inputs['Oshxona!D' + r])}"></td>
        <td>${oshCount > 1 ? `<button type="button" class="btn sec sm" data-act="osh-" data-r="${i}" title="Qatorni o'chirish">×</button>` : ''}</td></tr>`;
      }).join('')}
      </tbody></table></div>
      ${oshCount < 6 ? `<button type="button" class="btn sec sm" data-act="osh+" style="margin-top:8px">+ Qator qo'shish</button>` : ''}`;

    const korHtml = K.KOR_COLS.slice(0, korCount).map((col, i) => `<details class="grp" open><summary>Buyum ${i + 1}: ${esc(inputs[`Korpus mebel!${col}7`] || '')} <span class="badge ${parseNum(inputs[`Korpus mebel!${col}9`]) > 0 ? '' : 'grey'}">${parseNum(inputs[`Korpus mebel!${col}9`])} dona</span></summary><div class="body">
        ${K.korpusFields.map(f => { const key = `Korpus mebel!${col}${f.row}`; return `<div class="field">${splitLabel(f.label, f.unit)}${inputHtml(key, inputs[key], f)}</div>`; }).join('')}
      </div></details>`).join('') + (korCount < 6 ? `<button type="button" class="btn sec sm" data-act="kor+">+ Buyum qo'shish</button>` : '');

    const tt = tts;
    const needUsta = on('spalniy') || on('korpus');
    root.innerHTML = `
      <div class="sec-toggle">${SECTIONS.map(s => `<label class="${on(s.id) ? 'on' : ''}"><input type="checkbox" data-sec="${s.key}" ${on(s.id) ? 'checked' : ''}> ${esc(s.name)}</label>`).join('')}</div>
      ${needUsta ? `<div class="card"><div class="field" style="margin:0"><label><span class="lt">Usta *</span><span class="ls">narx shu ustaning xizmat narxi bilan hisoblanadi</span></label>
        <select class="inp" data-k="_usta"><option value="">— ustani tanlang —</option>${ustalar.map(u => `<option value="${esc(u.id)}" ${u.id === inputs._usta ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div></div>` : ''}
      ${on('spalniy') ? `<h3>Spalniy garnitur</h3><p class="hint" style="margin-top:-6px">Kerak bo'lmagan mahsulot sonini 0 qiling. O'lchamlar sm da.</p>${spHtml}` : ''}
      ${on('oshxona') ? `<h3>Oshxona mebeli (pogon metr)</h3>${oshHtml}` : ''}
      ${on('korpus') ? `<h3>Korpus mebel</h3><p class="hint" style="margin-top:-6px">O'lchamlar sm da. Bo'limlar va eshiklar sonini bo'sh qoldirsangiz, avtomatik hisoblanadi.</p>${korHtml}` : ''}
      <h3>${naqdOnly ? 'Naqd savdo' : "To'lov sharti"}</h3>
      <div class="card"><div class="pay-grid">
        ${naqdOnly ? '' : `<div class="field"><label><span class="lt">To'lov turi</span></label><select class="inp sm" data-k="Buyurtma!B20">${tt.map(t => `<option ${t === inputs['Buyurtma!B20'] ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`}
        ${opts.canDiscount !== false ? `<div class="field"><label><span class="lt">Chegirma, %</span></label><input class="inp sm" inputmode="decimal" data-link="chegPct" value="${esc(fmtPct(parseNum(inputs['Buyurtma!B16'])))}"></div>
        <div class="field"><label><span class="lt">Chegirma, so'm</span></label><input class="inp sm" inputmode="numeric" data-money data-link="chegSum" value="${esc(moneyFmt(inputs._chegSum))}"></div>` : ''}
        ${naqdOnly ? '' : `<div class="field"><label><span class="lt">Oldindan to'lov, %</span></label><input class="inp sm" inputmode="decimal" data-link="oldPct" value="${esc(fmtPct(parseNum(inputs['Buyurtma!B21'])))}"></div>
        <div class="field"><label><span class="lt">Oldindan to'lov, so'm</span></label><input class="inp sm" inputmode="numeric" data-money data-link="oldSum" value="${esc(moneyFmt(inputs['Buyurtma!B22']))}"></div>`}
      </div></div>
      <div id="calcRes"></div>`;
    recalc();
  }

  function syncLinked(r) {
    const set = (sel, v) => { const el = root.querySelector(`[data-link="${sel}"]`); if (el && document.activeElement !== el) el.value = v; };
    if (inputs._chegMode === 'sum') set('chegPct', fmtPct(r.chegFoiz)); else set('chegSum', r.chegirma ? moneyFmt(r.chegirma) : '');
    if (inputs._oldMode === 'sum') set('oldPct', fmtPct(r.oldUlush)); else set('oldSum', r.tanlangan.old ? moneyFmt(r.tanlangan.old) : '');
  }

  function recalc() {
    try {
      result = K.compute(inputs, settingsNow());
    } catch (e) {
      console.error(e);
      root.querySelector('#calcRes').innerHTML = `<div class="err">Hisoblashda xato: ${esc(e.message)}</div>`;
      result = null; opts.onChange && opts.onChange(null); return;
    }
    const r = result;
    syncLinked(r);
    const warns = r.warnings.slice();
    if (inputs._oldMode === 'sum' && parseNum(inputs['Buyurtma!B22']) > r.naqd && r.naqd) warns.push("Oldindan to'lov naqd narxdan katta");
    root.querySelector('#calcRes').innerHTML = `
      ${warns.length ? `<ul class="warn-list">${warns.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      ${r.lines.length ? `<h3>Buyurtma tarkibi</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mahsulot</th><th>Tavsif</th><th>Miqdori</th><th class="r">Birlik narxi</th><th class="r">Summa</th></tr></thead><tbody>
        ${r.lines.map(l => `<tr><td><b>${esc(l.mahsulot)}</b></td><td>${esc(l.tavsif)}</td><td>${esc(l.miqdor)}</td><td class="r">${uzs(l.birlik)}</td><td class="r">${uzs(l.summa)}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
      ${opts.showTan ? `<div class="note">Tan narx: <b>${uzs(r.tan)}</b> · Baraka ustamasi: <b>${uzs(r.ustama)}</b> · Xom ashyo: ${uzs(r.xomAshyo)}</div>` : ''}
      <div class="total"><div><div class="s">Naqd narx${r.chegirma ? ` (chegirma ${uzs(r.chegirma)})` : ''}</div><div class="big-num">${uzs(r.naqd)}</div></div>
        ${r.tanlangan.oy ? `<div><div class="s">${esc(r.tanlangan.turi)} · oylik ${pct(r.tanlangan.stavka)}</div><div class="big-num">${uzs(r.tanlangan.oylik)}<span class="s"> / oy</span></div></div>` : ''}</div>
      ${r.naqd && !naqdOnly ? `<h3>To'lov variantlari</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>To'lov turi</th><th class="r">Oylik ustama</th><th class="r">Oylik to'lov</th><th class="r">Oldindan</th><th class="r">Jami to'lov</th></tr></thead><tbody>
        ${r.tariflar.filter(t => opts.payMode !== 'muddatli' || t.oy).map(t => `<tr class="${t.oy === r.tanlangan.oy ? 'sel' : ''}"><td>${esc(t.turi)}${t.izoh ? `<div class="hint">${esc(t.izoh)}</div>` : ''}</td><td class="r">${t.oy ? pct(t.stavka) : '—'}</td><td class="r">${t.oy ? uzs(t.oylik) : '—'}</td><td class="r">${t.oy ? uzs(r.tanlangan.old) : '—'}</td><td class="r">${uzs(t.jami)}</td></tr>`).join('')}
      </tbody></table></div>` : ''}`;
    opts.onChange && opts.onChange(result);
  }

  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(recalc, 250); };
  const clampPct = el => { let v = parseNum(el.value); if (v > 100) { v = 100; el.value = '100'; toast("Foiz 100 dan oshmaydi", true); } if (v < 0) { v = 0; el.value = '0'; } return v / 100; };

  root.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.k) { inputs[t.dataset.k] = t.value; if (t.tagName !== 'SELECT') schedule(); return; }
    switch (t.dataset.link) {
      case 'chegPct': inputs['Buyurtma!B16'] = clampPct(t); inputs._chegMode = 'pct'; break;
      case 'chegSum': inputs._chegSum = digits(t.value); inputs._chegMode = 'sum'; break;
      case 'oldPct': inputs['Buyurtma!B21'] = clampPct(t); inputs._oldMode = 'pct'; break;
      case 'oldSum': inputs['Buyurtma!B22'] = digits(t.value); inputs._oldMode = 'sum'; break;
      default: return;
    }
    schedule();
  });
  root.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.sec) { inputs[t.dataset.sec] = t.checked ? 'Ha' : "Yo'q"; render(); return; }
    if (t.dataset.k && t.tagName === 'SELECT') {
      inputs[t.dataset.k] = t.value;
      if (t.dataset.osh) { inputs['Oshxona!C' + t.dataset.osh] = (K.oshxonaLists(opts.settings).pairs[t.value] || [])[0] ?? ''; render(); }
      else if (/^Korpus mebel!.7$/.test(t.dataset.k)) render(); else recalc();
    }
  });
  root.addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'kor+') { inputs[`Korpus mebel!${K.KOR_COLS[korCount]}9`] = 1; korCount++; render(); }
    if (a.dataset.act === 'osh+') { oshCount++; render(); }
    if (a.dataset.act === 'osh-') {
      // qatorlarni yuqoriga suramiz
      const rows = K.OSH_ROWS, i = +a.dataset.r;
      for (let j = i; j < rows.length - 1; j++) for (const c of ['B', 'C', 'D']) inputs[`Oshxona!${c}${rows[j]}`] = inputs[`Oshxona!${c}${rows[j + 1]}`] ?? '';
      for (const c of ['B', 'C', 'D']) inputs[`Oshxona!${c}${rows[rows.length - 1]}`] = '';
      oshCount--; render();
    }
  });

  render();
  return {
    // Faqat yoqilgan bo'limlarning kiritmalari saqlanadi
    getInputs() {
      const out = {};
      const onS = s => inputs[s] === 'Ha';
      for (const [k, v] of Object.entries(inputs)) {
        if (k.startsWith('_') || k.startsWith('Buyurtma!')) out[k] = v;
        else if (k.startsWith('Spalniy!') && onS('Buyurtma!B11')) out[k] = v;
        else if (k.startsWith('Oshxona!') && onS('Buyurtma!B12')) out[k] = v;
        else if (k.startsWith('Korpus mebel!') && onS('Buyurtma!B13')) out[k] = v;
      }
      return out;
    },
    getResult() { clearTimeout(timer); recalc(); return result; },
    ustaId: () => inputs._usta,
  };
}
