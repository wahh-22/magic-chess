export interface FetchProgressOptions {
  fetch?: (url: string) => Promise<Response>;
  /** `total` is undefined when the server does not tell the decoded size. */
  onProgress?: (loaded: number, total: number | undefined) => void;
}

/** Game assets are bundled with the app: only same-origin absolute paths are fetched. */
export function isAssetPath(url: string): boolean {
  return /^\/(?![/\\])/.test(url);
}

/** Downloads a file as bytes while reporting how many have arrived (the loading bar's source). */
export async function fetchWithProgress(url: string, { fetch: load = (target) => fetch(target), onProgress }: FetchProgressOptions = {}): Promise<ArrayBuffer> {
  if (!isAssetPath(url)) throw new Error(`Not a local asset path: ${url}`);
  const response = await load(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  // Content-Length counts encoded bytes; the stream yields decoded ones.
  const length = Number(response.headers.get("Content-Length"));
  const total = !response.headers.get("Content-Encoding") && Number.isFinite(length) && length > 0 ? length : undefined;
  onProgress?.(0, total);
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    onProgress?.(buffer.byteLength, total);
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.(loaded, total);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}
