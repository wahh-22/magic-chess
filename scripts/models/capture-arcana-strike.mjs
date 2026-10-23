// Side view of one capture on d5: trail start and weapon contact, in time order so
// no earlier frame has already shattered the victim. Needs the dev server on :5173.
// Usage: node scripts/models/capture-arcana-strike.mjs <type> <from> '<fen>'
import { chromium } from 'playwright';
const [type, from, fen] = process.argv.slice(2);
if (!type || !from || !fen) throw new Error('Usage: capture-arcana-strike.mjs <type> <from> <fen>');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (/Could not load .*model/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => localStorage.setItem('magic-chess.graphics-quality', 'low'));
  await page.goto('http://localhost:5173');
  await page.waitForFunction(() => globalThis.__gameStore);
  await page.evaluate(async ({ fen }) => {
    const { GameState } = await import('/src/core/GameState.ts');
    const store = globalThis.__gameStore, s = store.getState();
    s.startGame({ ...s.settings, mode: 'local' });
    const game = new GameState(fen);
    store.setState({ game, displayedPieces: game.pieces(), positionVersion: store.getState().positionVersion + 1 });
  }, { fen });
  await page.waitForFunction(() => globalThis.__frames > 15, undefined, { timeout: 180000 });
  // The toggle lives in the Settings popover (H8 T17 HUD).
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Cinematic captures', { exact: true }).uncheck();
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    const state = _roots.get(document.querySelector('canvas')).store.getState();
    globalThis.__captureState = state;
    globalThis.__captureClock = 0;
    state.clock.getElapsedTime = () => globalThis.__captureClock;
  });
  const plan = await page.evaluate(async ({ type, command }) => {
    const { loadPieceModels } = await import('/src/scene/pieces/gltfPieces.ts');
    const { planMove } = await import('/src/scene/animation/planMove.ts');
    const { modelBounds, captureContactDistance } = await import('/src/scene/effects/pieceColliders.ts');
    const models = await loadPieceModels();
    const before = globalThis.__gameStore.getState().displayedPieces;
    globalThis.__gameStore.getState().submitCommand(command);
    const event = globalThis.__gameStore.getState().animationQueue[0];
    return planMove(event, undefined, captureContactDistance(before, event, modelBounds(models)), type, models.rig?.(type, event.color));
  }, { type, command: `${from}d5` });
  if (!plan.impact || !plan.skeletalAttack) throw new Error(`No authored strike planned: ${JSON.stringify(plan.impact)}`);
  const { position: [vx, vz], direction: [dx, dz] } = plan.impact;
  // Look across the strike: the camera sits beside the attack line, between both pieces.
  await page.evaluate(({ vx, vz, dx, dz }) => {
    const state = globalThis.__captureState;
    const cx = vx - dx * 0.45, cz = vz - dz * 0.45;
    state.controls.minDistance = 0.3;
    state.controls.target.set(cx, 0.5, cz);
    state.camera.position.set(cx - dz * 1.9, 1.05, cz + dx * 1.9);
    state.controls.update();
  }, { vx, vz, dx, dz });
  const attack = plan.skeletalAttack;
  const marks = [['start', 10], ['trail', attack.startMs + (attack.trailStartMs ?? attack.hitMs) / (attack.rate ?? 1)], ['hit', plan.impact.atMs]];
  for (const [name, ms] of marks) {
    await page.evaluate(ms => { globalThis.__captureClock = ms / 1000; }, ms);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `.shots/h8-v678-strike-${type}-${name}.png` });
  }
  console.log(JSON.stringify({ type, marks: marks.map(([n, ms]) => [n, Math.round(ms)]), impact: Math.round(plan.impact.atMs), duration: Math.round(plan.durationMs), variant: attack.variant }), 'errors', errors);
  if (errors.length) process.exitCode = 1;
} finally { await browser.close(); }
