import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = '/home/user/Astropia';
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'
};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const url = `http://localhost:${port}/index.html`;

const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e.stack || e.message || e)));

await page.goto(url, { waitUntil: 'load', timeout: 20000 });
await page.waitForTimeout(1500);
await page.fill('#usernameInput', 'UI');
await page.click('#startButton', { timeout: 5000 });
await page.waitForTimeout(800);

// Give a couple of items so the (expanded) grid isn't empty for the shot.
await page.keyboard.down('Control'); await page.keyboard.down('Shift');
await page.keyboard.press('KeyD');
await page.keyboard.up('Shift'); await page.keyboard.up('Control');
await page.waitForTimeout(200);
await page.evaluate(() => {
  const sel = document.querySelector('#devItemSelect');
  const o = [...sel.options].find(x => x.value === 'dirt_block') || sel.options[0];
  sel.value = o.value;
});
await page.click('#devGiveBtn');
await page.waitForTimeout(300);

// 1) Default (collapsed) state — only dragger + 4 quick slots visible.
await page.screenshot({ path: '/home/user/Astropia/ui_collapsed.png' });

// 2) Expanded state (click the dragger to open).
await page.click('#inventoryHeader', { timeout: 5000 });
await page.waitForTimeout(300);
await page.screenshot({ path: '/home/user/Astropia/ui_expanded.png' });
// Reset back to collapsed for the drag-bounds check.
await page.click('#inventoryHeader', { timeout: 5000 });
await page.waitForTimeout(200);

// Bounded vertical-drag check: fling up and down using FRESH header coords
// each time; the window must stay within the clamped vertical range.
const dragCheck = await page.evaluate(async () => {
  const w = document.getElementById('inventoryWindow');
  const h = document.getElementById('inventoryHeader');
  const vh = window.innerHeight;
  const rect = () => w.getBoundingClientRect();
  const fire = (type, x, y) => h.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }));
  const fling = (dir) => {
    const hr = h.getBoundingClientRect();
    const hx = hr.x + hr.width / 2, hy = hr.y + hr.height / 2;
    fire('pointerdown', hx, hy);
    if (dir === 'up') { for (let y = hy; y > 0; y -= 40) fire('pointermove', hx, y); fire('pointerup', hx, 0); }
    else { for (let y = hy; y < vh; y += 40) fire('pointermove', hx, y); fire('pointerup', hx, vh); }
  };
  fling('up');   const upTop = Math.round(rect().top);
  fling('down'); const downBottom = Math.round(rect().bottom);
  return { upTop, downBottom, vh, minAllowed: Math.round(vh * 0.12), maxAllowed: vh };
});

console.log('DRAG BOUNDS:', JSON.stringify(dragCheck));
console.log('  upTop   >= minAllowed(86)?', dragCheck.upTop >= dragCheck.minAllowed - 1, `(got ${dragCheck.upTop})`);
console.log('  downBottom <= maxAllowed?', dragCheck.downBottom <= dragCheck.maxAllowed + 1, `(got ${dragCheck.downBottom})`);
console.log('pageErrors:', pageErrors.length ? pageErrors : 'NONE');
await browser.close();
server.close();
console.log('DONE');
