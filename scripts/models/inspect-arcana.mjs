// Read downloaded GLBs strictly as data; never import downloaded source files.
import { createIO } from './process.mjs';
import { readFile } from 'node:fs/promises';
const source = 'assets/models/source/arcana-realista/ARCANA_Realismo_V3/modelos';
for (const name of ['peon', 'caballo', 'torre', 'alfil', 'reina', 'rey']) {
  const doc = await createIO().read(`${source}/${name}_marfil.glb`);
  console.log(name, JSON.stringify(doc.getRoot().listAnimations().map((a) => a.getName())));
}
try {
  const manifest = JSON.parse(await readFile('public/models/manifest.json', 'utf8'));
  if (manifest.materialLibrary) {
    const library = await createIO().read(`public/models/${manifest.materialLibrary}`);
    console.log('shared library', { materials: library.getRoot().listMaterials().length, textures: library.getRoot().listTextures().map(t => [t.getName(), t.getSize()]) });
  }
  for (const [type, piece] of Object.entries(manifest.pieces)) for (const [color, entry] of Object.entries(piece.colors ?? {})) {
    const doc = await createIO().read(`public/models/${entry.file}`);
    console.log(type, color, { height: entry.height, footprint: entry.footprint, materials: doc.getRoot().listMaterials().length, textures: doc.getRoot().listTextures().length, clips: doc.getRoot().listAnimations().map((a) => a.getName()) });
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
