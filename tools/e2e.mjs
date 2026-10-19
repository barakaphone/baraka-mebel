// To'liq jarayon sinovi (Firebase emulyatori + Playwright):
//   npx firebase emulators:start --only firestore,auth --project baraka-mebel-9521a
//   python3 -m http.server 5500 --bind 127.0.0.1
//   node tools/e2e.mjs <rasm.jpg> <skrinshot-papka>
// Lid → hisob → muddatli rasmiylashtirish → shartnomachi → o'lchovchi → sotuvchi → rahbar → usta → yakunlandi
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const [IMG, SHOTS = '.'] = process.argv.slice(2);
const BASE = 'http://127.0.0.1:5500/?emu=1';
const fbDir = require.resolve('firebase/package.json').replace('package.json', '');
const h2p = require.resolve('html2pdf.js/dist/html2pdf.bundle.min.js');

await fetch('http://127.0.0.1:8080/emulator/v1/projects/baraka-mebel-9521a/databases/(default)/documents', { method: 'DELETE' });
await fetch('http://127.0.0.1:9099/emulator/v1/projects/baraka-mebel-9521a/accounts', { method: 'DELETE' });

const browser = await chromium.launch(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const errors = [];
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.route(/gstatic\.com\/firebasejs\/10\.12\.2\/(.+)$/, (route, req) => {
    const f = req.url().split('/').pop();
    route.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(fbDir + f) });
  });
  await page.route(/cdnjs\.cloudflare\.com.*html2pdf/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(h2p) }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.fulfill({ status: 200, body: '' }));
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|fonts/.test(m.text())) errors.push('console: ' + m.text()); });
  return page;
}
let step = 0;
const shot = async (page, name) => page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, '0')}-${name}.png`, fullPage: true });
const toastWait = async page => { await page.waitForSelector('#toast.show', { timeout: 15000 }); };
// Server yozuvni tasdiqlaganini kutish (ilova faqat commit'dan keyin xabar chiqaradi)
const saved = async page => { await page.waitForSelector('#toast.show:not(.bad)', { timeout: 20000 }); await page.waitForSelector('#toast.show', { state: 'detached', timeout: 1 }).catch(() => {}); };
async function login(page, phone, pw) {
  await page.goto(BASE);
  await page.waitForSelector('#loginForm:visible');
  await page.fill('#loginForm [name=lPhone]', phone); await page.fill('#lPass', pw);
  await page.click('#loginBtn');
  await page.waitForSelector('#app:not(.hidden)', { timeout: 20000 });
  await page.waitForSelector('.page :is(.olist, .empty, .stats, h2)', { timeout: 20000 });
}
const openFirst = async page => { await page.click('[data-open]'); await page.waitForSelector('#back'); };

// 1. Tizimni sozlash (admin)
let page = await newPage();
await page.goto(BASE);
await page.waitForSelector('#setupForm:visible');
await page.fill('#sName', 'Bosh Admin'); await page.fill('#setupForm [name=sPhone]', '901111111');
await page.fill('#sPass', 'AdminParol123!'); await page.fill('#sPass2', 'AdminParol123!');
await page.click('#setupBtn');
await page.waitForSelector('#app:not(.hidden)', { timeout: 30000 });
await page.waitForSelector('.stats');
await shot(page, 'admin-bosh');

// 2. Sozlamalar: usta standart foizi, ustamalar
await page.click('[data-tab="settings"]');
await page.click('[data-st="narx"]');
await page.fill('[data-key="Sozlamalar!C9"]', '30'); await page.fill('[data-key="Sozlamalar!C11"]', '25');
await page.click('#saveSet'); await toastWait(page);
await shot(page, 'sozlamalar');

// 3. Xodimlar
const staff = [
  ['Sotuvchi Ali', '902222222', 'sotuvchi'], ['Shartnomachi Vali', '903333333', 'shartnomachi'],
  ["O'lchovchi Karim", '904444444', 'olchovchi'], ['Rahbar Sobir', '905555555', 'rahbar'], ['Usta Anvar', '906666666', 'usta'],
];
await page.click('[data-tab="staff"]');
for (const [n, ph, r] of staff) {
  await page.click('#addSt');
  await page.fill('#sf [name=fullName]', n); await page.fill('#sf [name=phone]', ph); await page.fill('#sf [name=pw]', 'Parol1234');
  await page.selectOption('#sf [name=role]', r);
  if (r === 'usta') await page.fill('#sf [name=ustaFoiz]', '10');
  await page.click('#sf button.pri');
  try { await page.waitForSelector('#sf', { state: 'detached', timeout: 20000 }); } catch (e) { console.log('FORM XATO:', r, await page.textContent('#sfErr')); await shot(page, 'form-xato'); throw e; }
}
await shot(page, 'xodimlar');
await page.context().close();

// 4. Sotuvchi: murojaat → hisob → rasmiylashtirish (6 oy, pasport)
page = await newPage();
await login(page, '902222222', 'Parol1234');
await page.click('#newOrder');
await page.fill('#nf [name=name]', 'Mijoz Test'); await page.fill('#nf [name=phone]', '907777777');
await page.fill('#nf [name=address]', "Qo'qon sh., Navoiy ko'chasi 5");
await page.click('#nf button.pri');
await page.waitForSelector('[data-a="calc"]');
await page.click('[data-a="calc"]');
await page.check('[data-sec="Buyurtma!B11"]');
await page.waitForSelector('[data-k="Spalniy!C8"]');
await page.selectOption('[data-k="_usta"]', { index: 1 });
await page.fill('[data-k="Spalniy!C8"]', '260');
await page.selectOption('[data-k="Buyurtma!B20"]', '6 oy');
await page.fill('[data-link="oldPct"]', '20');
await page.fill('[data-link="chegSum"]', '500 000');
await page.waitForTimeout(800);
await shot(page, 'kalkulyator');
const price1 = await page.textContent('#rbPrice');
await page.click('#saveCalc');
await page.waitForSelector('[data-a="formal"]', { timeout: 20000 });
await page.click('[data-a="formal"]');
await page.waitForSelector('#ppUp [data-up="oldi"]', { state: 'attached' });
await page.setInputFiles('#ppUp [data-up="oldi"]', IMG);
await page.waitForSelector('#ppUp [data-side="oldi"][data-has="1"]', { timeout: 20000 });
await page.waitForSelector('#fmSkip:visible');
await page.setInputFiles('#ppUp [data-up="orqa"]', IMG);
await page.waitForSelector('#ppUp [data-side="orqa"][data-has="1"]', { timeout: 20000 });
await page.waitForSelector('#fmBtn:visible');
await page.selectOption('#olSel', { label: "O'lchovchi Karim" });
await shot(page, 'rasmiylashtirish');
await page.click('#fmBtn');
await page.waitForSelector('.badge:has-text("Shartnomachida")', { timeout: 20000 }); await saved(page);
const preDl = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('[data-a="pdf"]').click()]);
await preDl[0].saveAs(`${SHOTS}/narx-taklifi-oldin.pdf`);
console.log('Narx:', price1, '| shartnomadan oldin PDF yuklandi');
await page.context().close();

// 5. Shartnomachi
page = await newPage();
await login(page, '903333333', 'Parol1234');
await openFirst(page);
await page.waitForSelector('#ph-pasport img', { timeout: 20000 });
await shot(page, 'shartnomachi');
await page.click('[data-a="sk-ok"]');
await page.waitForSelector(".badge:has-text(\"O'lchovda\")", { timeout: 20000 }); await saved(page);
await page.context().close();

// 6. O'lchovchi
page = await newPage();
await login(page, '904444444', 'Parol1234');
await openFirst(page);
const seesPrice = await page.$('text=Naqd narx');
await page.waitForSelector('#olchovUp input[type=file]', { state: 'attached' });
await page.setInputFiles('#olchovUp input[type=file]', [IMG, IMG]);
await page.waitForSelector('#olchovUp .ph >> nth=1', { timeout: 20000 });
await page.click('[data-a="olchandi"]');
await page.waitForSelector('#toast.show.bad');
await page.waitForSelector('#olchovUp input[type=file]', { state: 'attached' });
await page.setInputFiles('#olchovUp input[type=file]', [IMG, IMG]);
await page.waitForSelector('#olchovUp .ph >> nth=3', { timeout: 20000 });
await page.fill('#olchovIzoh', "Devor 280 sm, shift 265 sm. Shkaf uchun joy 260×60.");
await shot(page, 'olchovchi');
await page.click('[data-a="olchandi"]');
await page.waitForSelector(".badge:has-text(\"O'lchandi\")", { timeout: 20000 }); await saved(page);
console.log("O'lchovchi narxni ko'radimi:", !!seesPrice);
await page.context().close();

// 7. Sotuvchi: narx o'zgardi → sabab → ustaga yuborish (limit ichida bo'lsa)
page = await newPage();
await login(page, '902222222', 'Parol1234');
await openFirst(page);
await page.click('[data-a="calc"]');
await page.waitForSelector('[data-k="Spalniy!C8"]');
await page.fill('[data-k="Spalniy!C8"]', '250');
await page.waitForTimeout(800);
await page.click('#saveCalc');
await page.waitForSelector('#rz');
await page.fill('#rz', "O'lchovdan keyin shkaf 250 sm bo'ldi");
await page.click('#rzb');
await page.waitForSelector('[data-a="toUsta"]', { timeout: 20000 });
await page.click('[data-a="toUsta"]');
await page.waitForSelector('.badge:has-text("Ustaga biriktirish")', { timeout: 20000 }); await saved(page);
await page.waitForTimeout(3000);
if (await page.locator('[data-a="pdf"]').count()) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('[data-a="pdf"]').click()]);
  await dl.saveAs(`${SHOTS}/narx-taklifi.pdf`);
  console.log('PDF yuklandi:', dl.suggestedFilename());
}
await shot(page, 'sotuvchi-ustaga');
await page.context().close();

// 8. Rahbar
page = await newPage();
await login(page, '905555555', 'Parol1234');
await openFirst(page);
await page.selectOption('#ustaSel', { index: 1 });
await page.waitForTimeout(300);
await shot(page, 'rahbar');
await page.click('[data-a="assign"]');
await page.waitForSelector(".badge:has-text(\"Usta qabul qilishi\")", { timeout: 20000 }); await saved(page);
await page.context().close();

// 9. Usta
page = await newPage();
await login(page, '906666666', 'Parol1234');
await openFirst(page);
await shot(page, 'usta');
await page.fill('#muddatIn', '2030-12-31');
await page.locator('[data-a="u-ok"]').click();
await page.click('.modal [data-ok]');
await saved(page);
for (let i = 0; i < 3; i++) { await page.waitForTimeout(3000); await page.locator('[data-a="u-next"]').click(); await saved(page); }
await page.waitForSelector('#yetkUp input[type=file]', { state: 'attached', timeout: 20000 });
await page.click('[data-a="delivered"]');
await page.waitForSelector('#toast.show.bad');
await page.setInputFiles('#yetkUp input[type=file]', [IMG, IMG, IMG, IMG]);
await page.waitForSelector('#yetkUp .ph >> nth=3', { timeout: 20000 });
await page.click('[data-a="delivered"]');
await page.waitForSelector('.badge:has-text("Yakunlandi")', { timeout: 20000 }); await saved(page);
await shot(page, 'usta-yakunlandi');
await page.context().close();

// 10. Admin: yakuniy holat
page = await newPage();
await login(page, '901111111', 'AdminParol123!');
await page.waitForTimeout(1500);
await shot(page, 'admin-yakun');
await page.click('[data-tab="orders"]');
await page.click('[data-chip="all"]');
await openFirst(page);
await page.waitForSelector('#ph-yetkazish img', { timeout: 20000 });
await shot(page, 'admin-buyurtma');
{
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('[data-a="finalpdf"]').click()]);
  await dl.saveAs(`${SHOTS}/yakuniy.pdf`);
  console.log('Yakuniy PDF:', dl.suggestedFilename());
}
await page.click('[data-tab="report"]');
await page.waitForSelector('#rpP');
await shot(page, 'hisobot');
console.log('Hisobot foyda:', (await page.textContent('.stats .stat:nth-child(4) b')).trim());
await page.click('[data-tab="muammo"]');
await page.click('#newT');
await page.fill('#tf [name=title]', 'Sinov muammo');
await page.fill('#tf [name=text]', 'Tekshiruv');
await page.click('#tf button.pri');
await page.waitForSelector('#rf');
await page.fill('#rf [name=text]', 'Javob');
await page.click('#rf button.pri');
await page.waitForSelector('.msg >> nth=1', { timeout: 15000 });
await shot(page, 'muammo');
await page.click('[data-tab="settings"]');
await page.click('[data-st="rollar"]');
await page.waitForSelector('.perm-tbl');
await shot(page, 'rollar');
await page.context().close();

await browser.close();
console.log(errors.length ? 'XATOLAR:\n' + errors.join('\n') : 'Brauzer xatolari yo\'q');
process.exit(errors.length ? 1 : 0);
