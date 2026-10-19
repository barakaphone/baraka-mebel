# Ilova belgilarini logotipdan yasaydi: python3 tools/icons.py
# Manba: img/logo-source.webp (shaffof fon). Logotip almashsa — faylni almashtirib, qayta ishga tushiring.
from PIL import Image

src = Image.open('img/logo-source.webp').convert('RGBA')
x0, y0, x1, y1 = src.getchannel('A').getbbox()
full = src.crop((x0, y0, x1, y1))
# Belgi qismi — matndan oldingi bo'sh ustungacha
a = full.getchannel('A')
w, h = full.size
cut = next(x for x in range(int(h * 0.6), w) if all(a.getpixel((x, y)) == 0 for y in range(h)))
mark = full.crop((0, 0, cut, h))
mark = mark.crop(mark.getchannel('A').getbbox())


def square(size, pad, bg):
    im = Image.new('RGBA', (size, size), bg)
    s = int(size * (1 - 2 * pad))
    k = s / max(mark.size)
    m = mark.resize((round(mark.width * k), round(mark.height * k)), Image.LANCZOS)
    im.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return im


W = (255, 255, 255, 255)
square(192, .12, W).save('img/icon-192.png', optimize=True)
square(512, .12, W).save('img/icon-512.png', optimize=True)
square(512, .22, W).save('img/icon-maskable-512.png', optimize=True)
square(180, .14, W).convert('RGB').save('img/apple-touch-icon.png', optimize=True)
square(96, .02, (0, 0, 0, 0)).save('img/favicon.png', optimize=True)
square(256, .04, (0, 0, 0, 0)).save('img/logo-mark.png', optimize=True)
P = 4
src.crop((x0 - P, y0 - P, x1 + P, y1 + P)).save('img/logo-full.png', optimize=True)
print('ok', cut)
