// Real processed ARCANA assets, no request substitution or downloaded code execution.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
await mkdir('.shots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message); });
  page.on('console', (message) => { if (message.type() === 'error' || /Could not load .*model/.test(message.text())) { errors.push(message.text()); console.error(message.text()); } });
  await page.addInitScript(() => localStorage.setItem('magic-chess.graphics-quality', 'low'));
  await page.goto('http://localhost:5173');
  await page.waitForFunction(() => globalThis.__gameStore);
  await page.evaluate(() => { const s = globalThis.__gameStore.getState(); s.startGame({ ...s.settings, mode: 'local' }); });
  await page.waitForFunction(() => (globalThis.__frames ?? 0) > 15, undefined, { timeout: 60000 });
  console.log('First load', await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource').filter(entry => entry.name.includes('/models/'));
    return { elapsedMs: Math.round(performance.now()), modelRequests: resources.length,
      modelTransferBytes: resources.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
      modelLoadMs: Math.round(Math.max(...resources.map(entry => entry.responseEnd)) - Math.min(...resources.map(entry => entry.startTime))) };
  }));
  const report = await page.evaluate(async () => {
    const { loadPieceModels, validateGeometry } = await import('/src/scene/pieces/gltfPieces.ts');
    const provider = await loadPieceModels();
    const manifest = await (await fetch('/models/manifest.json')).json();
    const result = [];
    for (const type of ['p', 'n', 'r', 'b', 'q', 'k']) for (const color of ['w', 'b']) {
      const rig = provider.rig(type, color);
      if (!rig?.clips.idle || !rig.clips.attack || rig.hitTimeMs <= 0) throw new Error(`Wrong clips ${type}-${color}`);
      if (!validateGeometry(provider.geometry(type, color), manifest.pieces[type].colors[color])) throw new Error(`Wrong bounds ${type}-${color}`);
      const parts = provider.parts(type, color);
      if (!parts?.length || parts.length > 40 || parts.some(part => !part.geometry.getAttribute('uv'))) throw new Error(`Wrong armor parts ${type}-${color}`);
      let bones = 0;
      rig.scene.traverse(object => { if (object.isBone) bones++; });
      if (type === 'n' && bones < 41) throw new Error('Missing V3 knight bones');
      result.push({ type, color, height: manifest.pieces[type].colors[color].height, armorParts: parts.length, bones });
    }
    const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    globalThis.__arcanaScene = _roots.get(document.querySelector('canvas')).store.getState();
    let count = 0;
    globalThis.__arcanaScene.scene.traverse((object) => { if (object.isSkinnedMesh) count++; });
    if (count < 192) throw new Error(`Expected multi-material ARCANA army, got ${count} primitives`);
    const state = globalThis.__arcanaScene;
    let texturedSteel = 0;
    const sharedMaterials = new Set();
    state.scene.traverse(object => {
      if (!object.isSkinnedMesh) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        sharedMaterials.add(material);
        if (/steel/.test(material.name) && material.map && material.normalMap && material.roughnessMap && material.metalnessMap && material.aoMap) texturedSteel++;
      }
    });
    if (!texturedSteel) throw new Error('Steel lost PBR maps');
    return { pieces: result, primitives: count, sharedMaterials: sharedMaterials.size, texturedSteel,
      environment: !!state.scene.environment, environmentIntensity: state.scene.environmentIntensity, exposure: state.gl.toneMappingExposure };
  });
  console.log(JSON.stringify(report));
  await page.screenshot({ path: '.shots/h8-v3-board.png' });
  for (const [color, rank, sign] of [['w', 3.5, 1], ['b', -3.5, -1]]) {
    for (const [type, x, pieceRank] of [['king', 0.5, rank], ['knight', -2.5, rank], ['rook', -3.5, rank], ['pawn', 0.5, rank - sign]]) {
      await page.evaluate(({ x, rank, sign }) => {
        const state = globalThis.__arcanaScene;
        if (state.controls) state.controls.minDistance = 1;
        state.camera.position.set(x + 1.5, 2.0, rank - sign * 2.2);
        state.camera.lookAt(x, 0.55, rank);
        if (state.controls) { state.controls.target.set(x, 0.55, rank); state.controls.update(); }
        state.invalidate();
      }, { x, rank: pieceRank, sign });
      await page.waitForTimeout(500);
      await page.screenshot({ path: `.shots/h8-v3-${color}-${type}.png` });
    }
  }
  for (const move of ['e2e4', 'd7d5', 'e4d5']) {
    await page.evaluate((command) => globalThis.__gameStore.getState().submitCommand(command), move);
    await page.waitForFunction(() => globalThis.__gameStore.getState().animationQueue.length === 0, undefined, { timeout: 30000 });
  }
  // Enable only the trail for a second live capture, keeping the smoke test's
  // inexpensive low-quality chamber. A real rendered ribbon must appear.
  await page.evaluate(() => {
    localStorage.setItem('magic-chess.graphics-quality', 'high');
    const state = globalThis.__arcanaScene;
    state.setFrameloop('never');
    state.camera.position.set(1.6, 2.3, 2.5);
    if (state.controls) { state.controls.target.set(-0.5, 0.55, -0.5); state.controls.update(); }
    globalThis.__gameStore.getState().submitCommand('d8d5');
  });
  // Step the real R3F scene at 60 Hz: software-rendered Chrome can otherwise
  // skip the entire 160 ms trail window while rendering a single expensive frame.
  let visible = false;
  for (let i = 0; i < 240 && !visible; i++) {
    visible = await page.evaluate(() => {
      const state = globalThis.__arcanaScene;
      state.advance(state.clock.elapsedTime + 1 / 60);
      let drawn = false;
      state.scene.traverse(o => {
        if (o.isMesh && o.renderOrder === 2 && o.geometry.getAttribute('color')?.itemSize === 4 && o.geometry.drawRange.count >= 12) drawn = true;
      });
      return drawn;
    });
  }
  if (!visible) throw new Error('Live weapon trail did not render');
  await page.screenshot({ path: '.shots/h8-v3-live-trail.png' });
  let done = false;
  for (let i = 0; i < 240 && !done; i++) {
    done = await page.evaluate(() => {
      const state = globalThis.__arcanaScene;
      state.advance(state.clock.elapsedTime + 1 / 60);
      return globalThis.__gameStore.getState().animationQueue.length === 0;
    });
  }
  if (!done) throw new Error('Skeletal capture did not finish');
  await page.evaluate(() => globalThis.__arcanaScene.setFrameloop('always'));
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('PASS: 12 authored variants, normalized CPU-skinned bounds, animated army, low/high skeletal captures, rendered weapon trail; V3 bones, UV-preserving armor, ten screenshots.');
} finally { await browser.close(); }
