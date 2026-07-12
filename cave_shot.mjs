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
await page.fill('#usernameInput', 'CaveShot');
await page.click('#startButton', { timeout: 5000 });
await page.waitForTimeout(800);

// Inject a carved pit with a hole in the back wall so the cave aesthetics
// (rock grain + ambient-occlusion rim + depth gradient) are clearly visible.
const shot = await page.evaluate(async () => {
  const world = await import('/js/world.js');
  const player = await import('/js/player.js');
  const cam = await import('/js/camera.js');
  const cfg = await import('/js/config.js');
  const T = cfg.GameConfig.world.tileSize;

  const W = world.worldState;
  const cx = Math.floor(W.width / 2);
  const top = cfg.GameConfig.world.groundRow + 1;
  // Clear a wide pit (foreground only) so a broad cave-rock wall is visible.
  for (let y = top; y < top + 14; y++) {
    for (let x = cx - 8; x <= cx + 8; x++) {
      if (y >= 0 && y < W.height && x >= 0 && x < W.width) W.tiles[y][x] = 0;
    }
  }
  // Carve a 3x3 void in the background (back wall) to show the AO rim.
  for (let y = top + 6; y < top + 9; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (y >= 0 && y < W.height && x >= 0 && x < W.width) W.backgroundTiles[y][x] = 0;
    }
  }
  // Teleport the player into the pit so the (player-following) camera shows it.
  player.playerState.x = cx * T;
  player.playerState.y = (top + 6) * T;
  player.playerState.vx = 0;
  player.playerState.vy = 0;
  cam.cameraState.targetZoom = 2.4;
  cam.cameraState.zoom = 2.4;
  await new Promise(r => setTimeout(r, 600));
  // Confirm the carve hit the live world the renderer reads.
  const carved = W.tiles[top + 2][cx] === 0 && W.backgroundTiles[top + 6][cx] === 0;
  return { W: W.width, H: W.height, T, cx, top, carved,
           sampleTile: W.tiles[top + 2][cx], sampleBg: W.backgroundTiles[top + 6][cx] };
});

await page.waitForTimeout(600);
await page.screenshot({ path: '/home/user/Astropia/cave_shot.png' });

// Quantitative check: sample the canvas pixels to confirm the cave renders
// as varied rock (grain) with darker rim/edge pixels (ambient occlusion).
const stats = await page.evaluate(() => {
  const c = document.getElementById('game');
  const g = c.getContext('2d');
  const W = c.width, H = c.height;
  const d = g.getImageData(0, 0, W, H).data;
  let baseish = 0, dark = 0, total = 0;
  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    // base cave color is ~ (52,48,60)
    if (Math.abs(r - 52) < 14 && Math.abs(gg - 48) < 14 && Math.abs(b - 60) < 14) baseish++;
    if (r < 34 && gg < 32 && b < 42) dark++;        // clearly darker than base -> AO/rim
    if (r < rMin) rMin = r; if (r > rMax) rMax = r;
    if (gg < gMin) gMin = gg; if (gg > gMax) gMax = gg;
    if (b < bMin) bMin = b; if (b > bMax) bMax = b;
    total++;
  }
  return { W, H, total, baseish, dark, rRange: [rMin, rMax], gRange: [gMin, gMax], bRange: [bMin, bMax] };
});

console.log('CARVE:', JSON.stringify(shot));
console.log('PIXELS:', JSON.stringify(stats));
console.log('pageErrors:', pageErrors.length ? pageErrors : 'NONE');
await browser.close();
server.close();
console.log('DONE');
