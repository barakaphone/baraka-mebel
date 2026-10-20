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
  if (r === 'usta' || r === 'olchovchi') { await page.fill('#sf [name=viloyat]', "Farg'ona viloyati"); await page.fill('#sf [name=tuman]', "Qo'qon sh."); }
  await page.click('#sf button.pri');
  try { await page.waitForSelector('#sf', { state: 'detached', timeout: 20000 }); } catch (e) { console.log('FORM XATO:', r, await page.textContent('#sfErr')); await shot(page, 'form-xato'); throw e; }
}
await shot(page, 'xodimlar');
await page.context().close();

// 4. Sotuvchi: murojaat → hisob → rasmiylashtirish (6 oy, pasport)
page = await newPage();
await login(page, '902222222', 'Parol1234');
await page.click('[data-newo]');
await page.waitForSelector('#nf');
await page.click('#nf .paysel label:has-text("Muddatli")');
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
console.log('Rasmiylashtirish tugmasi:', (await page.textContent('[data-a="formal"]')).trim());
await page.click('[data-a="formal"]');
await page.waitForSelector('#ppUp [data-up="oldi"]', { state: 'attached' });
await page.setInputFiles('#ppUp [data-up="oldi"]', IMG);
await page.waitForSelector('#ppUp [data-side="oldi"][data-has="1"]', { timeout: 20000 });
await page.waitForSelector('#fmSkip:visible');
await page.setInputFiles('#ppUp [data-up="orqa"]', IMG);
await page.waitForSelector('#ppUp [data-side="orqa"][data-has="1"]', { timeout: 20000 });
await page.waitForSelector('#fmBtn:visible');
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

// 5b. Sotuvchi: shartnomachi ruxsatidan keyin o'lchovchini biriktiradi (hududi bilan)
page = await newPage();
await login(page, '902222222', 'Parol1234');
await openFirst(page);
await page.waitForSelector('[data-a="olAssign"]');
const olLabel = await page.locator('#olSel option >> nth=1').textContent();
console.log("O'lchovchi ro'yxatda:", olLabel.trim());
await page.selectOption('#olSel', { index: 1 });
await page.click('[data-a="olAssign"]'); await saved(page);
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
await page.waitForSelector('.badge:has-text("Ustaga biriktirish")', { timeout: 20000 }); await saved(page);
console.log("O'lchovchi narxni ko'radimi:", !!seesPrice);
await page.context().close();

// 7. Sotuvchi: 🔔 "o'lchandi" xabari
page = await newPage();
await login(page, '902222222', 'Parol1234');
await page.waitForSelector('#bellCnt:not(.hidden)', { timeout: 15000 });
console.log('Sotuvchi bildirishnomalari:', await page.textContent('#bellCnt'));
await page.click('#bellBtn'); await page.waitForSelector('.nitem'); await shot(page, 'bildirishnoma');
await page.click('.nitem'); await page.waitForSelector('#back');
console.log("O'lchovdan keyingi bosqich:", (await page.textContent('h2 + div .badge:last-child, .badge >> nth=0')).trim());
await page.context().close();

// 8. Rahbar: narxni o'zgartiradi (sababi bilan) va ustani biriktiradi
page = await newPage();
await login(page, '905555555', 'Parol1234');
await page.click('[data-chip="ustaga"]');
await openFirst(page);
await page.click('[data-a="calc"]');
await page.waitForSelector('[data-k="Spalniy!C8"]');
await page.fill('[data-k="Spalniy!C8"]', '250');
await page.waitForTimeout(800);
await page.click('#saveCalc');
await page.waitForSelector('#rz');
await page.fill('#rz', "O'lchovdan keyin shkaf 250 sm bo'ldi");
await page.click('#rzb');
await page.waitForSelector('#ustaSel', { timeout: 20000 });
await page.selectOption('#ustaSel', { index: 1 });
await page.waitForTimeout(300);
await shot(page, 'rahbar');
await page.click('[data-a="assign"]');
await page.waitForSelector(".badge:has-text(\"O'lchov narxni tasdig'i\")", { timeout: 20000 }); await saved(page);
await page.context().close();

// 9. Usta: avval e'tiroz, keyin o'lchov va narxga rozilik
page = await newPage();
await login(page, '906666666', 'Parol1234');
await openFirst(page);
await page.waitForSelector('#ustaHaqiMe b', { timeout: 15000 });
console.log('Usta o\'z haqini ko\'radi:', (await page.textContent('#ustaHaqiMe')).trim());
await page.click('[data-a="un-no"]'); await page.fill('#etz', 'Shkaf chuqurligini aniqlash kerak'); await page.click('#etzb'); await saved(page);
await page.waitForTimeout(1500);
await page.click('[data-a="un-ok"]');
await page.waitForSelector('.badge:has-text("Narxni tasdiqlatish")', { timeout: 20000 }); await saved(page);
await shot(page, 'usta-rozi');
await page.context().close();

// 10a. Sotuvchi: mijozga yakuniy narxni tasdiqlatadi (foto — kamida bittasi)
page = await newPage();
await login(page, '902222222', 'Parol1234');
await openFirst(page);
await page.waitForSelector('#mtUp [data-ph]', { state: 'attached' });
await page.click('[data-a="mt-ok"]');
await page.waitForSelector('#toast.show.bad');
await page.setInputFiles('#mtUp [data-ph]', IMG);
await page.waitForSelector('#mtUp .ph', { timeout: 20000 });
await shot(page, 'mijoz-tasdiq');
if (await page.locator('[data-a="pdf"]').count()) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('[data-a="pdf"]').click()]);
  await dl.saveAs(`${SHOTS}/narx-taklifi.pdf`);
  console.log('PDF yuklandi:', dl.suggestedFilename());
}
await page.waitForTimeout(1500);
await page.click('[data-a="mt-ok"]');
await page.waitForSelector('.badge:has-text("Mahsulotni kirim qilish")', { timeout: 20000 }); await saved(page);
await page.context().close();

// 10b. Rahbar: mahsulotni kirim qilish
page = await newPage();
await login(page, '905555555', 'Parol1234');
await page.click('[data-chip="kirim"]');
await openFirst(page);
await page.fill('#kSum', '5 400 000'); await page.fill('#kDoc', 'NK-145'); await page.fill('#kIzoh', 'Laminat va furnitura');
await page.setInputFiles('#kUp [data-ph]', IMG);
await page.waitForSelector('#kUp .ph', { timeout: 20000 });
await page.click('[data-a="kirim-ok"]');
await page.waitForSelector('.badge:has-text("Shartnoma")', { timeout: 20000 }); await saved(page);
await page.context().close();

// 10c. Sotuvchi: shartnoma
page = await newPage();
await login(page, '902222222', 'Parol1234');
await openFirst(page);
await page.fill('#shNo', 'SH-2026-15');
await page.setInputFiles('#shUp [data-ph]', [IMG, IMG]);
await page.waitForSelector('#shUp .ph >> nth=1', { timeout: 20000 });
await shot(page, 'shartnoma');
await page.click('[data-a="sh-ok"]');
await page.waitForSelector('.badge:has-text("Usta qabul qilishi")', { timeout: 20000 }); await saved(page);
await page.context().close();

// 11. Usta: ishni qabul qiladi, muddatni o'zgartiradi
page = await newPage();
await login(page, '906666666', 'Parol1234');
await openFirst(page);
await shot(page, 'usta');
await page.fill('#muddatIn', '2030-12-31');
await page.locator('[data-a="u-ok"]').click();
await page.click('.modal [data-ok]');
await saved(page);
await page.waitForSelector('[data-a="muddat"]');
await page.click('[data-a="muddat"]');
await page.fill('#nm', '2031-01-15'); await page.fill('#nmz', 'Material kechikdi');
await page.click('#nmb'); await saved(page);
await page.waitForTimeout(1500);
await shot(page, 'usta-muddat');
await page.context().close();

// 11b. Sotuvchi: yangi muddatga mijoz tasdig'i
page = await newPage();
await login(page, '902222222', 'Parol1234');
await openFirst(page);
await page.waitForSelector('#mdUp [data-ph]', { state: 'attached' });
await page.setInputFiles('#mdUp [data-ph]', IMG);
await page.waitForSelector('#mdUp .ph', { timeout: 20000 });
await page.click('[data-a="md-ok"]'); await saved(page);
await page.context().close();

// 12. Usta: ish bosqichlari va yetkazib berish
page = await newPage();
await login(page, '906666666', 'Parol1234');
await openFirst(page);
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
await page.click('[data-hide]'); await page.click('.modal [data-ok]'); await saved(page);
await page.waitForSelector('[data-unhide]', { state: 'attached' });
console.log("Hisobotdan o'chirildi, foyda endi:", (await page.textContent('.stats .stat:nth-child(4) b')).trim());
await page.click('details.grp summary'); await shot(page, 'hisobot-ochirilgan');
await page.click('[data-unhide]'); await saved(page);
await page.click('#cwFab');
await page.click('#cwNew');
await page.fill('#cwForm [name=text]', 'Sinov muammo\nTekshiruv');
await page.click('#cwForm .cw-send');
await page.waitForSelector('.cw-head [data-st="open"], .cw-head[data-st="open"]');
await page.fill('#cwForm [name=text]', 'Javob');
await page.click('#cwForm .cw-send');
await page.waitForSelector('.cw-msg >> nth=1', { timeout: 15000 });
await shot(page, 'muammo');
await page.click('[data-min]');
await page.click('[data-tab="settings"]');
await page.click('[data-st="rollar"]');
await page.waitForSelector('.perm-tbl');
await shot(page, 'rollar');
await page.context().close();

await browser.close();
console.log(errors.length ? 'XATOLAR:\n' + errors.join('\n') : 'Brauzer xatolari yo\'q');
process.exit(errors.length ? 1 : 0);
