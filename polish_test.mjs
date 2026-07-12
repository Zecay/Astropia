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
const pageErrors = [], consoleErrors = [];
page.on('pageerror', e => pageErrors.push(String(e.stack || e.message || e)));
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await page.goto(url, { waitUntil: 'load', timeout: 20000 });
await page.waitForTimeout(2000);

const boot = await page.evaluate(() => {
  const c = document.getElementById('game');
  return { hasCanvas: !!c, w: c ? c.width : 0, delegate: typeof window.renderGrowtopiaInventory === 'function' };
});

let joinError = null;
try { await page.fill('#usernameInput', 'Tester'); await page.click('#startButton', { timeout: 5000 }); await page.waitForTimeout(600); }
catch (e) { joinError = String(e.message || e); }

const afterJoin = await page.evaluate(() => {
  const w = document.getElementById('inventoryWindow');
  const h = document.getElementById('inventoryHeader');
  const grid = document.getElementById('inventoryGrid');
  const quick = document.getElementById('invQuickRow');
  return {
    invDisplay: w ? getComputedStyle(w).display : 'MISSING',
    draggerClass: h ? h.className : '',
    handInHotbar: quick ? [...quick.querySelectorAll('.inv-quick-slot')].some(s => s.textContent.includes('✊')) : false,
    quickSlots: quick ? quick.querySelectorAll('.inv-quick-slot').length : -1,
    collapsedInit: w ? w.classList.contains('collapsed') : null
  };
});

// Dev give
let devError = null, gridAfterGive = -1, handStill = false;
try {
  await page.keyboard.down('Control'); await page.keyboard.down('Shift');
  await page.keyboard.press('KeyD');
  await page.keyboard.up('Shift'); await page.keyboard.up('Control');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const sel = document.querySelector('#devItemSelect');
    const opt = [...sel.options].find(o => o.value && o.value !== 'hand') || sel.options[0];
    sel.value = opt.value;
  });
  await page.click('#devGiveBtn', { timeout: 5000 });
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const slots = [...document.querySelectorAll('#inventoryGrid .inv-slot')];
    return { count: slots.length, hasHand: [...document.querySelectorAll('#invQuickRow .inv-quick-slot')].some(s => s.textContent.includes('✊')) };
  });
  gridAfterGive = r.count; handStill = r.hasHand;
} catch (e) { devError = String(e.message || e); }

// Drag the dragger: should MOVE the window, never close it.
let dragError = null, dragResult = { display: 'n/a', moved: false };
try {
  const box = await page.locator('#inventoryHeader').boundingBox();
  const before = await page.evaluate(() => {
    const w = document.getElementById('inventoryWindow');
    const r = w.getBoundingClientRect();
    return { left: r.left, top: r.top };
  });
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 160, cy - 120, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  dragResult = await page.evaluate((b) => {
    const w = document.getElementById('inventoryWindow');
    const r = w.getBoundingClientRect();
    return { display: getComputedStyle(w).display, moved: Math.abs(r.left - b.left) + Math.abs(r.top - b.top) > 20 };
  }, before);
} catch (e) { dragError = String(e.message || e); }

// Click dragger toggles collapse (no movement => tap)
let tapError = null, collapsed = null;
try {
  await page.click('#inventoryHeader', { timeout: 5000 });
  await page.waitForTimeout(150);
  const c1 = await page.evaluate(() => document.getElementById('inventoryWindow').classList.contains('collapsed'));
  await page.click('#inventoryHeader', { timeout: 5000 });
  await page.waitForTimeout(150);
  const c2 = await page.evaluate(() => document.getElementById('inventoryWindow').classList.contains('collapsed'));
  collapsed = { afterFirstTap: c1, afterSecondTap: c2 };
} catch (e) { tapError = String(e.message || e); }

const chatHandle = await page.evaluate(() => {
  const chat = document.getElementById('chatUI');
  if (!chat || !chat.firstChild) return { ok: false };
  const h = chat.firstChild;
  return { ok: true, tag: h.tagName, pointerEvents: getComputedStyle(h).pointerEvents };
});

const benign = /Failed to fetch|net::ERR|WebSocket|ECONNREFUSED|timed out|404|getBattery|AudioContext|autoplay|sync/i;
const realErr = consoleErrors.filter(e => !benign.test(e));

console.log('=== POLISH REPORT 2 ===');
console.log(JSON.stringify({ boot, afterJoin, gridAfterGive, handStill, dragResult, collapsed, chatHandle, joinError, devError, dragError, tapError }, null, 2));
console.log('pageErrors:', pageErrors.length ? pageErrors : 'NONE');
console.log('realConsoleErrors:', realErr.length ? realErr : 'NONE');

const pass = boot.hasCanvas && boot.w > 0 && boot.delegate &&
  afterJoin.invDisplay === 'block' && afterJoin.handInHotbar && afterJoin.quickSlots === 4 &&
  afterJoin.collapsedInit === true &&
  joinError === null && devError === null && gridAfterGive >= 1 && handStill &&
  dragError === null && dragResult.display === 'block' && dragResult.moved &&
  tapError === null && collapsed && collapsed.afterFirstTap === false && collapsed.afterSecondTap === true &&
  chatHandle.ok && pageErrors.length === 0 && realErr.length === 0;
console.log(pass ? '\nRESULT: POLISH 2 OK ✅' : '\nRESULT: FAILED ❌');

await browser.close(); server.close();
process.exit(pass ? 0 : 1);
