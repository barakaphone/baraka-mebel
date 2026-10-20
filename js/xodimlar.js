// Xodimlar va filiallar
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signOut, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, collection, setDoc, updateDoc, getDocs, query, where, writeBatch, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { esc, pct, normPhone, fmtPhone, parseNum, toast, errText, modal, confirmBox, phoneField } from './util.js';
import { EMU } from './firebase-config.js';

// Yangi Firebase login yaratish (adminning o'z sessiyasi buzilmasligi uchun alohida ilova nusxasida)
export async function createStaffAccount(ctx, phone, pw, k) {
  const sec = initializeApp(ctx.firebaseConfig, 'staff-' + Date.now());
  try {
    if (EMU) connectAuthEmulator(getAuth(sec), 'http://127.0.0.1:9099', { disableWarnings: true });
    const cred = await createUserWithEmailAndPassword(getAuth(sec), ctx.emailFor(phone, k), pw);
    await signOut(getAuth(sec));
    return cred.user.uid;
  } finally { await deleteApp(sec); }
}

const OPEN_STAGES = ['murojaat', 'skoring', 'olchov', 'olchandi', 'ustaga', 'usta_tasdiq', 'kesish', 'yigish', 'qadoqlash', 'yetkazish'];

export function renderStaff(page, ctx) {
  const { S, can, isOwner } = ctx;
  const admin = S.me.role === 'admin';
  const onlyUsta = !admin && !can('staff_view');           // faqat usta qo'sha oladigan (rahbar)
  const canEdit = p => admin || (can('add_usta') && ctx.S.roles[p.role]?.perms?.work && p.role !== 'admin');
  const seesFoiz = isOwner() || can('see_usta_foiz');
  const isUsta = p => !!S.roles[p.role]?.perms?.work && p.role !== 'admin';
  const fb = S.filter.branch;
  const visible = S.staff.filter(p => !p.replacedBy).filter(p => !onlyUsta || isUsta(p)).filter(p => !fb || p.branchId === fb);
  const list = visible.filter(p => !p.deleted), removed = visible.filter(p => p.deleted);
  const bn = id => S.branches.find(b => b.id === id)?.name || '';
  const row = p => `<tr><td><b>${esc(p.fullName)}</b>${p.id === S.ownerId ? ' <span class="badge gold">Tizim egasi</span>' : ''}${p.canManageRoles ? ' <span class="badge vio">Rollar</span>' : ''}</td>
    <td>${esc(fmtPhone(p.login))}</td><td>${esc(ctx.roleName(p.role))}</td>
    <td>${esc(isUsta(p) ? (p.mutaxassislik || '') : bn(p.branchId) || '—')}${p.tuman || p.viloyat ? `<div class="hint">📍 ${esc([p.viloyat, p.tuman].filter(Boolean).join(', '))}</div>` : ''}</td>
    ${seesFoiz ? `<td class="r">${isUsta(p) ? pct(S.ustaFoiz[p.id] || 0) : ''}</td>` : ''}
    <td>${p.deleted ? '<span class="badge grey">O\'chirilgan</span>' : p.active ? '<span class="badge ok">Faol</span>' : '<span class="badge bad">Faol emas</span>'}</td>
    <td style="white-space:nowrap">${p.deleted ? (admin ? `<button class="btn sec sm" data-restore="${p.id}">Tiklash</button>` : '')
      : `${canEdit(p) ? `<button class="btn sec sm" data-ed="${p.id}">Tahrirlash</button>` : ''}
         ${admin && p.id !== S.ownerId ? ` <button class="btn sec sm" data-pw="${p.id}" title="Parolni tiklash">🔑 Parol</button>` : ''}
         ${admin && p.id !== S.ownerId && p.id !== S.me.id ? ` <button class="btn sec sm" data-del="${p.id}" title="O'chirish">🗑</button>` : ''}`}</td></tr>`;
  const head = `<tr><th>F.I.O.</th><th>Login (telefon)</th><th>Rol</th><th>${onlyUsta ? 'Mutaxassisligi' : 'Filial / mutaxassislik'}</th>${seesFoiz ? '<th class="r">Usta %</th>' : ''}<th>Holat</th><th></th></tr>`;
  page.innerHTML = `<h2>${onlyUsta ? 'Ustalar' : 'Xodimlar'}</h2>
    <div class="toolbar">${!onlyUsta && S.branches.length > 1 ? `<select class="inp" id="fBr" style="flex:0 1 220px"><option value="">Barcha filiallar</option>${S.branches.map(b => `<option value="${b.id}" ${fb === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>` : ''}
      ${admin || can('add_usta') ? `<button class="btn pri" id="addSt">+ ${onlyUsta ? 'Usta' : 'Xodim'} qo'shish</button>` : ''}</div>
    ${fb ? `<p class="hint">Faqat shu filialga biriktirilgan xodimlar (ustalar va o'lchovchilar filialga bog'lanmagan).</p>` : ''}
    <div class="tbl-wrap"><table class="tbl"><thead>${head}</thead><tbody>${list.map(row).join('') || '<tr><td colspan="7" class="empty">Hozircha yo\'q</td></tr>'}</tbody></table></div>
    ${removed.length ? `<details class="grp" style="margin-top:14px"><summary>O'chirilganlar — ${removed.length} ta</summary><div style="padding:0 10px 10px"><div class="tbl-wrap"><table class="tbl"><thead>${head}</thead><tbody>${removed.map(row).join('')}</tbody></table></div></div></details>` : ''}`;
  const fbs = page.querySelector('#fBr'); if (fbs) fbs.onchange = () => { S.filter.branch = fbs.value; renderStaff(page, ctx); };
  page.querySelector('#addSt') && (page.querySelector('#addSt').onclick = () => staffForm(ctx, null));
  page.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => staffForm(ctx, S.staff.find(p => p.id === b.dataset.ed)));
  page.querySelectorAll('[data-pw]').forEach(b => b.onclick = () => resetPassword(ctx, S.staff.find(p => p.id === b.dataset.pw)));
  page.querySelectorAll('[data-del]').forEach(b => b.onclick = () => removeStaff(ctx, S.staff.find(p => p.id === b.dataset.del)));
  page.querySelectorAll('[data-restore]').forEach(b => b.onclick = async () => {
    const p = S.staff.find(x => x.id === b.dataset.restore);
    if (!await confirmBox(`${esc(p.fullName)} qayta tiklansinmi? U yana tizimga kira oladi.`, 'Tiklash')) return;
    try { await updateDoc(doc(ctx.db, 'profiles', p.id), { deleted: false, active: true }); await ctx.loadStatic(); renderStaff(page, ctx); toast('Tiklandi'); } catch (e) { toast(errText(e), true); }
  });
}

function staffForm(ctx, p) {
  const { S, db, can, isOwner } = ctx;
  const admin = S.me.role === 'admin';
  const isNew = !p;
  const roles = Object.entries(S.roles).filter(([id, r]) => !r.deleted && (admin || (r.perms.work && id !== 'admin')));
  const isOwnerRow = p && p.id === S.ownerId;
  const seesFoiz = isOwner() || can('see_usta_foiz');
  const foizWrite = isOwner() || (can('see_usta_foiz') && can('add_usta'));
  const isWork = r => !!S.roles[r]?.perms?.work && r !== 'admin';
  // Hudud: usta va o'lchovchi uchun (qayerda yashashi) — "Yorqinjon (Qo'qon)" ko'rinishida chiqadi
  const hasHudud = r => isWork(r) || (!!S.roles[r]?.perms?.olchov && r !== 'admin');
  const m = modal(`<h2>${isNew ? 'Yangi xodim' : esc(p.fullName)}</h2><form id="sf" autocomplete="off">
    <div class="field"><label>F.I.O. *</label><input class="inp" name="fullName" required maxlength="80" value="${esc(p?.fullName || '')}"></div>
    ${isNew ? `<div class="field"><label>Telefon raqami (login) *</label>${phoneField('phone', '', 'required')}</div>
      <div class="field"><label>Parol * (kamida 8 belgi)</label><input class="inp" name="pw" type="text" required minlength="8" autocomplete="new-password"></div>`
      : `<p class="muted">Login: ${esc(fmtPhone(p.login))}</p>`}
    <div class="field"><label>Rol</label><select class="inp" name="role" ${isOwnerRow ? 'disabled' : ''}>${roles.map(([id, r]) => `<option value="${id}" ${p?.role === id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
    <div class="field" data-for="branch"><label>Filial</label><select class="inp" name="branchId"><option value="">—</option>${S.branches.map((b, i) => `<option value="${b.id}" ${p ? (p.branchId === b.id ? 'selected' : '') : (i === 0 ? 'selected' : '')}>${esc(b.name)}</option>`).join('')}</select><div class="hint">O'z filiali murojaatlari bilan ishlaydigan xodimlar uchun.</div></div>
    <div data-for="hudud"><h3 style="margin:6px 0 8px">Yashash hududi</h3>${ctx.hududHtml({ viloyat: p?.viloyat || '', tuman: p?.tuman || '' })}
      <p class="hint" style="margin-top:-6px">Ismi hamma joyda hududi bilan chiqadi, masalan: "Yorqinjon (Qo'qon)".</p></div>
    <div data-for="usta">
      ${seesFoiz ? `<div class="field"><label>Xizmat narxi, % (xom ashyo summasiga) *</label><input class="inp" name="ustaFoiz" inputmode="decimal" ${foizWrite ? '' : 'disabled'} value="${esc(p && S.ustaFoiz[p.id] != null ? +(S.ustaFoiz[p.id] * 100).toFixed(2) : '')}"><div class="hint">Bu foizni faqat tizim egasi va ruxsati bor xodimlar ko'radi.</div></div>` : ''}
      <div class="row2"><div class="field"><label>Mutaxassisligi</label><input class="inp" name="mutaxassislik" maxlength="80" placeholder="Korpus mebel, spalniy…" value="${esc(p?.mutaxassislik || '')}"></div>
      <div class="field"><label>Ustaxona / manzil</label><input class="inp" name="ustaxona" maxlength="120" value="${esc(p?.ustaxona || '')}"></div></div>
      <div class="field"><label>Shartnoma sanasi</label><input class="inp" type="date" name="shartnomaSana" value="${esc(p?.shartnomaSana || '')}"></div>
    </div>
    <div class="field"><label>Izoh</label><input class="inp" name="izoh" maxlength="200" value="${esc(p?.izoh || '')}"></div>
    ${!isNew && !isOwnerRow && p.id !== S.me.id ? `<label class="showpw"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Faol (o'chirilsa, tizimga kira olmaydi)</label>` : ''}
    ${isOwner() && !isOwnerRow ? `<label class="showpw" data-for="admin"><input type="checkbox" name="canManageRoles" ${p?.canManageRoles ? 'checked' : ''}> Rollar va ruxsatlarni boshqarishi mumkin</label>` : ''}
    <div class="err hidden" id="sfErr"></div>
    <button class="btn pri block">Saqlash</button>
  </form>`);
  const form = m.el.querySelector('#sf');
  const toggle = () => {
    const r = isOwnerRow ? 'admin' : form.role.value;
    form.querySelectorAll('[data-for]').forEach(el => {
      const f = el.dataset.for;
      el.classList.toggle('hidden', f === 'usta' ? !isWork(r) : f === 'hudud' ? !hasHudud(r) : f === 'admin' ? r !== 'admin' : f === 'branch' ? r === 'admin' || isWork(r) : false);
    });
  };
  form.role.onchange = toggle; toggle();
  ctx.bindHudud(form);
  form.onsubmit = async e => {
    e.preventDefault();
    const err = form.querySelector('#sfErr'); err.classList.add('hidden');
    const btn = form.querySelector('button.pri'); btn.disabled = true;
    try {
      const fd = new FormData(form);
      const r = isOwnerRow ? 'admin' : fd.get('role');
      const data = { fullName: String(fd.get('fullName')).trim(), role: r, branchId: r === 'admin' || isWork(r) ? '' : (fd.get('branchId') || ''), izoh: String(fd.get('izoh') || '').trim() };
      if (hasHudud(r)) {
        Object.assign(data, { viloyat: String(fd.get('viloyat') || '').trim(), tuman: String(fd.get('tuman') || '').trim() });
        if (!data.viloyat && !data.tuman) throw new Error('Yashash hududini (viloyat yoki tuman) kiriting');
      }
      if (isWork(r)) Object.assign(data, { mutaxassislik: String(fd.get('mutaxassislik') || '').trim(), ustaxona: String(fd.get('ustaxona') || '').trim(), shartnomaSana: fd.get('shartnomaSana') || '' });
      if (S.roles[r]?.perms?.ord_branch && !S.roles[r]?.perms?.ord_all && !data.branchId) throw new Error('Filialni tanlang');
      const foizRaw = fd.get('ustaFoiz');
      if (isWork(r) && foizWrite && (foizRaw === null || String(foizRaw).trim() === '')) throw new Error('Xizmat narxi foizini kiriting');
      if (form.canManageRoles) data.canManageRoles = r === 'admin' && form.canManageRoles.checked;
      let uid;
      if (isNew) {
        const phone = normPhone(fd.get('phone'));
        if (phone.length !== 12) throw new Error("Telefon raqamini to'liq kiriting");
        if (S.staff.some(x => x.login === phone && !x.replacedBy && !x.deleted)) throw new Error('Bu telefon raqami bilan xodim bor');
        uid = await ctx.createStaffAccount(ctx, phone, String(fd.get('pw')), 1);
        await setDoc(doc(db, 'profiles', uid), { ...data, login: phone, phone, active: true, alias: 1, createdAt: serverTimestamp() });
        toast(`Qo'shildi. Login: ${fmtPhone(phone)}`);
      } else {
        uid = p.id;
        if (form.active) data.active = form.active.checked;
        await updateDoc(doc(db, 'profiles', p.id), data);
        toast('Saqlandi');
      }
      if (isWork(r) && foizWrite && foizRaw !== null) await setDoc(doc(db, 'ustaFoiz', uid), { foiz: parseNum(foizRaw) / 100 });
      await ctx.loadStatic();
      m.close(); renderStaff(document.querySelector('#page'), ctx);
    } catch (er) { err.textContent = errText(er); err.classList.remove('hidden'); btn.disabled = false; }
  };
}

// Ochiq ishlarni boshqa xodimga o'tkazish (o'chirish va parol tiklashda)
async function openWork(ctx, p) {
  const out = [];
  for (const f of ['sellerId', 'olchovchiId', 'ustaId']) {
    const s = await getDocs(query(collection(ctx.db, 'orders'), where(f, '==', p.id)));
    s.docs.forEach(d => { if (OPEN_STAGES.includes(d.data().stage)) out.push({ ref: d.ref, f, no: d.data().no }); });
  }
  return out;
}

async function removeStaff(ctx, p) {
  const { S, db } = ctx;
  let work = [];
  try { work = await openWork(ctx, p); } catch (e) { /* ruxsat yo'q */ }
  const same = S.staff.filter(x => x.id !== p.id && x.role === p.role && x.active && !x.deleted && !x.replacedBy);
  const m = modal(`<h2>Xodimni o'chirish</h2><p><b>${esc(p.fullName)}</b> (${esc(ctx.roleName(p.role))}) tizimga kira olmaydi. Eski buyurtmalardagi ismi saqlanib qoladi.</p>
    ${work.length ? `<div class="note bad">Uning <b>${work.length} ta ochiq ishi</b> bor (№ ${work.map(w => w.no).join(', ')}). Ularni boshqa xodimga o'tkazing:</div>
      <select class="inp" id="toSt"><option value="">— xodim tanlang —</option>${same.map(x => `<option value="${x.id}">${esc(x.fullName)}</option>`).join('')}</select>` : ''}
    <div class="err hidden" id="rmErr"></div>
    <button class="btn red block" id="rmBtn" style="margin-top:14px">O'chirish</button>`);
  m.el.querySelector('#rmBtn').onclick = async () => {
    const err = m.el.querySelector('#rmErr');
    try {
      const b = writeBatch(db);
      if (work.length) {
        const to = S.staff.find(x => x.id === m.el.querySelector('#toSt').value);
        if (!to) throw new Error("Ochiq ishlarni o'tkazish uchun xodim tanlang");
        const nameF = { sellerId: 'sellerName', olchovchiId: 'olchovchiName', ustaId: 'ustaName' };
        work.forEach(w => b.update(w.ref, { [w.f]: to.id, [nameF[w.f]]: to.fullName }));
      }
      b.update(doc(db, 'profiles', p.id), { deleted: true, active: false });
      await b.commit();
      await ctx.loadStatic();
      toast("O'chirildi");
      m.close(); renderStaff(document.querySelector('#page'), ctx);
    } catch (e) { err.textContent = errText(e); err.classList.remove('hidden'); }
  };
}

// Firebase'da boshqa odamning parolini o'zgartirib bo'lmaydi, shuning uchun yangi ichki login
// (+v2, +v3 …) yaratiladi, eski login bloklanadi va ochiq buyurtmalar yangi loginga o'tkaziladi.
async function resetPassword(ctx, p) {
  const { S, db } = ctx;
  const m = modal(`<h2>Parolni tiklash</h2><p class="muted">${esc(p.fullName)} · ${esc(fmtPhone(p.login))}</p>
    <div class="field"><label>Yangi parol (kamida 8 belgi)</label><input class="inp" id="rpw" type="text" minlength="8" autocomplete="new-password"></div>
    <p class="hint">Login (telefon raqami) o'zgarmaydi. Eski parol darhol ishlamay qoladi.</p>
    <div class="err hidden" id="rpErr"></div><button class="btn pri block" id="rpBtn">Tiklash</button>`);
  m.el.querySelector('#rpBtn').onclick = async () => {
    const pw = m.el.querySelector('#rpw').value;
    const err = m.el.querySelector('#rpErr');
    if (pw.length < 8) { err.textContent = 'Kamida 8 belgi'; err.classList.remove('hidden'); return; }
    m.el.querySelector('#rpBtn').disabled = true;
    try {
      const k = (p.alias || 1) + 1;
      const uid = await ctx.createStaffAccount(ctx, p.login, pw, k);
      const { id, ...rest } = p;
      const b = writeBatch(db);
      b.set(doc(db, 'profiles', uid), { ...rest, alias: k, active: true, deleted: false, createdAt: serverTimestamp() });
      b.update(doc(db, 'profiles', p.id), { active: false, replacedBy: uid });
      if (S.ustaFoiz[p.id] != null) b.set(doc(db, 'ustaFoiz', uid), { foiz: S.ustaFoiz[p.id] });
      for (const f of ['sellerId', 'olchovchiId', 'ustaId']) {
        const s = await getDocs(query(collection(db, 'orders'), where(f, '==', p.id)));
        s.docs.forEach(d => b.update(d.ref, { [f]: uid }));
      }
      await b.commit();
      await ctx.loadStatic();
      toast(`Yangi parol o'rnatildi. Login o'zgarmadi: ${fmtPhone(p.login)}`);
      m.close(); renderStaff(document.querySelector('#page'), ctx);
    } catch (e) { err.textContent = errText(e); err.classList.remove('hidden'); m.el.querySelector('#rpBtn').disabled = false; }
  };
}

export function renderBranches(page, ctx) {
  const { S, db } = ctx;
  page.innerHTML = `<h2>Filiallar</h2><div class="toolbar"><button class="btn pri" id="addBr">+ Filial qo'shish</button></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nomi</th><th>Hudud</th><th>Manzil</th><th>Telefon</th><th>Xodimlar</th><th>Holat</th><th></th></tr></thead><tbody>
    ${S.branches.map(b => `<tr><td><b>${esc(b.name)}</b></td><td>${esc([b.viloyat, b.tuman].filter(Boolean).join(', '))}</td><td>${esc(b.address || '')}</td><td>${esc(b.phone || '')}</td>
      <td>${S.staff.filter(p => p.branchId === b.id && p.active && !p.deleted).length}</td>
      <td>${b.active !== false ? '<span class="badge ok">Faol</span>' : '<span class="badge grey">Yopiq</span>'}</td>
      <td><button class="btn sec sm" data-ed="${b.id}">Tahrirlash</button></td></tr>`).join('')}
    </tbody></table></div>`;
  const form = b => {
    const m = modal(`<h2>${b ? 'Filialni tahrirlash' : 'Yangi filial'}</h2><form id="bf">
      <div class="field"><label>Nomi *</label><input class="inp" name="name" required maxlength="60" value="${esc(b?.name || '')}"></div>
      ${ctx.hududHtml({ viloyat: b?.viloyat || '', tuman: b?.tuman || '' })}
      <p class="hint" style="margin-top:-6px">Shu filial sotuvchisi yangi murojaat ochganda viloyat va tuman avtomatik qo'yiladi.</p>
      <div class="field"><label>Manzil</label><input class="inp" name="address" maxlength="200" value="${esc(b?.address || '')}"></div>
      <div class="field"><label>Telefon</label><input class="inp" name="phone" maxlength="40" value="${esc(b?.phone || '')}"></div>
      ${b ? `<label class="showpw"><input type="checkbox" name="active" ${b.active !== false ? 'checked' : ''}> Faol</label>` : ''}
      <button class="btn pri block">Saqlash</button></form>`);
    const f = m.el.querySelector('#bf');
    ctx.bindHudud(f);
    f.onsubmit = async e => {
      e.preventDefault();
      const d = { name: f.name.value.trim(), viloyat: f.viloyat.value.trim(), tuman: f.tuman.value.trim(), address: f.address.value.trim(), phone: f.phone.value.trim(), active: b ? f.active.checked : true };
      try {
        if (b) await updateDoc(doc(db, 'branches', b.id), d);
        else await setDoc(doc(collection(db, 'branches')), { ...d, createdAt: serverTimestamp() });
        await ctx.loadStatic(); m.close(); renderBranches(page, ctx); toast('Saqlandi');
      } catch (er) { toast(errText(er), true); }
    };
  };
  page.querySelector('#addBr').onclick = () => form(null);
  page.querySelectorAll('[data-ed]').forEach(x => x.onclick = () => form(S.branches.find(b => b.id === x.dataset.ed)));
}
