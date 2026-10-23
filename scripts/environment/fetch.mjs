// Downloads Poly Haven CC0 sources once into a git-ignored cache. Downloads are untrusted
// data: each file lands in its own fresh temporary directory, is checked against the size
// and MD5 published by the API, and only then copied into the cache under a sanitized name.
// Nothing downloaded is executed; glTF JSON is parsed as data and its URIs are allow-listed.
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

export const CACHE = resolve('assets/models/source/environment');
const API = 'https://api.polyhaven.com';
const FILE_HOSTS = new Set(['dl.polyhaven.org']);
const USER_AGENT = 'magic-chess-environment-pipeline';
const SAFE_NAME = /^[A-Za-z0-9_.-]+$/;

const md5 = (bytes) => createHash('md5').update(bytes).digest('hex');

function parseURL(url) {
  try { return new URL(url); }
  catch (error) { throw new Error(`Invalid URL ${String(url).slice(0, 120)}`, { cause: error }); }
}

function parseJSON(bytes, label) {
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch (error) { throw new Error(`Invalid JSON in ${label}`, { cause: error }); }
}

async function fetchBytes(url) {
  const parsed = parseURL(url);
  if (parsed.protocol !== 'https:') throw new Error(`Refusing non-HTTPS URL ${url}`);
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'error' });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function fetchJSON(path) {
  return parseJSON(await fetchBytes(`${API}${path}`), path);
}

/** Download one listed file (or reuse the cached copy when its MD5 still matches). */
async function cachedFile(id, entry) {
  const url = parseURL(entry.url);
  if (!FILE_HOSTS.has(url.hostname)) throw new Error(`Unexpected file host ${url.hostname}`);
  const name = basename(url.pathname);
  if (!SAFE_NAME.test(name)) throw new Error(`Unsafe file name ${name}`);
  const directory = join(CACHE, id);
  const target = join(directory, name);
  try {
    const cached = await readFile(target);
    if (cached.length === entry.size && md5(cached) === entry.md5) return { name, bytes: new Uint8Array(cached) };
  } catch { /* not cached yet */ }
  const scratch = await mkdtemp(join(tmpdir(), 'env-src-'));
  const bytes = await fetchBytes(entry.url);
  if (bytes.length !== entry.size || md5(bytes) !== entry.md5) throw new Error(`Size/MD5 mismatch for ${entry.url}`);
  const staged = join(scratch, name);
  await writeFile(staged, bytes);
  await mkdir(directory, { recursive: true });
  await copyFile(staged, target);
  console.log(`  downloaded ${id}/${name} (${bytes.length} bytes)`);
  return { name, bytes };
}

/** Asset metadata (name, authors, licence page) from the public API, cached as JSON. */
export async function assetInfo(id) {
  const target = join(CACHE, id, 'info.json');
  try { return parseJSON(await readFile(target), target); } catch { /* fetch below */ }
  const info = await fetchJSON(`/info/${id}`);
  const record = { id, name: info.name, authors: Object.keys(info.authors ?? {}), url: `https://polyhaven.com/a/${id}`, license: 'CC0 1.0' };
  await mkdir(join(CACHE, id), { recursive: true });
  await writeFile(target, JSON.stringify(record, null, 2));
  return record;
}

async function fileList(id) {
  const target = join(CACHE, id, 'files.json');
  try { return parseJSON(await readFile(target), target); } catch { /* fetch below */ }
  const files = await fetchJSON(`/files/${id}`);
  await mkdir(join(CACHE, id), { recursive: true });
  await writeFile(target, JSON.stringify(files));
  return files;
}

/**
 * A model's glTF JSON plus the exact resources it references, keyed by the URI used in
 * the JSON. URIs must be ones the API lists for this model; anything else is rejected.
 */
export async function polyHavenModel(id, resolution = '1k') {
  const listing = (await fileList(id)).gltf?.[resolution]?.gltf;
  if (!listing) throw new Error(`${id} has no ${resolution} glTF`);
  const gltf = await cachedFile(id, listing);
  const json = parseJSON(gltf.bytes, `${id}/${gltf.name}`);
  const allowed = new Map(Object.entries(listing.include ?? {}));
  const uris = [...(json.buffers ?? []), ...(json.images ?? [])].map((item) => item.uri).filter(Boolean);
  const resources = {};
  for (const uri of uris) {
    const entry = allowed.get(uri);
    if (!entry || uri.includes('..') || uri.startsWith('/') || uri.includes(':')) throw new Error(`${id}: unlisted URI ${uri}`);
    resources[uri] = (await cachedFile(id, entry)).bytes;
  }
  return { json, resources };
}

/**
 * A model map listed by the API but not referenced by its glTF (e.g. the leaf alpha mask the
 * JPEG glTF cannot carry), looked up by its exact published file name.
 */
export async function polyHavenModelMap(id, fileName) {
  for (const [key, maps] of Object.entries(await fileList(id))) {
    if (['gltf', 'usd', 'fbx', 'blend'].includes(key)) continue;
    for (const formats of Object.values(maps)) {
      for (const entry of Object.values(formats ?? {})) {
        if (entry?.url && basename(parseURL(entry.url).pathname) === fileName) return (await cachedFile(id, entry)).bytes;
      }
    }
  }
  throw new Error(`${id}: no published file ${fileName}`);
}

/** One texture map of a Poly Haven texture asset at the given resolution (JPEG). */
export async function polyHavenTexture(id, map, resolution = '1k') {
  const entry = (await fileList(id))[map]?.[resolution]?.jpg;
  if (!entry) throw new Error(`${id} has no ${map} ${resolution} JPEG`);
  return (await cachedFile(id, entry)).bytes;
}
