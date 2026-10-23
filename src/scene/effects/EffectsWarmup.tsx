import { useEffect, useMemo } from "react";
import { BoxGeometry, BufferAttribute, BufferGeometry, Mesh, Points, type Material } from "three";
import type { Color, PieceType } from "../../core/types";
import type { PieceModelProvider } from "../pieces/PieceModelProvider";
import { createDustMaterial } from "./DustBurst";

const TYPES: PieceType[] = ["p", "n", "b", "r", "q", "k"];
const COLORS: Color[] = ["w", "b"];

/**
 * Hidden stand-ins for materials that first appear at a capture: armour debris (transparent
 * copies of the piece materials on plain, unskinned meshes), procedural fragments and the
 * dust burst. Mounted with the critical set, so the loading warm-up links their programs
 * and the first capture does not stall; never drawn (visible = false).
 */
export function EffectsWarmup({ provider }: { provider: PieceModelProvider }) {
  const objects = useMemo(() => {
    const sources = new Set<Material>();
    const fragments = new Set<Material>();
    for (const type of TYPES) for (const color of COLORS) {
      provider.rig?.(type, color)?.scene.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) sources.add(material);
      });
      const material = provider.material(type, color);
      for (const item of Array.isArray(material) ? material : [material]) sources.add(item);
      fragments.add(provider.fragmentMaterial(type, color));
    }
    // Same attributes as split armour parts (position, normal, uv) and as convex fragments.
    const box = new BoxGeometry(0.01, 0.01, 0.01);
    const fragment = new BoxGeometry(0.01, 0.01, 0.01).deleteAttribute("uv");
    const fade = (material: Material) => Object.assign(material.clone(), { transparent: true });
    const meshes = [
      ...[...sources].map((material) => new Mesh(box, fade(material))),
      ...[...fragments].map((material) => new Mesh(fragment, fade(material))),
    ];
    for (const mesh of meshes) { mesh.castShadow = mesh.receiveShadow = true; }
    const dustGeometry = new BufferGeometry();
    dustGeometry.setAttribute("position", new BufferAttribute(new Float32Array(3), 3));
    dustGeometry.setAttribute("aSize", new BufferAttribute(new Float32Array(1), 1));
    dustGeometry.setAttribute("aOpacity", new BufferAttribute(new Float32Array(1), 1));
    const dust = new Points(dustGeometry, createDustMaterial());
    const all = [...meshes, dust];
    for (const object of all) { object.visible = false; object.frustumCulled = false; }
    return { all, geometries: [box, fragment, dustGeometry] };
  }, [provider]);
  // Live as long as the scene: disposing the last material of a program frees the program.
  useEffect(() => () => {
    objects.all.forEach((object) => (object.material as Material).dispose());
    objects.geometries.forEach((geometry) => geometry.dispose());
  }, [objects]);
  return <group name="effects-warmup">{objects.all.map((object) => <primitive key={object.uuid} object={object} />)}</group>;
}
