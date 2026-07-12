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
await page.waitForTimeout(500);
await page.fill('#usernameInput', 'RemixPlayer');
await page.click('#startButton');
await page.waitForTimeout(600);

// Give several items directly via inventoryState inside page context
await page.evaluate(async () => {
  const inv = await import('./js/inventory.js');
  inv.addInventoryItem('dirt_block', 91);
  inv.addInventoryItem('seed', 198);
  inv.addInventoryItem('rock_block', 37);
  inv.addInventoryItem('lava_block', 148);
  inv.addInventoryItem('grass_block', 44);
  inv.addInventoryItem('cave_bg', 85);
  inv.addInventoryItem('stone_seed', 150);
  inv.addInventoryItem('obsidian_seed', 21);
  if (window.renderGrowtopiaInventory) window.renderGrowtopiaInventory();
});
await page.waitForTimeout(300);

// Capture collapsed (showing tight bottom pill and Roblox chat in top left)
await page.screenshot({ path: '/home/user/Astropia/ui_collapsed.png' });

// Expand inventory
await page.click('#inventoryHeader');
await page.waitForTimeout(350);

// Capture expanded
await page.screenshot({ path: '/home/user/Astropia/ui_expanded.png' });

// Collapse again and break a solid block to reveal cave background, then punch cave background to show cracks
await page.click('#inventoryHeader');
await page.waitForTimeout(200);

// Punch a block and background to capture crack visuals
await page.evaluate(async () => {
  const world = await import('./js/world.js');
  const player = await import('./js/player.js');
  // Clear foreground tile right next to player so background is exposed
  const tx = Math.floor(player.playerState.x / 32) + 1;
  const ty = Math.floor(player.playerState.y / 32);
  world.setTile(tx, ty, 0); // Air in foreground
  world.setBackgroundTile(tx, ty, 9); // Cave background
  // Punch it twice to get stage 2 cracks
  world.damageBlock(tx, ty);
  world.damageBlock(tx, ty);
});
await page.waitForTimeout(200);
await page.screenshot({ path: '/home/user/Astropia/cave_cracks.png' });

await browser.close();
server.close();
console.log('Saved ui_collapsed.png, ui_expanded.png, and cave_cracks.png successfully!');
