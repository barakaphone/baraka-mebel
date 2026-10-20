// firestore.rules sinovlari (Firebase emulyatorida):
//   npx firebase emulators:exec --only firestore "node tools/test-rules.mjs"
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, writeBatch, collectionGroup } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'baraka-mebel-test',
  firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});

let pass = 0, fail = 0;
async function t(name, p) {
  try { await p; pass++; } catch (e) { fail++; console.log('✗', name, '—', e.message.split('\n')[0]); }
}
const ok = (n, p) => t(n, assertSucceeds(p));
const no = (n, p) => t(n, assertFails(p));

const P = { admin: 'u-admin', rahbar: 'u-rahbar', sot: 'u-sot', sot2: 'u-sot2', shart: 'u-shart', olch: 'u-olch', usta: 'u-usta', usta2: 'u-usta2', old: 'u-old', stranger: 'u-x', admin2: 'u-admin2', kassir: 'u-kassir', del: 'u-del' };
const IMG = 'data:image/jpeg;base64,AAAA';
async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    const prof = (id, role, extra = {}) => setDoc(doc(db, 'profiles', id), { login: id, fullName: id, role, active: true, branchId: '', ...extra });
    await setDoc(doc(db, 'meta', 'setup'), { by: P.admin });
    await prof(P.admin, 'admin');
    await prof(P.rahbar, 'rahbar');
    await prof(P.sot, 'sotuvchi', { branchId: 'b1' });
    await prof(P.sot2, 'sotuvchi', { branchId: 'b2' });
    await prof(P.shart, 'shartnomachi');
    await prof(P.olch, 'olchovchi');
    await prof(P.usta, 'usta');
    await prof(P.usta2, 'usta');
    await prof(P.admin2, 'admin');
    await prof(P.kassir, 'kassir');
    await setDoc(doc(db, 'ustaFoiz', P.usta), { foiz: 0.1 });
    await prof(P.old, 'sotuvchi', { branchId: 'b1', active: false });
    await prof(P.del, 'sotuvchi', { branchId: 'b1', deleted: true });
    await setDoc(doc(db, 'branches', 'b1'), { name: 'Filial 1' });
    await setDoc(doc(db, 'settings', 'main'), { kategoriyalar: ['A'] });
    await setDoc(doc(db, 'meta', 'counter'), { n: 5 });
    const order = (id, data) => setDoc(doc(db, 'orders', id), {
      no: 1, branchId: 'b1', sellerId: P.sot, stage: 'murojaat', tolovTuri: '', mebelTuri: 'yigiladigan',
      olchovchiId: '', ustaId: '', ustaName: '', client: { name: 'M', phone: '998901234567' }, log: [], ...data });
    await order('o-new', {});
    await setDoc(doc(db, 'orders', 'o-new', 'pul', 'main'), { branchId: 'b1', result: { naqd: 1000, tanlangan: { qoldiq: 800, oy: 6 } }, ustaBaza: 500 });
    await order('o-sk', { stage: 'skoring', tolovTuri: 'muddatli', olchovchiId: P.olch });
    await setDoc(doc(db, 'orders', 'o-sk', 'pul', 'main'), { branchId: 'b1', result: { naqd: 1000, tanlangan: { qoldiq: 800, oy: 6 } } });
    await order('o-ol', { stage: 'olchov', tolovTuri: 'naqd', olchovchiId: P.olch });
    await order('o-oldi', { stage: 'olchandi', tolovTuri: 'muddatli', olchovchiId: P.olch, olchov: { u: P.olch } });
    await setDoc(doc(db, 'orders', 'o-oldi', 'pul', 'main'), { branchId: 'b1', result: { naqd: 2000, tanlangan: { qoldiq: 1500, oy: 6 } }, skoring: { limit: 1000, qaror: 'tasdiq', by: P.shart } });
    await order('o-ug', { stage: 'ustaga', tolovTuri: 'naqd' });
    await setDoc(doc(db, 'orders', 'o-ug', 'pul', 'main'), { branchId: 'b1', result: { naqd: 1000, tanlangan: { qoldiq: 0, oy: 0 } }, ustaBaza: 500 });
    await order('o-us', { stage: 'usta_tasdiq', tolovTuri: 'naqd', ustaId: P.usta });
    await order('o-b2', { branchId: 'b2', sellerId: P.sot2 });
    await setDoc(doc(db, 'photos', 'ph-pas'), { orderId: 'o-sk', branchId: 'b1', kind: 'pasport', side: 'oldi', data: IMG, createdBy: P.sot });
    await setDoc(doc(db, 'photos', 'ph-ol'), { orderId: 'o-ol', branchId: 'b1', kind: 'olchov', side: '', data: IMG, createdBy: P.olch });
  });
}
const as = id => env.authenticatedContext(id).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const log = { log: [] };

await seed();
// --- Mehmon va begona
await no('mehmon buyurtmani o\'qiy olmaydi', getDoc(doc(anon(), 'orders', 'o-new')));
await no('mehmon profillarni o\'qiy olmaydi', getDocs(collection(anon(), 'profiles')));
await ok('mehmon setup holatini ko\'radi', getDoc(doc(anon(), 'meta', 'setup')));
await no('begona o\'zini admin qila olmaydi', setDoc(doc(as(P.stranger), 'profiles', P.stranger), { role: 'admin', active: true }));
await no('bloklangan xodim o\'qiy olmaydi', getDoc(doc(as(P.old), 'orders', 'o-new')));
await no('qayta setup qilib bo\'lmaydi', setDoc(doc(as(P.stranger), 'meta', 'setup'), { by: P.stranger }));

// --- Sotuvchi
const sot = as(P.sot);
await ok('sotuvchi o\'z filiali buyurtmalari ro\'yxati', getDocs(query(collection(sot, 'orders'), where('branchId', '==', 'b1'))));
await no('sotuvchi boshqa filialni ko\'rmaydi', getDoc(doc(sot, 'orders', 'o-b2')));
await no('sotuvchi barcha buyurtmalarni so\'ray olmaydi', getDocs(collection(sot, 'orders')));
await ok('sotuvchi yangi murojaat ochadi', setDoc(doc(sot, 'orders', 'o-x1'), { branchId: 'b1', sellerId: P.sot, stage: 'murojaat', ustaId: '', no: 9 }));
await no('sotuvchi boshqa filialga murojaat ocholmaydi', setDoc(doc(sot, 'orders', 'o-x2'), { branchId: 'b2', sellerId: P.sot, stage: 'murojaat', ustaId: '' }));
await no('sotuvchi darhol ustaga bosqichida ocholmaydi', setDoc(doc(sot, 'orders', 'o-x3'), { branchId: 'b1', sellerId: P.sot, stage: 'ustaga', ustaId: '' }));
await ok('sotuvchi pul hujjatini o\'qiydi', getDoc(doc(sot, 'orders', 'o-new', 'pul', 'main')));
await ok('sotuvchi narxni yangilaydi (murojaat)', setDoc(doc(sot, 'orders', 'o-new', 'pul', 'main'), { branchId: 'b1', result: { naqd: 1200, tanlangan: { qoldiq: 900, oy: 6 } } }));
await no('sotuvchi skoring qarorini yozolmaydi', updateDoc(doc(sot, 'orders', 'o-new', 'pul', 'main'), { skoring: { qaror: 'tasdiq', limit: 9e9 } }));
await ok('sotuvchi muddatli → shartnomachiga', updateDoc(doc(sot, 'orders', 'o-new'), { stage: 'skoring', tolovTuri: 'muddatli', ...log }));
await seed();
await no('sotuvchi muddatlini to\'g\'ridan-to\'g\'ri o\'lchovga yuborolmaydi', updateDoc(doc(as(P.sot), 'orders', 'o-new'), { stage: 'olchov', tolovTuri: 'muddatli', olchovchiId: P.olch }));
await ok('sotuvchi naqd → o\'lchovga', updateDoc(doc(as(P.sot), 'orders', 'o-new'), { stage: 'olchov', tolovTuri: 'naqd', olchovchiId: P.olch }));
await seed();
await no('sotuvchi o\'zi ustani biriktira olmaydi', updateDoc(doc(as(P.sot), 'orders', 'o-new'), { ustaId: P.usta }));
await no('sotuvchi buyurtmani yakunlay olmaydi', updateDoc(doc(as(P.sot), 'orders', 'o-ug'), { stage: 'yakunlandi' }));
await no('sotuvchi limitdan oshgan narxni ustaga yuborolmaydi', updateDoc(doc(as(P.sot), 'orders', 'o-oldi'), { stage: 'ustaga' }));
await ok('sotuvchi limitdan oshganini shartnomachiga qaytaradi', updateDoc(doc(as(P.sot), 'orders', 'o-oldi'), { stage: 'skoring' }));
await seed();
await ok('sotuvchi pasport yuklaydi', setDoc(doc(as(P.sot), 'photos', 'p1'), { orderId: 'o-sk', branchId: 'b1', kind: 'pasport', side: 'orqa', data: IMG, createdBy: P.sot }));
await no('sotuvchi boshqa filial buyurtmasiga rasm yuklay olmaydi', setDoc(doc(as(P.sot), 'photos', 'p2'), { orderId: 'o-b2', branchId: 'b1', kind: 'pasport', side: 'oldi', data: IMG, createdBy: P.sot }));
await ok('sotuvchi pasportni ko\'radi', getDocs(query(collection(as(P.sot), 'photos'), where('orderId', '==', 'o-sk'), where('kind', '==', 'pasport'), where('branchId', '==', 'b1'))));
await ok('hisoblagich +1', updateDoc(doc(as(P.sot), 'meta', 'counter'), { n: 6 }));
await no('hisoblagichni sakratib bo\'lmaydi', updateDoc(doc(as(P.sot), 'meta', 'counter'), { n: 100 }));
await no('sotuvchi sozlamani o\'zgartira olmaydi', setDoc(doc(as(P.sot), 'settings', 'kalk'), { cells: {} }));

// --- Shartnomachi
const sh = as(P.shart);
await ok('shartnomachi muddatli buyurtmalar ro\'yxati', getDocs(query(collection(sh, 'orders'), where('tolovTuri', '==', 'muddatli'))));
await no('shartnomachi naqd buyurtmani ko\'rmaydi', getDoc(doc(sh, 'orders', 'o-ol')));
await ok('shartnomachi pasportni ko\'radi', getDocs(query(collection(sh, 'photos'), where('orderId', '==', 'o-sk'), where('kind', '==', 'pasport'))));
await ok('shartnomachi narxni ko\'radi', getDoc(doc(sh, 'orders', 'o-sk', 'pul', 'main')));
{
  const b = writeBatch(sh);
  b.update(doc(sh, 'orders', 'o-sk', 'pul', 'main'), { skoring: { limit: 900, qaror: 'tasdiq', by: P.shart, at: 1 } });
  b.update(doc(sh, 'orders', 'o-sk'), { stage: 'olchov', ...log });
  await ok('shartnomachi tasdiqlaydi', b.commit());
}
await seed();
{
  const sh2 = as(P.shart);
  const b = writeBatch(sh2);
  b.update(doc(sh2, 'orders', 'o-sk', 'pul', 'main'), { skoring: { limit: 900, qaror: 'bekor', by: P.shart, at: 1 } });
  b.update(doc(sh2, 'orders', 'o-sk'), { stage: 'olchov', ...log });
  await no('shartnomachi "bekor" deb o\'lchovga o\'tkaza olmaydi', b.commit());
}
await seed();
await no('shartnomachi qarorsiz bosqichni o\'zgartira olmaydi', updateDoc(doc(as(P.shart), 'orders', 'o-sk'), { stage: 'ustaga' }));
await no('shartnomachi narxni o\'zgartira olmaydi', updateDoc(doc(as(P.shart), 'orders', 'o-sk', 'pul', 'main'), { result: { naqd: 1 } }));
await no('shartnomachi mijoz ma\'lumotini o\'zgartira olmaydi', updateDoc(doc(as(P.shart), 'orders', 'o-sk'), { client: { name: 'X' } }));

// --- O'lchovchi
const ol = as(P.olch);
await ok('o\'lchovchi o\'z ro\'yxati', getDocs(query(collection(ol, 'orders'), where('olchovchiId', '==', P.olch))));
await no('o\'lchovchi narxni ko\'rmaydi', getDoc(doc(ol, 'orders', 'o-sk', 'pul', 'main')));
await no('o\'lchovchi pasportni ko\'rmaydi', getDoc(doc(ol, 'photos', 'ph-pas')));
await ok('o\'lchovchi rasm yuklaydi', setDoc(doc(ol, 'photos', 'p3'), { orderId: 'o-ol', branchId: 'b1', kind: 'olchov', side: '', data: IMG, createdBy: P.olch }));
await no('o\'lchovchi pasport yuklay olmaydi', setDoc(doc(ol, 'photos', 'p4'), { orderId: 'o-ol', branchId: 'b1', kind: 'pasport', side: 'oldi', data: IMG, createdBy: P.olch }));
await ok('o\'lchovchi "o\'lchandi"', updateDoc(doc(ol, 'orders', 'o-ol'), { stage: 'olchandi', olchov: { izoh: '320 sm', u: P.olch }, ...log }));
await seed();
await no('o\'lchovchi bosqichni sakrata olmaydi', updateDoc(doc(as(P.olch), 'orders', 'o-ol'), { stage: 'ustaga', olchov: { izoh: 'x', u: P.olch } }));

// --- Rahbar
const ra = as(P.rahbar);
await ok('rahbar barcha buyurtmalar', getDocs(collection(ra, 'orders')));
{
  const b = writeBatch(ra);
  b.update(doc(ra, 'orders', 'o-ug'), { stage: 'usta_tasdiq', ustaId: P.usta, ustaName: 'U', ...log });
  b.set(doc(ra, 'orders', 'o-ug', 'pul', 'main'), { ustaId: P.usta, ustaHaqi: 50, ustaFoiz: 0.1 }, { merge: true });
  b.set(doc(ra, 'orders', 'o-ug', 'usta', 'main'), { ustaId: P.usta, haqi: 50 });
  await ok('rahbar ustani biriktiradi (haqi pul hujjatiga)', b.commit());
}
await no('rahbar usta o\'rniga sotuvchini biriktira olmaydi', updateDoc(doc(ra, 'orders', 'o-us'), { stage: 'usta_tasdiq', ustaId: P.sot, ustaName: 'S' }));
await no('rahbar usta haqini buyurtmaning ochiq qismiga yoza olmaydi', updateDoc(doc(ra, 'orders', 'o-us'), { stage: 'usta_tasdiq', ustaId: P.usta, ustaName: 'U', ustaHaqi: 50 }));
await ok('biriktirilgan usta o\'z haqini ko\'radi', getDoc(doc(as(P.usta), 'orders', 'o-ug', 'usta', 'main')));
await no('boshqa usta bu haqni ko\'rmaydi', getDoc(doc(as(P.usta2), 'orders', 'o-ug', 'usta', 'main')));
await no('usta o\'z haqini o\'zgartira olmaydi (alohida hujjat)', setDoc(doc(as(P.usta), 'orders', 'o-ug', 'usta', 'main'), { ustaId: P.usta, haqi: 1e9 }));
await ok('rahbar usta foizini ko\'radi', getDoc(doc(ra, 'ustaFoiz', P.usta)));
await ok('rahbar usta foizini yozadi', setDoc(doc(ra, 'ustaFoiz', P.usta2), { foiz: 0.12 }));
await no('rahbar narxni o\'zgartira olmaydi', updateDoc(doc(ra, 'orders', 'o-new', 'pul', 'main'), { result: { naqd: 1 } }));
await ok('rahbar xom ashyo narxini o\'zgartiradi', setDoc(doc(ra, 'settings', 'xom'), { cells: { 'Laminat xom ashyo!R5': 1 } }));
await no('rahbar ustamani o\'zgartira olmaydi', setDoc(doc(ra, 'settings', 'kalk'), { cells: {} }));
await ok('rahbar usta qo\'shadi', setDoc(doc(ra, 'profiles', 'u-new'), { role: 'usta', active: true, fullName: 'N' }));
await no('rahbar admin qo\'sha olmaydi', setDoc(doc(ra, 'profiles', 'u-new2'), { role: 'admin', active: true }));
await no('rahbar ustani admin qila olmaydi', updateDoc(doc(ra, 'profiles', P.usta), { role: 'admin' }));
await no('rahbar pasportni ko\'rmaydi', getDoc(doc(ra, 'photos', 'ph-pas')));

// --- Usta
await seed();
const us = as(P.usta);
await ok('usta o\'z ishlari', getDocs(query(collection(us, 'orders'), where('ustaId', '==', P.usta))));
await no('usta boshqa buyurtmani ko\'rmaydi', getDoc(doc(us, 'orders', 'o-new')));
await no('usta narxni ko\'rmaydi', getDoc(doc(us, 'orders', 'o-new', 'pul', 'main')));
await ok('usta o\'lchov rasmini ko\'radi', getDocs(query(collection(us, 'photos'), where('orderId', '==', 'o-ol'), where('kind', '==', 'olchov'))));
await ok('usta narxni tasdiqlaydi', updateDoc(doc(us, 'orders', 'o-us'), { stage: 'kesish', ...log }));
await no('usta bosqichni sakrata olmaydi', updateDoc(doc(us, 'orders', 'o-us'), { stage: 'yakunlandi' }));
await no('usta o\'z haqini o\'zgartira olmaydi', updateDoc(doc(us, 'orders', 'o-us'), { stage: 'yigish', ustaHaqi: 999999 }));
await no('usta o\'z foizini ko\'rmaydi', getDoc(doc(us, 'ustaFoiz', P.usta)));
await no('usta muddatni keyin o\'zgartira olmaydi', updateDoc(doc(us, 'orders', 'o-us'), { muddat: '2030-01-01' }));
await seed();
await ok('usta ishni muddat bilan qabul qiladi', updateDoc(doc(as(P.usta), 'orders', 'o-us'), { stage: 'kesish', muddat: '2030-01-01', 'stageAt.kesish': 1, ...log }));
await no('boshqa usta bu ishga tegolmaydi', updateDoc(doc(as(P.usta2), 'orders', 'o-us'), { stage: 'yigish' }));
await no('usta yetkazish bosqichidan oldin rasm yuklay olmaydi', setDoc(doc(us, 'photos', 'p5'), { orderId: 'o-us', branchId: 'b1', kind: 'yetkazish', side: '', data: IMG, createdBy: P.usta }));

// --- Rollar va ruxsatlar
await seed();
await no('o\'chirilgan xodim kira olmaydi', getDoc(doc(as(P.del), 'orders', 'o-new')));
await no('rolsiz (kassir) hech narsa ko\'rmaydi', getDocs(collection(as(P.kassir), 'orders')));
await no('oddiy admin rollarni o\'zgartira olmaydi', setDoc(doc(as(P.admin2), 'settings', 'roles'), { roles: {} }));
await no('oddiy admin usta foizini yoza olmaydi', setDoc(doc(as(P.admin2), 'ustaFoiz', P.usta), { foiz: 0.5 }));
await no('oddiy admin o\'ziga rollar huquqini bera olmaydi', updateDoc(doc(as(P.admin2), 'profiles', P.admin2), { canManageRoles: true }));
await ok('tizim egasi adminga rollar huquqini beradi', updateDoc(doc(as(P.admin), 'profiles', P.admin2), { canManageRoles: true }));
await ok('ruxsat berilgan admin rollarni o\'zgartiradi', setDoc(doc(as(P.admin2), 'settings', 'roles'), { roles: {
  kassir: { name: 'Kassir', perms: { ord_all: true } },
  sotuvchi: { name: 'Sotuvchi', perms: { ord_branch: true, calc: true } },
} }));
await ok('yangi rol (kassir) ruxsat bilan ko\'radi', getDocs(collection(as(P.kassir), 'orders')));
await no('ruxsati olingan sotuvchi murojaat ocholmaydi', setDoc(doc(as(P.sot), 'orders', 'o-x9'), { branchId: 'b1', sellerId: P.sot, stage: 'murojaat', ustaId: '', no: 9 }));
await ok('ruxsati qolgan sotuvchi ro\'yxatni ko\'radi', getDocs(query(collection(as(P.sot), 'orders'), where('branchId', '==', 'b1'))));
await ok('xodim faqat "o\'qildi" belgisini yangilaydi', updateDoc(doc(as(P.usta), 'profiles', P.usta), { seen: { t1: 5 } }));
await no('xodim o\'z rolini o\'zgartira olmaydi', updateDoc(doc(as(P.usta), 'profiles', P.usta), { role: 'admin' }));

// --- Muammolar
await seed();
const tp = { title: 'Kalkulyator', text: 'Narx chiqmadi', by: P.usta, byName: 'U', byRole: 'usta', branchId: '', orderId: '', orderNo: '', status: 'open', replies: 0, createdAt: 1, lastAt: 1, lastBy: P.usta, lastByName: 'U' };
await ok('xodim muammo yozadi', setDoc(doc(as(P.usta), 'topics', 't1'), tp));
await no('boshqa nomidan muammo yozib bo\'lmaydi', setDoc(doc(as(P.usta), 'topics', 't2'), { ...tp, by: P.sot }));
await ok('boshqa xodim javob yozadi', setDoc(doc(as(P.sot), 'topics', 't1', 'msgs', 'm1'), { text: 'Tekshiraman', by: P.sot, byName: 'S', byRole: 'sotuvchi', at: 2 }));
await ok('javobdan keyin mavzu yangilanadi', updateDoc(doc(as(P.sot), 'topics', 't1'), { lastAt: 2, lastBy: P.sot, lastByName: 'S', replies: 1 }));
await no('begona xodim muammoni yopa olmaydi', updateDoc(doc(as(P.sot), 'topics', 't1'), { status: 'closed', closedBy: P.sot, closedAt: 3 }));
await ok('admin muammoni yopadi', updateDoc(doc(as(P.admin), 'topics', 't1'), { status: 'closed', closedBy: P.admin, closedAt: 3 }));

// --- Muddatni o'zgartirish, rahbar narxi, bildirishnomalar, hisobotdan o'chirish
await seed();
await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  await setDoc(doc(db, 'orders', 'o-ks'), { no: 9, branchId: 'b1', sellerId: P.sot, stage: 'kesish', tolovTuri: 'naqd', mebelTuri: 'yigiladigan', ustaId: P.usta, muddat: '2030-01-10', log: [] });
  await setDoc(doc(db, 'orders', 'o-ks', 'pul', 'main'), { branchId: 'b1', result: { naqd: 1000 }, ustaId: P.usta, ustaHaqi: 50, ustaFoiz: 0.1 });
  await setDoc(doc(db, 'orders', 'o-ug', 'pul', 'main'), { branchId: 'b1', result: { naqd: 1000, tanlangan: { qoldiq: 0, oy: 0 } }, ustaBaza: 500, ustaId: P.usta, ustaHaqi: 50, ustaFoiz: 0.1 });
  await setDoc(doc(db, 'notifs', 'n1'), { to: P.sot, orderId: 'o-ks', orderNo: '9', client: 'M', kind: 'usta', text: 'x', by: P.usta, byName: 'U', at: 1, read: false });
});
const mt = { eski: '2030-01-10', yangi: '2030-01-15', sabab: 'Material', t: 1, n: 'U', u: P.usta };
await ok('usta o\'z ishining muddatini o\'zgartiradi (sababi bilan)', updateDoc(doc(as(P.usta), 'orders', 'o-ks'), { muddat: '2030-01-15', muddatTarix: [mt] }));
await no('usta tarixsiz muddatni o\'zgartira olmaydi', updateDoc(doc(as(P.usta), 'orders', 'o-ks'), { muddat: '2030-02-01' }));
await no('boshqa usta muddatni o\'zgartira olmaydi', updateDoc(doc(as(P.usta2), 'orders', 'o-ks'), { muddat: '2030-02-01', muddatTarix: [mt, mt] }));
await no('sotuvchi muddatni o\'zgartira olmaydi', updateDoc(doc(as(P.sot), 'orders', 'o-ks'), { muddat: '2030-02-01', muddatTarix: [mt, mt] }));
await ok('rahbar muddatni o\'zgartiradi', updateDoc(doc(as(P.rahbar), 'orders', 'o-ks'), { muddat: '2030-02-01', muddatTarix: [mt, { ...mt, u: P.rahbar }] }));
await ok('rahbar usta bosqichida narxni o\'zgartiradi', updateDoc(doc(as(P.rahbar), 'orders', 'o-ug', 'pul', 'main'), { result: { naqd: 1200, tanlangan: { qoldiq: 0, oy: 0 } }, ustaHaqi: 60 }));
await ok('rahbar buyurtma hisobini yangilaydi', updateDoc(doc(as(P.rahbar), 'orders', 'o-ug'), { hasCalc: true, ish: { lines: [] } }));
await no('rahbar ustani narx bilan birga almashtira olmaydi', updateDoc(doc(as(P.rahbar), 'orders', 'o-ug', 'pul', 'main'), { result: { naqd: 1 }, ustaId: P.usta2 }));
await no('sotuvchi usta bosqichida narxni o\'zgartira olmaydi', updateDoc(doc(as(P.sot), 'orders', 'o-ug', 'pul', 'main'), { result: { naqd: 1 } }));
await ok('usta sotuvchiga bildirishnoma yuboradi', setDoc(doc(as(P.usta), 'notifs', 'n2'), { to: P.sot, orderId: 'o-ks', orderNo: '9', client: 'M', kind: 'usta', text: 'qabul qildi', by: P.usta, byName: 'U', at: 2, read: false }));
await no('boshqa nomidan bildirishnoma yozib bo\'lmaydi', setDoc(doc(as(P.usta), 'notifs', 'n3'), { to: P.sot, orderId: 'o-ks', orderNo: '9', client: 'M', kind: 'usta', text: 'x', by: P.rahbar, byName: 'U', at: 2, read: false }));
await ok('sotuvchi o\'z bildirishnomalarini o\'qiydi', getDocs(query(collection(as(P.sot), 'notifs'), where('to', '==', P.sot))));
await no('boshqaning bildirishnomasini o\'qib bo\'lmaydi', getDoc(doc(as(P.sot2), 'notifs', 'n1')));
await ok('sotuvchi "o\'qildi" belgilaydi', updateDoc(doc(as(P.sot), 'notifs', 'n1'), { read: true }));
await no('bildirishnoma matnini o\'zgartirib bo\'lmaydi', updateDoc(doc(as(P.sot), 'notifs', 'n1'), { text: 'y' }));
await ok('admin hisobotdan o\'chiradi', updateDoc(doc(as(P.admin), 'orders', 'o-ks'), { reportHidden: { by: P.admin, n: 'A', t: 1 } }));
await no('sotuvchi hisobotdan o\'chira olmaydi', updateDoc(doc(as(P.sot), 'orders', 'o-new'), { reportHidden: { by: P.sot, n: 'S', t: 1 } }));
await ok('sotuvchi shartnomadan keyin o\'lchovchini biriktiradi', (async () => {
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'orders', 'o-ol2'), { no: 10, branchId: 'b1', sellerId: P.sot, stage: 'olchov', tolovTuri: 'muddatli', mebelTuri: 'yigiladigan', olchovchiId: '', log: [] }));
  return updateDoc(doc(as(P.sot), 'orders', 'o-ol2'), { olchovchiId: P.olch, olchovchiName: 'K' });
})());

// --- Admin
await seed();
const ad = as(P.admin);
await ok('admin hammasini ko\'radi', getDocs(collection(ad, 'orders')));
await ok('admin hisobot (pul collectionGroup)', getDocs(collectionGroup(ad, 'pul')));
await no('sotuvchi pul collectionGroup ololmaydi', getDocs(collectionGroup(as(P.sot), 'pul')));
await ok('admin sozlamani yozadi', setDoc(doc(ad, 'settings', 'kalk'), { cells: { 'Sozlamalar!C9': 0.3 } }));
await ok('admin xodim qo\'shadi', setDoc(doc(ad, 'profiles', 'u-n3'), { role: 'sotuvchi', active: true, branchId: 'b1' }));
await no('admin o\'zini bloklay olmaydi', updateDoc(doc(ad, 'profiles', P.admin), { active: false }));
await no('buyurtmani o\'chirib bo\'lmaydi (sotuvchi)', deleteDoc(doc(as(P.sot), 'orders', 'o-new')));
await ok('tizim egasi o\'chira oladi', deleteDoc(doc(ad, 'orders', 'o-b2')));

console.log(`\nO'tdi: ${pass}, xato: ${fail}`);
await env.cleanup();
process.exit(fail ? 1 : 0);
