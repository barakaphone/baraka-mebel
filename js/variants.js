// Bir hisobda 3 xil narx: Arzon, Mijoz xohlagan, Premium. Har biri — alohida kalkulyator holati.
// Mijoz tanlagan variant buyurtmaning asosiy narxi bo'ladi.
import { mountCalc } from './calc-ui.js';
import { esc, uzs, confirmBox } from './util.js';

const K = window.KALK;
export const VARIANTS = [['arzon', '🟢 Arzon'], ['mijoz', '🔵 Mijoz xohlagan'], ['premium', '🟣 Premium']];
export const variantName = k => (VARIANTS.find(v => v[0] === k)?.[1] || '').replace(/^\S+\s/, '');
const clone = o => JSON.parse(JSON.stringify(o || {}));

// opts: { variants: {kalit: inputs}, chosen, settings, showTan, canDiscount, payMode, onChange(result, kalit) }
export function mountVariants(root, opts) {
  const inputs = clone(opts.variants);
  if (!Object.keys(inputs).length) inputs.mijoz = {};
  let chosen = inputs[opts.chosen] ? opts.chosen : Object.keys(inputs).includes('mijoz') ? 'mijoz' : Object.keys(inputs)[0];
  let cur = chosen, calc = null;
  const price = {};
  const priceOf = k => { try { return K.compute(inputs[k], opts.settings).naqd; } catch (e) { return 0; } };
  root.innerHTML = `<div class="vtabs" id="vTabs"></div><div class="vbar" id="vBar"></div><div id="vCalc"></div>`;
  const tabsEl = root.querySelector('#vTabs'), barEl = root.querySelector('#vBar');
  const drawTabs = () => {
    tabsEl.innerHTML = VARIANTS.map(([k, l]) => `<button type="button" class="vtab ${k === cur ? 'on' : ''} ${inputs[k] ? '' : 'empty'}" data-v="${k}">
      <span>${esc(l)}${k === chosen ? ' <b class="vch">✓</b>' : ''}</span><small>${inputs[k] ? uzs(price[k] || 0) : '+ qo\'shish'}</small></button>`).join('');
  };
  const drawBar = () => {
    const others = VARIANTS.filter(([k]) => k !== cur);
    barEl.innerHTML = `${cur === chosen ? '<span class="badge ok">✓ Mijoz shu variantni tanlagan</span>' : `<button type="button" class="btn sec sm" data-vact="choose">✓ Mijoz shu variantni tanladi</button>`}
      <select class="inp sm" data-vact="copy" style="width:auto"><option value="">📋 Shu variantni nusxalash →</option>${others.map(([k, l]) => `<option value="${k}">${esc(l)} ga</option>`).join('')}</select>
      ${cur !== chosen ? `<button type="button" class="btn sec sm" data-vact="del">🗑 Variantni olib tashlash</button>` : ''}`;
  };
  const save = () => { if (calc) inputs[cur] = calc.getInputs(); };
  const mount = k => {
    save();
    cur = k;
    // Har safar yangi konteyner: eski kalkulyatorning hodisa tinglovchilari qolib ketmasin
    const box = document.createElement('div'); box.id = 'vCalc';
    root.querySelector('#vCalc').replaceWith(box);
    calc = mountCalc(box, {
      ...opts, inputs: clone(inputs[k]),
      onChange: r => { price[k] = r?.naqd || 0; const t = tabsEl.querySelector(`[data-v="${k}"] small`); if (t) t.textContent = uzs(price[k]); opts.onChange && opts.onChange(r, k); },
    });
    inputs[k] = calc.getInputs();
    drawTabs(); drawBar();
  };
  tabsEl.addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b || b.dataset.v === cur) return;
    save();
    // Bo'sh variant ochilsa — joriy variantdan nusxa bilan boshlanadi, faqat farqli joyini o'zgartirasiz
    if (!inputs[b.dataset.v]) { inputs[b.dataset.v] = clone(inputs[cur]); price[b.dataset.v] = price[cur]; }
    mount(b.dataset.v);
  });
  barEl.addEventListener('click', async e => {
    const a = e.target.closest('[data-vact]'); if (!a) return;
    if (a.dataset.vact === 'choose') { chosen = cur; drawTabs(); drawBar(); opts.onChange && opts.onChange(calc.getResult(), cur); }
    if (a.dataset.vact === 'del' && await confirmBox('Bu variant olib tashlansinmi?', 'Olib tashlash', true)) {
      delete inputs[cur]; delete price[cur]; calc = null; mount(chosen);
    }
  });
  barEl.addEventListener('change', e => {
    const a = e.target.closest('[data-vact="copy"]'); if (!a || !a.value) return;
    save();
    inputs[a.value] = clone(inputs[cur]); price[a.value] = price[cur];
    drawTabs(); a.value = '';
  });
  for (const k of Object.keys(inputs)) price[k] = priceOf(k);
  mount(cur);
  return {
    current: () => cur,
    chosen: () => chosen,
    calc: () => calc,
    // Faqat narxi bor variantlar
    getAll() {
      save();
      const out = {};
      for (const [k] of VARIANTS) if (inputs[k]) {
        const r = k === cur ? calc.getResult() : K.compute(inputs[k], opts.settings);
        if (r && r.naqd) out[k] = { inputs: clone(inputs[k]), result: r };
      }
      return { variants: out, chosen };
    },
  };
}
