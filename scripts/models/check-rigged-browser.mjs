// Run against a live Vite server after processing fixtures to .shots/rigged-models.
// Request interception leaves public/models byte-for-byte untouched.
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

await mkdir('.shots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' || /Could not load .*model/.test(message.text())) errors.push(message.text()); });
  await page.route('**/models/**', (route) => route.fulfill({ path: resolve('.shots/rigged-models', new URL(route.request().url()).pathname.split('/').at(-1)) }));
  await page.addInitScript(() => localStorage.setItem('magic-chess.graphics-quality', 'low'));
  await page.goto('http://localhost:5173');
  await page.waitForFunction(() => globalThis.__gameStore);
  await page.evaluate(() => { const s = globalThis.__gameStore.getState(); s.startGame({ ...s.settings, mode: 'local' }); });
  await page.waitForFunction(() => (globalThis.__frames ?? 0) > 10, undefined, { timeout: 20000 });
  // Inspect the actual rendered scene, not a second rig created by the test.
  await page.evaluate(async () => {
    const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    const scene = _roots.get(document.querySelector('canvas')).store.getState().scene;
    globalThis.__rigMeshes = [];
    scene.traverse((object) => { if (object.isSkinnedMesh) globalThis.__rigMeshes.push(object); });
  });
  const count = await page.evaluate(() => globalThis.__rigMeshes.length);
  if (count !== 16) throw new Error(`Expected 16 fixture pawns, got ${count}`);
  const handSample = () => page.evaluate(() => globalThis.__rigMeshes.map((mesh) => mesh.skeleton.bones.find((bone) => /RightHand/.test(bone.name)).position.toArray()));
  const idleBefore = await handSample();
  const frames = await page.evaluate(() => globalThis.__frames);
  await page.waitForFunction((before) => globalThis.__frames > before + 5, frames, { timeout: 20000 });
  if (JSON.stringify(idleBefore) === JSON.stringify(await handSample())) throw new Error(`Idle skeletons did not animate: ${JSON.stringify(idleBefore)}; console=${errors.join(';')}`);
  await page.screenshot({ path: '.shots/rigged-idle.png' });
  for (const command of ['e2e4', 'd7d5']) {
    await page.evaluate((move) => globalThis.__gameStore.getState().submitCommand(move), command);
    await page.waitForFunction(() => globalThis.__gameStore.getState().animationQueue.length === 0, undefined, { timeout: 15000 });
  }
  await page.evaluate(() => {
    globalThis.__maxHandX = 0;
    globalThis.__observeRig = setInterval(() => {
      for (const mesh of globalThis.__rigMeshes) {
        const bone = mesh.skeleton.bones.find((b) => /RightHand/.test(b.name));
        globalThis.__maxHandX = Math.max(globalThis.__maxHandX, bone.position.x);
      }
    }, 10);
    globalThis.__gameStore.getState().submitCommand('e4d5');
  });
  await page.waitForFunction(() => globalThis.__maxHandX > 0.3, undefined, { timeout: 15000 }).catch(async (error) => {
    console.log(await page.evaluate(() => ({ max: globalThis.__maxHandX, history: globalThis.__gameStore.getState().game.history(), queue: globalThis.__gameStore.getState().animationQueue.length, frames: globalThis.__frames })));
    throw error;
  });
  await page.screenshot({ path: '.shots/rigged-attack.png' });
  await page.waitForFunction(() => globalThis.__gameStore.getState().animationQueue.length === 0, undefined, { timeout: 15000 });
  await page.evaluate(() => clearInterval(globalThis.__observeRig));
  const history = await page.evaluate(() => globalThis.__gameStore.getState().game.history());
  if (history.join(',') !== 'e4,d5,exd5') throw new Error(`Unexpected history: ${history}`);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('PASS: 16 independent fixture pawns idle; e2e4,d7d5,e4d5 plays a skeletal attack; no console errors. public/models was never changed.');
} finally { await browser.close(); }
