import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

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

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(url, { waitUntil: 'load', timeout: 20000 });
await page.waitForTimeout(1000);
await page.fill('#usernameInput', 'Tester');
await page.click('#startButton');
await page.waitForTimeout(1000);

// Give some dev items so the inventory looks full and realistic
await page.keyboard.down('Control'); await page.keyboard.down('Shift');
await page.keyboard.press('KeyD');
await page.keyboard.up('Shift'); await page.keyboard.up('Control');
await page.waitForTimeout(300);
await page.click('#devGiveAllBtn').catch(() => {});
await page.waitForTimeout(300);

await page.screenshot({ path: '/home/user/Astropia/shot_collapsed.png' });

// Click dragger twice (first tap might toggle or second tap toggles, let's check polish_test logic: click twice or once)
await page.click('#inventoryHeader');
await page.waitForTimeout(300);
const isCollapsed = await page.evaluate(() => document.getElementById('inventoryWindow').classList.contains('collapsed'));
if (isCollapsed) {
  await page.click('#inventoryHeader');
  await page.waitForTimeout(300);
}

await page.screenshot({ path: '/home/user/Astropia/shot_expanded.png' });

await browser.close();
server.close();
console.log('Screenshots saved!');
