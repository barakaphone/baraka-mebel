// Xodimlar va filiallar
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signOut, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, collection, setDoc, updateDoc, getDocs, query, where, writeBatch, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { esc, pct, normPhone, fmtPhone, parseNum, toast, errText, modal } from './util.js';
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

export function renderStaff(page, ctx) {
  const { S, ROLES } = ctx;
  const rahbar = S.me.role === 'rahbar';
  const list = S.staff.filter(p => !rahbar || p.role === 'usta').filter(p => !p.replacedBy);
  const bn = id => S.branches.find(b => b.id === id)?.name || '';
  page.innerHTML = `<h2>${rahbar ? 'Ustalar' : 'Xodimlar'}</h2>
    <div class="toolbar"><button class="btn pri" id="addSt">+ ${rahbar ? 'Usta' : 'Xodim'} qo'shish</button></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>F.I.O.</th><th>Login (telefon)</th><th>Rol</th><th>${rahbar ? 'Mutaxassisligi' : 'Filial'}</th><th class="r">Usta %</th><th>Holat</th><th></th></tr></thead><tbody>
      ${list.map(p => `<tr><td><b>${esc(p.fullName)}</b>${p.id === S.ownerId ? ' <span class="badge gold">Tizim egasi</span>' : ''}</td><td>${esc(fmtPhone(p.login))}</td><td>${esc(ROLES[p.role] || p.role)}</td>
        <td>${esc(rahbar ? (p.mutaxassislik || '') : p.role === 'sotuvchi' ? bn(p.branchId) : '—')}</td><td class="r">${p.role === 'usta' ? pct(p.ustaFoiz || 0) : ''}</td>
        <td>${p.active ? '<span class="badge ok">Faol</span>' : '<span class="badge bad">Faol emas</span>'}</td>
        <td><button class="btn sec sm" data-ed="${p.id}">Tahrirlash</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Hozircha yo\'q</td></tr>'}
    </tbody></table></div>`;
  page.querySelector('#addSt').onclick = () => staffForm(ctx, null);
  page.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => staffForm(ctx, S.staff.find(p => p.id === b.dataset.ed)));
}

function staffForm(ctx, p) {
  const { S, ROLES, db } = ctx;
  const rahbar = S.me.role === 'rahbar';
  const isNew = !p;
  const roles = rahbar ? ['usta'] : Object.keys(ROLES);
  const isOwnerRow = p && p.id === S.ownerId;
  const m = modal(`<h2>${isNew ? 'Yangi xodim' : esc(p.fullName)}</h2><form id="sf" autocomplete="off">
    <div class="field"><label>F.I.O. *</label><input class="inp" name="fullName" required maxlength="80" value="${esc(p?.fullName || '')}"></div>
    ${isNew ? `<div class="field"><label>Telefon raqami (login) *</label><input class="inp" name="phone" inputmode="tel" required placeholder="90 123 45 67"></div>
      <div class="field"><label>Parol * (kamida 8 belgi)</label><input class="inp" name="pw" type="text" required minlength="8" autocomplete="new-password"></div>`
      : `<p class="muted">Login: ${esc(fmtPhone(p.login))}</p>`}
    <div class="field"><label>Rol</label><select class="inp" name="role" ${isOwnerRow ? 'disabled' : ''}>${roles.map(r => `<option value="${r}" ${p?.role === r ? 'selected' : ''}>${esc(ROLES[r])}</option>`).join('')}</select></div>
    <div class="field" data-for="sotuvchi"><label>Filial</label><select class="inp" name="branchId">${S.branches.map(b => `<option value="${b.id}" ${p?.branchId === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
    <div data-for="usta">
      <div class="row2"><div class="field"><label>Kelishuv foizi, % (xom ashyo summasiga)</label><input class="inp" name="ustaFoiz" inputmode="decimal" value="${esc(p?.ustaFoiz != null ? +(p.ustaFoiz * 100).toFixed(2) : '')}"></div>
      <div class="field"><label>Mutaxassisligi</label><input class="inp" name="mutaxassislik" maxlength="80" placeholder="Korpus mebel, spalniy…" value="${esc(p?.mutaxassislik || '')}"></div></div>
      <div class="row2"><div class="field"><label>Ustaxona / manzil</label><input class="inp" name="ustaxona" maxlength="120" value="${esc(p?.ustaxona || '')}"></div>
      <div class="field"><label>Shartnoma sanasi</label><input class="inp" type="date" name="shartnomaSana" value="${esc(p?.shartnomaSana || '')}"></div></div>
    </div>
    <div class="field"><label>Izoh</label><input class="inp" name="izoh" maxlength="200" value="${esc(p?.izoh || '')}"></div>
    ${!isNew && !isOwnerRow && p.id !== S.me.id ? `<label class="showpw"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Faol (o'chirilsa, tizimga kira olmaydi)</label>` : ''}
    <div class="err hidden" id="sfErr"></div>
    <button class="btn pri block">Saqlash</button>
    ${!isNew && !rahbar && !isOwnerRow ? `<button type="button" class="btn sec block" id="resetPw" style="margin-top:10px">Parolni tiklash</button>` : ''}
  </form>`);
  const form = m.el.querySelector('#sf');
  const toggle = () => {
    const r = form.role.value;
    form.querySelectorAll('[data-for]').forEach(el => el.classList.toggle('hidden', el.dataset.for !== r));
  };
  form.role.onchange = toggle; toggle();
  form.onsubmit = async e => {
    e.preventDefault();
    const err = form.querySelector('#sfErr'); err.classList.add('hidden');
    const btn = form.querySelector('button.pri'); btn.disabled = true;
    try {
      const fd = new FormData(form);
      const r = isOwnerRow ? 'admin' : fd.get('role');
      const data = {
        fullName: String(fd.get('fullName')).trim(), role: r,
        branchId: r === 'sotuvchi' ? fd.get('branchId') : '',
        izoh: String(fd.get('izoh') || '').trim(),
      };
      if (r === 'usta') Object.assign(data, {
        ustaFoiz: parseNum(fd.get('ustaFoiz')) / 100, mutaxassislik: String(fd.get('mutaxassislik') || '').trim(),
        ustaxona: String(fd.get('ustaxona') || '').trim(), shartnomaSana: fd.get('shartnomaSana') || '',
      });
      if (r === 'sotuvchi' && !data.branchId) throw new Error('Filialni tanlang');
      if (isNew) {
        const phone = normPhone(fd.get('phone'));
        if (phone.length < 9) throw new Error("Telefon raqamini to'liq kiriting");
        if (S.staff.some(x => x.login === phone && !x.replacedBy)) throw new Error('Bu telefon raqami bilan xodim bor');
        const uid = await ctx.createStaffAccount(ctx, phone, String(fd.get('pw')), 1);
        await setDoc(doc(db, 'profiles', uid), { ...data, login: phone, phone, active: true, alias: 1, createdAt: serverTimestamp() });
        toast(`Qo'shildi. Login: ${fmtPhone(phone)}`);
      } else {
        if (form.active) data.active = form.active.checked;
        await updateDoc(doc(db, 'profiles', p.id), data);
        toast('Saqlandi');
      }
      await ctx.loadStatic();
      m.close(); renderStaff(document.querySelector('#page'), ctx);
    } catch (er) { err.textContent = errText(er); err.classList.remove('hidden'); btn.disabled = false; }
  };
  const rp = form.querySelector('#resetPw');
  if (rp) rp.onclick = () => resetPassword(ctx, p, m);
}

// Firebase'da boshqa odamning parolini o'zgartirib bo'lmaydi, shuning uchun yangi ichki login
// (+v2, +v3 …) yaratiladi, eski login bloklanadi va ochiq buyurtmalar yangi loginga o'tkaziladi.
async function resetPassword(ctx, p, parent) {
  const { S, db } = ctx;
  const m = modal(`<h2>Parolni tiklash</h2><p class="muted">${esc(p.fullName)} · ${esc(fmtPhone(p.login))}</p>
    <div class="field"><label>Yangi parol (kamida 8 belgi)</label><input class="inp" id="rpw" type="text" minlength="8" autocomplete="new-password"></div>
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
      b.set(doc(db, 'profiles', uid), { ...rest, alias: k, active: true, createdAt: serverTimestamp() });
      b.update(doc(db, 'profiles', p.id), { active: false, replacedBy: uid });
      const moves = [['sellerId', {}], ['olchovchiId', {}], ['ustaId', {}]];
      for (const [f] of moves) {
        const s = await getDocs(query(collection(db, 'orders'), where(f, '==', p.id)));
        s.docs.forEach(d => { if (!['yakunlandi', 'bekor'].includes(d.data().stage) || f !== 'sellerId') b.update(d.ref, { [f]: uid }); });
      }
      await b.commit();
      await ctx.loadStatic();
      toast(`Yangi parol o'rnatildi. Login o'zgarmadi: ${fmtPhone(p.login)}`);
      m.close(); parent.close(); renderStaff(document.querySelector('#page'), ctx);
    } catch (e) { err.textContent = errText(e); err.classList.remove('hidden'); m.el.querySelector('#rpBtn').disabled = false; }
  };
}

export function renderBranches(page, ctx) {
  const { S, db } = ctx;
  page.innerHTML = `<h2>Filiallar</h2><div class="toolbar"><button class="btn pri" id="addBr">+ Filial qo'shish</button></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nomi</th><th>Manzil</th><th>Telefon</th><th>Sotuvchilar</th><th>Holat</th><th></th></tr></thead><tbody>
    ${S.branches.map(b => `<tr><td><b>${esc(b.name)}</b></td><td>${esc(b.address || '')}</td><td>${esc(b.phone || '')}</td>
      <td>${S.staff.filter(p => p.role === 'sotuvchi' && p.branchId === b.id && p.active).length}</td>
      <td>${b.active !== false ? '<span class="badge ok">Faol</span>' : '<span class="badge grey">Yopiq</span>'}</td>
      <td><button class="btn sec sm" data-ed="${b.id}">Tahrirlash</button></td></tr>`).join('')}
    </tbody></table></div>`;
  const form = b => {
    const m = modal(`<h2>${b ? 'Filialni tahrirlash' : 'Yangi filial'}</h2><form id="bf">
      <div class="field"><label>Nomi *</label><input class="inp" name="name" required maxlength="60" value="${esc(b?.name || '')}"></div>
      <div class="field"><label>Manzil</label><input class="inp" name="address" maxlength="200" value="${esc(b?.address || '')}"></div>
      <div class="field"><label>Telefon</label><input class="inp" name="phone" maxlength="40" value="${esc(b?.phone || '')}"></div>
      ${b ? `<label class="showpw"><input type="checkbox" name="active" ${b.active !== false ? 'checked' : ''}> Faol</label>` : ''}
      <button class="btn pri block">Saqlash</button></form>`);
    const f = m.el.querySelector('#bf');
    f.onsubmit = async e => {
      e.preventDefault();
      const d = { name: f.name.value.trim(), address: f.address.value.trim(), phone: f.phone.value.trim(), active: b ? f.active.checked : true };
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
