// Bake/render V3 source GLBs directly, independently of a concurrent pipeline
// rebuild. Downloaded scripts are data only and are NEVER imported/executed.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { createIO } from './process.mjs';
import { authorArcanaAttack } from './arcana-attacks.mjs';

const directory = '.shots/h8-v3-attacks';
await mkdir(directory, { recursive: true });
const names = { p: 'peon', n: 'caballo', b: 'alfil', r: 'torre', q: 'reina', k: 'rey' };
const timings = {};
for (const [type, name] of Object.entries(names)) {
  const doc = await createIO().read(`assets/models/source/arcana-realista/ARCANA_Realismo_V3/modelos/${name}_marfil.glb`);
  for (const clip of doc.getRoot().listAnimations()) clip.dispose();
  timings[type] = authorArcanaAttack(doc, type);
  await createIO().write(`${directory}/${type}.glb`, doc);
}
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 620 } });
  const errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
  await page.goto('http://localhost:5173');
  await page.evaluate(async ({ directory, timings }) => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(600, 620); renderer.setPixelRatio(1);
    renderer.setClearColor('#25313b');
    Object.assign(renderer.domElement.style, { position: 'fixed', inset: '0', zIndex: '99999' });
    document.body.append(renderer.domElement);
    const label = document.createElement('div');
    Object.assign(label.style, { position: 'fixed', left: '16px', top: '14px', zIndex: '100000', color: 'white', font: '18px monospace', background: '#25313b' });
    document.body.append(label);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x687080, 2));
    const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(-2, 5, 3); scene.add(light);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: '#394552', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.005; scene.add(floor);
    const camera = new THREE.PerspectiveCamera(38, 600 / 620, 0.01, 100);
    camera.position.set(2.4, 1.25, 0.9); camera.lookAt(0, 0.60, 0.16);
    const loader = new GLTFLoader(), models = {};
    for (const type of Object.keys(timings)) {
      const gltf = await loader.loadAsync(`/${directory}/${type}.glb`);
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model), height = box.max.y - box.min.y;
      model.scale.setScalar(1 / height);
      model.position.y = -box.min.y / height;
      const mixer = new THREE.AnimationMixer(model);
      const clip = gltf.animations.find(c => c.name === 'attack');
      const action = mixer.clipAction(clip); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
      models[type] = { model, mixer, action };
    }
    let current;
    globalThis.__attackFrame = async (type, fraction) => {
      if (current) scene.remove(current.model);
      current = models[type]; scene.add(current.model);
      current.action.paused = false; current.action.enabled = true;
      current.mixer.setTime(fraction * timings[type].clipDurationMs / 1000);
      scene.updateMatrixWorld(true);
      label.textContent = `V3 ${type.toUpperCase()} · ${Math.round(fraction * timings[type].clipDurationMs)} ms · hit ${Math.round(timings[type].hitTimeMs)} ms`;
      await renderer.compileAsync(scene, camera);
      renderer.render(scene, camera);
    };
  }, { directory, timings });
  // Include both sides of the brief contact, followed by spring recovery.
  const frames = [0, 0.18, 0.30, 0.42, 0.50, 0.56, 0.66, 0.80, 1];
  for (const type of Object.keys(names)) {
    const images = [];
    for (const [i, fraction] of frames.entries()) {
      await page.evaluate(({ type, fraction }) => globalThis.__attackFrame(type, fraction), { type, fraction });
      const path = `${directory}/${type}-${i}.png`;
      await page.screenshot({ path });
      images.push({ input: await sharp(path).resize(360, 372).toBuffer(), left: i % 3 * 360, top: Math.floor(i / 3) * 372 });
    }
    const sheet = `${directory}/${type}-sheet.png`;
    await sharp({ create: { width: 1080, height: 1116, channels: 3, background: '#25313b' } }).composite(images).png().toFile(sheet);
    console.log(sheet, timings[type]);
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
