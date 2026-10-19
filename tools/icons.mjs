// Ikonkalarni SVG dan PNG ga o'giradi: node tools/icons.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage();
const out = [['img/icon.svg', 'img/icon-192.png', 192], ['img/icon.svg', 'img/icon-512.png', 512],
  ['img/icon-maskable.svg', 'img/icon-maskable-512.png', 512], ['img/icon-maskable.svg', 'img/apple-touch-icon.png', 180]];
for (const [src, dst, n] of out) {
  await p.setViewportSize({ width: n, height: n });
  await p.setContent(`<html><body style="margin:0;background:transparent">${readFileSync(src, 'utf8').replace('<svg ', `<svg width="${n}" height="${n}" `)}</body></html>`);
  await p.screenshot({ path: dst, omitBackground: true, clip: { x: 0, y: 0, width: n, height: n } });
}
await b.close();
