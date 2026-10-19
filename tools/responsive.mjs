// Ekran moslashishini tekshirish (emulyatorda e2e.mjs ma'lumotlari bo'lishi kerak):
//   node tools/responsive.mjs <skrinshot-papka>
// Har bir o'lcham va sahifada: gorizontal "toshib chiqish" (scroll qilinmaydigan joyda) bormi.
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const fbDir = require.resolve('firebase/package.json').replace('package.json', '');
const SHOTS = process.argv[2] || '.';
const SIZES = [['tel-kichik', 360, 740], ['tel', 390, 844], ['planshet', 768, 1024], ['planshet-yotiq', 1024, 768], ['kompyuter', 1440, 900]];
const browser = await chromium.launch(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});

// Ataylab gorizontal aylantiriladigan joylar (jadval, tablar) hisobga olinmaydi
const OVERFLOW_JS = () => {
  const W = document.documentElement.clientWidth;
  const bad = [];
  if (document.documentElement.scrollWidth > W + 1) bad.push(`sahifa kengligi ${document.documentElement.scrollWidth} > ${W}`);
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('.tbl-wrap, .tabs, .steps, .chips, .modal-bg .tbl-wrap, datalist, script, style') || !el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.width && (r.right > W + 1 || r.left < -1)) {
      const id = el.id ? '#' + el.id : '', cl = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '';
      bad.push(`${el.tagName.toLowerCase()}${id}${cl} [${Math.round(r.left)}…${Math.round(r.right)}] "${(el.textContent || '').trim().slice(0, 30)}"`);
    }
  }
  return [...new Set(bad)].slice(0, 6);
};

async function session(phone, pw, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 800, hasTouch: w < 800 });
  const page = await ctx.newPage();
  await page.route(/gstatic\.com\/firebasejs\/10\.12\.2\/(.+)$/, (r, q) => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(fbDir + q.url().split('/').pop()) }));
  await page.route(/fonts\.(googleapis|gstatic)\.com|cdnjs/, r => r.fulfill({ status: 200, body: '' }));
  await page.goto('http://127.0.0.1:5500/?emu=1');
  await page.addStyleTag({ content: '#installBar{display:none!important}' });
  await page.fill('#loginForm [name=lPhone]', phone); await page.fill('#lPass', pw); await page.click('#loginBtn');
  await page.waitForSelector('#app:not(.hidden)', { timeout: 20000 });
  await page.waitForTimeout(1500);
  return page;
}

const report = [];
async function check(page, size, name, shot) {
  await page.waitForTimeout(500);
  const bad = await page.evaluate(OVERFLOW_JS);
  report.push({ size, name, bad });
  if (shot) await page.screenshot({ path: `${SHOTS}/r-${size}-${name}.png`, fullPage: false });
}
const tab = async (p, t) => { await p.click(`[data-tab="${t}"]`); await p.waitForTimeout(700); };

for (const [size, w, h] of SIZES) {
  const shot = true;
  // Admin
  let p = await session('901111111', 'AdminParol123!', w, h);
  await check(p, size, 'admin-bosh', shot);
  await tab(p, 'orders'); await p.click('[data-chip="all"]'); await check(p, size, 'buyurtmalar', shot);
  await p.click('[data-open]'); await p.waitForSelector('#back'); await check(p, size, 'kartochka', shot);
  await tab(p, 'calc'); await p.check('[data-sec="Buyurtma!B11"]'); await p.check('[data-sec="Buyurtma!B13"]'); await check(p, size, 'kalkulyator', shot);
  await tab(p, 'report'); await p.waitForSelector('#rpP'); await check(p, size, 'hisobot', shot);
  await p.click('#cwFab'); await check(p, size, 'muammolar', shot);
  await p.click('[data-t]'); await p.waitForSelector('#cwForm'); await check(p, size, 'muammo-ichi', shot); await p.click('[data-min]');
  await tab(p, 'staff'); await check(p, size, 'xodimlar', shot);
  await p.click('[data-ed]'); await p.waitForSelector('#sf'); await check(p, size, 'xodim-forma', false); await p.click('.mclose');
  await tab(p, 'branches'); await check(p, size, 'filiallar', false);
  await tab(p, 'settings'); await check(p, size, 'sozlama-umumiy', false);
  await p.click('[data-st="laminat"]'); await check(p, size, 'sozlama-laminat', shot);
  await p.click('#addXom'); await p.waitForSelector('#cf'); await check(p, size, 'xomashyo-forma', shot); await p.click('.mclose');
  await p.click('[data-st="rollar"]'); await check(p, size, 'rollar', shot);
  await p.click('#logoutBtn'); await check(p, size, 'profil', false); await p.click('.mclose');
  await p.context().close();
  // Sotuvchi
  p = await session('902222222', 'Parol1234', w, h);
  await check(p, size, 'sotuvchi-royxat', false);
  await p.click('#newOrder'); await p.waitForSelector('#nf'); await check(p, size, 'yangi-murojaat', shot); await p.click('.mclose');
  await p.context().close();
  // Usta
  p = await session('906666666', 'Parol1234', w, h);
  await tab(p, 'history'); await check(p, size, 'usta-tarix', false);
  await p.context().close();
}
await browser.close();
let n = 0;
for (const r of report) if (r.bad.length) { n++; console.log(`✗ ${r.size} / ${r.name}:\n   ${r.bad.join('\n   ')}`); }
console.log(`\nTekshirildi: ${report.length} ta sahifa×o'lcham, muammoli: ${n}`);
