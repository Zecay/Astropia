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
page.on('console', m => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });

await page.goto(url, { waitUntil: 'load', timeout: 20000 });
await page.waitForTimeout(1500);
await page.fill('#usernameInput', 'CaveBreak');
await page.click('#startButton', { timeout: 5000 });
await page.waitForTimeout(800);

// Break a Cave Background tile (id 9) directly through the live world API:
//  - foreground in front must be air (0) so the background is the target
//  - after enough hits it should break, drop a `cave_bg` item, and clear
//  - with a solid block in front it must NOT be damaged
const res = await page.evaluate(async () => {
  const world = await import('/js/world.js');
  const inv = await import('/js/inventory.js');
  const cfg = await import('/js/config.js');
  const W = world.worldState;
  inv.setSelectedSlot(0); // hand -> usableForBreaking: true

  const groundRow = cfg.GameConfig.world.groundRow;
  const tx = Math.floor(W.width / 2);
  const ty = groundRow + 3;

  // Scenario A: air in front -> background is breakable.
  W.tiles[ty][tx] = 0;
  const bgBefore = W.backgroundTiles[ty][tx];
  world.miningState.mineCooldownRemaining = 0;
  const r1 = world.damageBlock(tx, ty);
  world.miningState.mineCooldownRemaining = 0;
  const r2 = world.damageBlock(tx, ty);
  const bgAfter = W.backgroundTiles[ty][tx];
  const dropped = world.droppedItems.some(d => d.itemKey === 'cave_bg');

  // Scenario B: solid in front -> background must stay intact.
  const tx2 = tx + 1, ty2 = ty + 1;
  W.tiles[ty2][tx2] = 1; // solid dirt
  const bgBefore2 = W.backgroundTiles[ty2][tx2];
  world.miningState.mineCooldownRemaining = 0;
  world.damageBlock(tx2, ty2);
  const bgAfter2 = W.backgroundTiles[ty2][tx2];

  return { bgBefore, bgAfter, r1, r2, dropped, bgBefore2, bgAfter2 };
});

console.log('CAVE BREAK:', JSON.stringify(res));
console.log('pageErrors:', pageErrors.length ? pageErrors : 'NONE');

const ok =
  res.bgBefore === 9 &&
  res.bgAfter === 0 &&
  res.r1 === true &&
  res.r2 === true &&
  res.dropped === true &&
  res.bgBefore2 === 9 &&
  res.bgAfter2 === 9 &&
  pageErrors.length === 0;

console.log(ok ? 'RESULT: CAVE BREAK OK ✅' : 'RESULT: FAILED ❌');
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
