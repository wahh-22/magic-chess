// Builds the procedural ruins, terrain and plaza (and the scatter layout) off the main thread;
// geometry buffers are transferred back without copying.
import { buildPlacements, ENVIRONMENT_BUILDERS } from "./environmentBuild";
import { ENVIRONMENT_PARTS } from "./environmentParts";
import { packGeometry, type PackedGeometry } from "./geometryTransfer";
import type { EnvironmentRequest, EnvironmentResponse } from "./environmentData";

// SAFETY: this module only ever runs as a dedicated worker, whose global scope has this shape.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<EnvironmentRequest>) => void) | null;
  postMessage(message: EnvironmentResponse, transfer: Transferable[]): void;
};

scope.onmessage = ({ data }) => {
  try {
    if (data.kind === "placements") {
      scope.postMessage({ id: data.id, placements: buildPlacements(data.options) }, []);
      return;
    }
    const geometry = {} as Record<string, PackedGeometry>;
    const transfer: ArrayBuffer[] = [];
    for (const part of ENVIRONMENT_PARTS) {
      const packed = packGeometry(ENVIRONMENT_BUILDERS[part]());
      geometry[part] = packed.packed;
      transfer.push(...packed.transfer);
    }
    scope.postMessage({ id: data.id, geometry }, transfer);
  } catch (error) {
    scope.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) }, []);
  }
};
