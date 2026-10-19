// O'zbekiston hududlari: viloyat → tuman va shaharlar (ro'yxatda yo'q nomni qo'lda yozish ham mumkin)
export const HUDUDLAR = {
  "Farg'ona viloyati": ["Farg'ona sh.", "Qo'qon sh.", "Marg'ilon sh.", 'Quvasoy sh.', "Bag'dod", 'Beshariq', 'Buvayda', "Dang'ara", "Farg'ona tumani", 'Furqat', 'Oltiariq', "Qo'shtepa", 'Quva', 'Rishton', "So'x", 'Toshloq', "Uchko'prik", "O'zbekiston tumani", 'Yozyovon'],
  'Andijon viloyati': ['Andijon sh.', 'Xonobod sh.', 'Andijon tumani', 'Asaka', 'Baliqchi', "Bo'ston", 'Buloqboshi', 'Izboskan', 'Jalaquduq', "Xo'jaobod", "Qo'rg'ontepa", 'Marhamat', "Oltinko'l", 'Paxtaobod', 'Shahrixon', "Ulug'nor"],
  'Namangan viloyati': ['Namangan sh.', 'Chortoq', 'Chust', 'Kosonsoy', 'Mingbuloq', 'Namangan tumani', 'Norin', 'Pop', "To'raqo'rg'on", "Uchqo'rg'on", 'Uychi', "Yangiqo'rg'on"],
  'Toshkent shahri': ['Bektemir', 'Chilonzor', 'Mirobod', "Mirzo Ulug'bek", 'Olmazor', 'Sergeli', 'Shayxontohur', 'Uchtepa', 'Yakkasaroy', 'Yashnobod', 'Yangihayot', 'Yunusobod'],
  'Toshkent viloyati': ['Nurafshon sh.', 'Angren sh.', 'Bekobod sh.', 'Chirchiq sh.', 'Olmaliq sh.', 'Ohangaron sh.', "Yangiyo'l sh.", 'Bekobod tumani', "Bo'ka", "Bo'stonliq", 'Chinoz', 'Qibray', 'Ohangaron tumani', "Oqqo'rg'on", 'Parkent', 'Piskent', 'Quyichirchiq', "O'rtachirchiq", 'Yuqorichirchiq', 'Toshkent tumani', "Yangiyo'l tumani", 'Zangiota'],
  'Samarqand viloyati': ['Samarqand sh.', "Kattaqo'rg'on sh.", "Bulung'ur", 'Ishtixon', 'Jomboy', "Kattaqo'rg'on tumani", "Qo'shrabot", 'Narpay', 'Nurobod', 'Oqdaryo', 'Paxtachi', 'Payariq', "Pastdarg'om", 'Samarqand tumani', 'Toyloq', 'Urgut'],
  'Buxoro viloyati': ['Buxoro sh.', 'Kogon sh.', 'Buxoro tumani', "G'ijduvon", 'Jondor', 'Kogon tumani', 'Olot', 'Peshku', "Qorako'l", 'Qorovulbozor', 'Romitan', 'Shofirkon', 'Vobkent'],
  'Navoiy viloyati': ['Navoiy sh.', 'Zarafshon sh.', "G'ozg'on sh.", 'Karmana', 'Konimex', 'Navbahor', 'Nurota', 'Qiziltepa', 'Tomdi', 'Uchquduq', 'Xatirchi'],
  'Qashqadaryo viloyati': ['Qarshi sh.', 'Shahrisabz sh.', 'Chiroqchi', 'Dehqonobod', "G'uzor", 'Kasbi', 'Kitob', "Ko'kdala", 'Koson', 'Mirishkor', 'Muborak', 'Nishon', 'Qamashi', 'Qarshi tumani', 'Shahrisabz tumani', "Yakkabog'"],
  'Surxondaryo viloyati': ['Termiz sh.', 'Angor', 'Bandixon', 'Boysun', 'Denov', "Jarqo'rg'on", 'Qiziriq', "Qumqo'rg'on", 'Muzrabot', 'Oltinsoy', 'Sariosiyo', 'Sherobod', "Sho'rchi", 'Termiz tumani', 'Uzun'],
  'Jizzax viloyati': ['Jizzax sh.', 'Arnasoy', 'Baxmal', "Do'stlik", 'Forish', "G'allaorol", "Mirzacho'l", 'Paxtakor', 'Sharof Rashidov', 'Yangiobod', 'Zafarobod', 'Zarbdor', 'Zomin'],
  'Sirdaryo viloyati': ['Guliston sh.', 'Yangiyer sh.', 'Shirin sh.', 'Boyovut', 'Guliston tumani', 'Mirzaobod', 'Oqoltin', 'Sardoba', 'Sayxunobod', 'Sirdaryo tumani', 'Xovos'],
  'Xorazm viloyati': ['Urganch sh.', 'Xiva sh.', "Bog'ot", 'Gurlan', 'Hazorasp', 'Xonqa', 'Xiva tumani', "Qo'shko'pir", 'Shovot', "Tuproqqal'a", 'Urganch tumani', 'Yangiariq', 'Yangibozor'],
  "Qoraqalpog'iston Respublikasi": ['Nukus sh.', 'Taxiatosh sh.', 'Amudaryo', 'Beruniy', "Bo'zatov", 'Chimboy', "Ellikqal'a", 'Kegeyli', "Mo'ynoq", 'Nukus tumani', "Qanliko'l", "Qo'ng'irot", "Qorao'zak", 'Shumanay', "Taxtako'pir", "To'rtko'l", "Xo'jayli"],
};
export const VILOYATLAR = Object.keys(HUDUDLAR);

// "Farg'ona viloyati, Qo'qon sh., Navoiy ko'chasi 5"
export function fullAddress(c) {
  if (!c) return '';
  return [c.viloyat, c.tuman, c.address].map(x => (x || '').trim()).filter(Boolean).join(', ');
}
