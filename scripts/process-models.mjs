import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { processModels } from './models/process.mjs';

try {
  const { values } = parseArgs({ options: { source: { type: 'string', default: 'assets/models/source' }, out: { type: 'string', default: 'public/models' } } });
  const source = resolve(values.source);
  let manifest;
  try { manifest = await readFile(join(source, 'manifest.json'), 'utf8'); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    manifest = await readFile('assets/models/manifest.json', 'utf8');
  }
  await processModels({ source, out: resolve(values.out), manifest: JSON.parse(manifest) });
} catch (error) {
  console.error(`Model pipeline: ${error.message}`);
  process.exitCode = 1;
}
