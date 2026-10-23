import { describe, expect, it } from "vitest";
import { fetchWithProgress } from "./fetchProgress";

function streamed(chunks: number[][], headers: Record<string, string> = {}, status = 200) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk));
      controller.close();
    },
  });
  return async () => new Response(body, { status, headers });
}

describe("fetchWithProgress", () => {
  it("reports bytes as they stream in, against Content-Length", async () => {
    const calls: [number, number | undefined][] = [];
    const buffer = await fetchWithProgress("/a.glb", {
      fetch: streamed([[1, 2], [3], [4, 5]], { "Content-Length": "5" }),
      onProgress: (loaded, total) => calls.push([loaded, total]),
    });
    expect([...new Uint8Array(buffer)]).toEqual([1, 2, 3, 4, 5]);
    expect(calls).toEqual([[0, 5], [2, 5], [3, 5], [5, 5]]);
  });

  it("treats the size as unknown when the body is content-encoded", async () => {
    const calls: [number, number | undefined][] = [];
    await fetchWithProgress("/a.json", {
      fetch: streamed([[1, 2, 3]], { "Content-Length": "2", "Content-Encoding": "gzip" }),
      onProgress: (loaded, total) => calls.push([loaded, total]),
    });
    expect(calls.at(-1)).toEqual([3, undefined]);
  });

  it("only fetches same-origin asset paths", async () => {
    for (const url of ["https://example.com/a.glb", "//example.com/a.glb", "/\\example.com", "models/a.glb"]) {
      await expect(fetchWithProgress(url, { fetch: streamed([[1]]) })).rejects.toThrow("Not a local asset path");
    }
  });

  it("rejects HTTP errors", async () => {
    await expect(fetchWithProgress("/missing.glb", { fetch: streamed([], {}, 404) })).rejects.toThrow("404");
  });
});
