// Narx kalkulyatori oynasi: Excel varaqlari (Buyurtma, Spalniy, Oshxona, Korpus mebel)
// shakllar ko'rinishida. Har o'zgarishda hisob qayta bajariladi.
import { esc, uzs, pct, parseNum } from './util.js';

const K = window.KALK;

const SECTIONS = [
  { key: 'Buyurtma!B11', id: 'spalniy', name: 'Spalniy garnitur' },
  { key: 'Buyurtma!B12', id: 'oshxona', name: 'Oshxona mebeli' },
  { key: 'Buyurtma!B13', id: 'korpus', name: 'Korpus mebel (shkaf, prixojka, garderob)' },
];

function inputHtml(key, val, f) {
  if (f.opts) {
    return `<select class="inp sm" data-k="${esc(key)}">${f.opts.map(o => `<option ${String(o) === String(val) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  }
  if (f.text) return `<input class="inp sm" data-k="${esc(key)}" value="${esc(val)}" maxlength="80">`;
  return `<input class="inp sm" data-k="${esc(key)}" inputmode="decimal" value="${esc(val)}" ${f.optional ? 'placeholder="avtomatik"' : ''}>`;
}

// opts: {inputs, settings, showTan, onChange(result)}
export function mountCalc(root, opts) {
  const inputs = Object.assign(K.defaults(), opts.inputs || {});
  const settings = opts.settings;
  let korCount = Math.max(1, K.KOR_COLS.filter(c => parseNum(inputs[`Korpus mebel!${c}9`]) > 0).length);
  let oshCount = Math.max(1, K.OSH_ROWS.filter(r => inputs['Oshxona!B' + r]).length);
  let result = null;

  function render() {
    const on = id => inputs[SECTIONS.find(s => s.id === id).key] === 'Ha';
    const lists = K.oshxonaLists(settings);
    // Spalniy: mahsulot guruhlari
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
        ${g.fields.map(f => `<div class="field"><label>${esc(f.label)} ${f.unit ? `<span class="unit">(${esc(f.unit)})</span>` : ''}</label>${inputHtml(f.key, inputs[f.key], f)}</div>`).join('')}
      </div></details>`;
    }).join('');

    const oshHtml = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>№</th><th>Xomashyo</th><th>Balandligi (m)</th><th>Uzunligi (m)</th><th>1 m narxi qo'lda ($)</th></tr></thead><tbody>
      ${K.OSH_ROWS.slice(0, oshCount).map((r, i) => `<tr><td>${i + 1}</td>
        <td><select class="inp sm" data-k="Oshxona!B${r}"><option value="">—</option>${lists.mats.map(m => `<option ${String(inputs['Oshxona!B' + r]) === String(m) ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></td>
        <td><select class="inp sm" data-k="Oshxona!C${r}"><option value="">—</option>${lists.bals.map(b => `<option ${String(inputs['Oshxona!C' + r]) === String(b) ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></td>
        <td><input class="inp sm" inputmode="decimal" data-k="Oshxona!D${r}" value="${esc(inputs['Oshxona!D' + r])}"></td>
        <td><input class="inp sm" inputmode="decimal" data-k="Oshxona!F${r}" value="${esc(inputs['Oshxona!F' + r])}" placeholder="jadvaldan"></td></tr>`).join('')}
      </tbody></table></div>
      ${oshCount < 6 ? `<button type="button" class="btn sec sm" data-act="osh+" style="margin-top:8px">+ Qator qo'shish</button>` : ''}
      <p class="hint">Jadvalda yo'q balandlik uchun 1 m narxini qo'lda yozing.</p>`;

    const korHtml = K.KOR_COLS.slice(0, korCount).map((col, i) => `<details class="grp" open><summary>Buyum ${i + 1}: ${esc(inputs[`Korpus mebel!${col}7`] || '')} <span class="badge ${parseNum(inputs[`Korpus mebel!${col}9`]) > 0 ? '' : 'grey'}">${parseNum(inputs[`Korpus mebel!${col}9`])} dona</span></summary><div class="body">
        ${K.korpusFields.map(f => { const key = `Korpus mebel!${col}${f.row}`; return `<div class="field"><label>${esc(f.label)} ${f.unit ? `<span class="unit">(${esc(f.unit)})</span>` : ''}</label>${inputHtml(key, inputs[key], f)}</div>`; }).join('')}
      </div></details>`).join('') + (korCount < 6 ? `<button type="button" class="btn sec sm" data-act="kor+">+ Buyum qo'shish</button>` : '');

    const tt = K.tolovTurlari(settings);
    root.innerHTML = `
      <div class="sec-toggle">${SECTIONS.map(s => `<label class="${on(s.id) ? 'on' : ''}"><input type="checkbox" data-sec="${s.key}" ${on(s.id) ? 'checked' : ''}> ${esc(s.name)}</label>`).join('')}</div>
      ${on('spalniy') ? `<h3>Spalniy garnitur</h3><p class="hint" style="margin-top:-6px">Kerak bo'lmagan mahsulot sonini 0 qiling. O'lchamlar sm da.</p>${spHtml}` : ''}
      ${on('oshxona') ? `<h3>Oshxona mebeli (pogon metr)</h3>${oshHtml}` : ''}
      ${on('korpus') ? `<h3>Korpus mebel</h3><p class="hint" style="margin-top:-6px">O'lchamlar sm da. Bo'limlar va eshiklar sonini bo'sh qoldirsangiz, avtomatik hisoblanadi.</p>${korHtml}` : ''}
      <h3>To'lov sharti</h3>
      <div class="card"><div class="grp" style="border:0;margin:0"><div class="body" style="padding:0">
        <div class="field"><label>Chegirma, %</label><input class="inp sm" inputmode="decimal" data-pct="Buyurtma!B16" value="${esc(+(parseNum(inputs['Buyurtma!B16']) * 100).toFixed(2))}"></div>
        <div class="field"><label>To'lov turi</label><select class="inp sm" data-k="Buyurtma!B20">${tt.map(t => `<option ${t === inputs['Buyurtma!B20'] ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
        <div class="field"><label>Oldindan to'lov, %</label><input class="inp sm" inputmode="decimal" data-pct="Buyurtma!B21" value="${esc(+(parseNum(inputs['Buyurtma!B21']) * 100).toFixed(2))}"></div>
        <div class="field"><label>yoki oldindan to'lov, so'm</label><input class="inp sm" inputmode="numeric" data-k="Buyurtma!B22" value="${esc(inputs['Buyurtma!B22'])}" placeholder="ixtiyoriy"></div>
      </div></div></div>
      <div id="calcRes"></div>`;
    recalc();
  }

  function recalc() {
    try {
      result = K.compute(inputs, settings);
    } catch (e) {
      console.error(e);
      root.querySelector('#calcRes').innerHTML = `<div class="err">Hisoblashda xato: ${esc(e.message)}</div>`;
      result = null; opts.onChange && opts.onChange(null); return;
    }
    const r = result;
    const showTan = opts.showTan;
    root.querySelector('#calcRes').innerHTML = `
      ${r.warnings.length ? `<ul class="warn-list">${r.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      ${r.lines.length ? `<h3>Buyurtma tarkibi</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mahsulot</th><th>Tavsif</th><th>Miqdori</th><th class="r">Birlik narxi</th><th class="r">Summa</th></tr></thead><tbody>
        ${r.lines.map(l => `<tr><td><b>${esc(l.mahsulot)}</b></td><td>${esc(l.tavsif)}</td><td>${esc(l.miqdor)}</td><td class="r">${uzs(l.birlik)}</td><td class="r">${uzs(l.summa)}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
      ${showTan ? `<div class="note">Tan narx: <b>${uzs(r.tan)}</b> · Baraka ustamasi: <b>${uzs(r.ustama)}</b> · Xom ashyo: ${uzs(r.xomAshyo)}</div>` : ''}
      <div class="total"><div><div class="s">Naqd narx${r.chegirma ? ` (chegirma ${uzs(r.chegirma)})` : ''}</div><div class="big-num">${uzs(r.naqd)}</div></div>
        ${r.tanlangan.oy ? `<div><div class="s">${esc(r.tanlangan.turi)} · oylik ${pct(r.tanlangan.stavka)}</div><div class="big-num">${uzs(r.tanlangan.oylik)}<span class="s"> / oy</span></div></div>` : ''}</div>
      ${r.naqd ? `<h3>To'lov variantlari</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>To'lov turi</th><th class="r">Oylik ustama</th><th class="r">Oylik to'lov</th><th class="r">Oldindan</th><th class="r">Jami to'lov</th></tr></thead><tbody>
        ${r.tariflar.map(t => `<tr class="${t.oy === r.tanlangan.oy ? 'sel' : ''}"><td>${esc(t.turi)}${t.izoh ? `<div class="hint">${esc(t.izoh)}</div>` : ''}</td><td class="r">${t.oy ? pct(t.stavka) : '—'}</td><td class="r">${t.oy ? uzs(t.oylik) : '—'}</td><td class="r">${t.oy ? uzs(r.tanlangan.old) : '—'}</td><td class="r">${uzs(t.jami)}</td></tr>`).join('')}
      </tbody></table></div>` : ''}`;
    opts.onChange && opts.onChange(result);
  }

  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(recalc, 250); };

  root.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.k) { inputs[t.dataset.k] = t.value; if (t.tagName !== 'SELECT') schedule(); }
    else if (t.dataset.pct) { inputs[t.dataset.pct] = parseNum(t.value) / 100; schedule(); }
  });
  root.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.sec) { inputs[t.dataset.sec] = t.checked ? 'Ha' : "Yo'q"; render(); return; }
    if (t.dataset.k && t.tagName === 'SELECT') {
      inputs[t.dataset.k] = t.value;
      if (/^Korpus mebel!.7$/.test(t.dataset.k)) render(); else recalc();
    }
    if (t.dataset.k && /(soni|9)$/.test(t.dataset.k)) { /* sonlar sarlavhada */ }
  });
  root.addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'kor+') { inputs[`Korpus mebel!${K.KOR_COLS[korCount]}9`] = 1; korCount++; render(); }
    if (a.dataset.act === 'osh+') { oshCount++; render(); }
  });

  render();
  return {
    // Faqat yoqilgan bo'limlarning kiritmalari saqlanadi
    getInputs() {
      const out = {};
      const on = s => inputs[s] === 'Ha';
      for (const [k, v] of Object.entries(inputs)) {
        if (k.startsWith('Buyurtma!')) out[k] = v;
        else if (k.startsWith('Spalniy!') && on('Buyurtma!B11')) out[k] = v;
        else if (k.startsWith('Oshxona!') && on('Buyurtma!B12')) out[k] = v;
        else if (k.startsWith('Korpus mebel!') && on('Buyurtma!B13')) out[k] = v;
      }
      return out;
    },
    getResult() { clearTimeout(timer); recalc(); return result; },
  };
}
