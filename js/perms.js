// Rollar va ruxsatlar. Butun tizim rol nomiga emas, ruxsatlarga qarab ishlaydi.
// Xuddi shu standart ruxsatlar firestore.rules ichida ham bor (settings/roles hali yaratilmagan bo'lsa).

export const PERM_GROUPS = [
  { t: 'Murojaatlar', perms: [
    ['ord_branch', "O'z filiali murojaatlarini ko'rish"],
    ['ord_all', "Barcha filiallar buyurtmalarini ko'rish"],
    ['ord_create', 'Yangi murojaat ochish'],
    ['ord_edit', 'Murojaatni tahrirlash va rasmiylashtirish'],
    ['ord_cancel', 'Murojaatni bekor qilish'],
  ] },
  { t: 'Narx', perms: [
    ['calc', 'Narx hisoblash (kalkulyator)'],
    ['see_cost', "Tan narx va ustamani ko'rish"],
    ['discount', 'Chegirma berish'],
    ['pdf', 'Narx taklifi PDF'],
  ] },
  { t: 'Hujjatlar', perms: [
    ['pasport_view', "Pasportni ko'rish"],
    ['pasport_upload', 'Pasport yuklash'],
  ] },
  { t: 'Jarayon', perms: [
    ['skoring', 'Shartnoma qarori (shartnomachi ishi)'],
    ['olchov', "O'lchov kiritish (o'lchovchi ishi)"],
    ['assign_usta', 'Ustaga biriktirish'],
    ['work', 'Ish bosqichlari (usta ishi)'],
  ] },
  { t: 'Boshqaruv', perms: [
    ['xom_narx', 'Xom ashyo narxlari'],
    ['add_usta', "Usta qo'shish va tahrirlash"],
    ['see_usta_foiz', "Usta foizi va haqini ko'rish"],
    ['staff_view', "Xodimlar ro'yxatini ko'rish"],
    ['dash', 'Bosh sahifa'],
    ['report', 'Hisobot (tannarx, foyda)'],
    ['final_pdf', 'Yakuniy PDF (bajarilish hisoboti)'],
  ] },
];
export const ALL_PERMS = PERM_GROUPS.flatMap(g => g.perms.map(p => p[0]));
export const PERM_LABEL = Object.fromEntries(PERM_GROUPS.flatMap(g => g.perms));

const on = list => Object.fromEntries(list.map(k => [k, true]));
// Standart rollar. Admin — hammasi (faqat "Usta foizi" alohida yoqiladi, tizim egasida doim bor).
export const DEFAULT_ROLES = {
  admin: { name: 'Admin', builtin: true, perms: on(ALL_PERMS.filter(k => k !== 'see_usta_foiz')) },
  rahbar: { name: 'Mebel rahbari', builtin: true, perms: on(['ord_all', 'calc', 'see_cost', 'pdf', 'assign_usta', 'xom_narx', 'add_usta', 'see_usta_foiz', 'staff_view', 'final_pdf']) },
  sotuvchi: { name: 'Sotuvchi', builtin: true, perms: on(['ord_branch', 'ord_create', 'ord_edit', 'ord_cancel', 'calc', 'discount', 'pdf', 'pasport_view', 'pasport_upload']) },
  shartnomachi: { name: 'Shartnomachi', builtin: true, perms: on(['skoring', 'pasport_view']) },
  olchovchi: { name: "O'lchovchi", builtin: true, perms: on(['olchov']) },
  usta: { name: 'Usta', builtin: true, perms: on(['work']) },
};

// roles: settings/roles.roles (yoki undefined) — standartlar bilan birlashtiriladi
export function mergeRoles(roles) {
  const out = {};
  for (const [id, r] of Object.entries(DEFAULT_ROLES)) out[id] = { ...r, perms: { ...r.perms } };
  for (const [id, r] of Object.entries(roles || {})) {
    if (id === 'admin') { out.admin.perms.see_usta_foiz = !!r.perms?.see_usta_foiz; continue; }
    out[id] = { name: r.name || out[id]?.name || id, builtin: !!DEFAULT_ROLES[id], perms: { ...(r.perms || {}) }, deleted: !!r.deleted };
  }
  return out;
}

// p — xodim profili, roles — mergeRoles natijasi, ownerId — tizim egasi
export function can(p, roles, ownerId, k) {
  if (!p) return false;
  if (p.id === ownerId) return true;
  const r = roles[p.role];
  if (!r) return false;
  return !!r.perms[k];
}
