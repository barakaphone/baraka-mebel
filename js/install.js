// Ilovani o'rnatish: Android/kompyuter — brauzerning o'rnatish oynasi,
// iPhone/iPad — "Ulashish → Bosh ekranga qo'shish" ko'rsatmasi.
const KEY = 'bm-install-later';
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let deferred = null;

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

function later() { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* yo'q */ } }
function snoozed() { try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < 3 * 86400000; } catch (e) { return false; } }

function iosHelp() {
  const w = document.createElement('div');
  w.className = 'modal-bg';
  w.innerHTML = `<div class="modal"><button class="mclose" aria-label="Yopish">×</button>
    <h2>iPhone'ga o'rnatish</h2>
    <ol class="ios-steps">
      <li>Safari'ning pastki panelidagi <b>Ulashish</b> tugmasini bosing <span class="ios-ic">⬆︎</span></li>
      <li>Ro'yxatni pastga suring va <b>"Bosh ekranga qo'shish"</b> (На экран «Домой» / Add to Home Screen) ni tanlang</li>
      <li>O'ng yuqoridagi <b>"Qo'shish"</b> ni bosing</li>
    </ol>
    <p class="hint">Ekraningizda <b>Baraka Mebel</b> belgisi paydo bo'ladi. Ilova shu belgidan to'liq ekranda ochiladi.</p>
    <p class="hint">Chrome ishlatayotgan bo'lsangiz ham Ulashish → "Bosh ekranga qo'shish" orqali qo'shish mumkin.</p>
    <button class="btn pri block" data-ok>Tushunarli</button></div>`;
  document.body.appendChild(w);
  const close = () => w.remove();
  w.querySelector('.mclose').onclick = close;
  w.querySelector('[data-ok]').onclick = close;
  w.addEventListener('click', e => { if (e.target === w) close(); });
}

export async function installApp() {
  if (standalone()) { alert("Ilova allaqachon o'rnatilgan"); return; }
  if (deferred) {
    deferred.prompt();
    const r = await deferred.userChoice.catch(() => null);
    deferred = null;
    if (r?.outcome === 'accepted') hideBar();
    return;
  }
  if (ios()) { iosHelp(); return; }
  alert("Brauzer menyusidan (⋮) \"Ilovani o'rnatish\" yoki \"Bosh ekranga qo'shish\" ni tanlang");
}
export const canInstall = () => !standalone();

function hideBar() { document.getElementById('installBar')?.remove(); }
function showBar() {
  if (standalone() || snoozed() || document.getElementById('installBar')) return;
  const bar = document.createElement('div');
  bar.id = 'installBar';
  bar.className = 'install-bar';
  bar.innerHTML = `<img src="img/icon-192.png" alt="">
    <div class="ib-t"><b>Baraka Mebel ilovasi</b><span>Telefoningizga o'rnating — bir bosishda ochiladi</span></div>
    <button class="btn gold sm" data-inst>📲 O'rnatish</button><button class="ib-x" data-later aria-label="Keyinroq">×</button>`;
  document.body.appendChild(bar);
  bar.querySelector('[data-inst]').onclick = installApp;
  bar.querySelector('[data-later]').onclick = () => { later(); hideBar(); };
}

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; showBar(); });
window.addEventListener('appinstalled', () => { hideBar(); deferred = null; });
// iPhone'da brauzer o'zi taklif qilmaydi — panelni o'zimiz ko'rsatamiz
if (ios() && !standalone()) setTimeout(showBar, 1500);

// Kirish oynasidagi tugma
const lb = document.getElementById('instLogin');
if (lb && !standalone()) { lb.classList.remove('hidden'); lb.onclick = installApp; }
