import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
await mkdir('.shots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (/Could not load .*model/.test(m.text()) || m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => localStorage.setItem('magic-chess.graphics-quality', 'low'));
  await page.goto('http://localhost:5173');
  await page.waitForFunction(() => globalThis.__gameStore);
  await page.evaluate(() => { const s = globalThis.__gameStore.getState(); s.startGame({ ...s.settings, mode: 'local' }); });
  await page.waitForFunction(() => (globalThis.__frames ?? 0) > 15, undefined, { timeout: 90000 });
  console.log('First load', await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource').filter(e => e.name.includes('/models/'));
    return { elapsedMs: Math.round(performance.now()), bytes: resources.reduce((s, e) => s + e.encodedBodySize, 0), requests: resources.length };
  }));
  console.log(await page.evaluate(async () => {
    const { loadPieceModels, validateGeometry } = await import('/src/scene/pieces/gltfPieces.ts');
    const provider = await loadPieceModels({ warn: (m, e) => { throw new Error(`${m}: ${e}`); } });
    const manifest = await (await fetch('/models/manifest.json')).json();
    const result = [];
    for (const type of ['p', 'n', 'b', 'r', 'q', 'k']) for (const color of ['w', 'b']) {
      const rig = provider.rig(type, color), entry = manifest.pieces[type].colors[color];
      // The V8 knight's rigid mount glides: it alone ships no walk clip or stride.
      if (!rig?.clips.hit || rig.attacks?.length !== 2 || (type !== 'n' && (!rig.clips.walk || !rig.walkCycle))) throw new Error(`Missing contract ${type}-${color}`);
      if (!validateGeometry(provider.geometry(type, color), entry)) throw new Error(`Bounds ${type}-${color}`);
      const parts = provider.parts(type, color);
      if (!parts?.length || parts.length > 40) throw new Error(`Debris ${type}-${color}`);
      let pedestal = false, tip = false;
      rig.scene.traverse(o => { if (o.name === 'piece-pedestal') pedestal = true; if (o.name === rig.weaponTip) tip = true; });
      if (!pedestal || !tip) { const names = []; rig.scene.traverse(o => { if (/pedestal|tip/i.test(o.name)) names.push(o.name); }); throw new Error(`Pedestal/tip ${type}-${color}: ${pedestal}/${tip} ${rig.weaponTip} ${names}`); }
      result.push({ type, color, height: entry.height, footprint: entry.footprint, parts: parts.length });
    }
    const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    globalThis.__arcanaScene = _roots.get(document.querySelector('canvas')).store.getState();
    return result;
  }));
  await page.screenshot({ path: '.shots/h8-v678-board.png' });
  for (const [color, rank, sign] of [['w', 3.5, 1], ['b', -3.5, -1]]) for (const [type, x] of [['king', 0.5], ['knight', -2.5], ['rook', -3.5]]) {
    await page.evaluate(({ x, rank, sign }) => {
      const state = globalThis.__arcanaScene;
      if (state.controls) state.controls.minDistance = 1;
      state.camera.position.set(x + 0.9, 1.35, rank - sign * 1.3);
      state.camera.lookAt(x, 0.55, rank);
      if (state.controls) { state.controls.target.set(x, 0.55, rank); state.controls.update(); }
      state.invalidate();
    }, { x, rank, sign });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `.shots/h8-v678-${color}-${type}.png` });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('PASS: 12 V6–V8 rigs, gameplay metadata, debris and seven screenshots');
} finally { await browser.close(); }
