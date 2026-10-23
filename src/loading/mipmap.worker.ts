// Mip levels for software GL: each level is resized from the base image on this thread.
// SAFETY: this module only ever runs as a dedicated worker, whose global scope has this shape.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ id: number; image: ImageBitmap; sizes: [number, number][] }>) => void) | null;
  postMessage(message: { id: number; levels?: ImageBitmap[] }, transfer: Transferable[]): void;
};

scope.onmessage = async ({ data: { id, image, sizes } }) => {
  try {
    const levels = await Promise.all(sizes.map(([width, height]) =>
      createImageBitmap(image, { resizeWidth: width, resizeHeight: height, resizeQuality: "medium", premultiplyAlpha: "none", colorSpaceConversion: "none" })));
    image.close();
    scope.postMessage({ id, levels }, levels);
  } catch {
    scope.postMessage({ id }, []);
  }
};
