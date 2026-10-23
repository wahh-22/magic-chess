import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Mesh, MeshStandardMaterial } from 'three';
import type { PieceRig } from '../pieces/PieceModelProvider';
import type { Track } from './planMove';
import { pedestalPresentation } from '../effects/pedestalFade';
import { DEFAULT_ANIMATION_CONFIG } from '../../config/animation';
import { sampleTrack } from './sampleTrack';

/** Two fixed-square copies; only their private materials fade, never shared PBRs. */
export function PedestalVisual({ pedestal, position, yaw, clock }: {
  pedestal: NonNullable<PieceRig['pedestal']>; position: [number, number]; yaw: number;
  clock: () => { track?: Track; elapsedMs: number };
}) {
  const copies = useMemo(() => [0, 1].map(() => {
    const object = pedestal.object.clone(true);
    const materials: { material: MeshStandardMaterial; intensity: number; emissive: import('three').Color }[] = [];
    object.traverse(node => {
      if (!(node instanceof Mesh)) return;
      const clone = (source: MeshStandardMaterial) => {
        const material = source.clone(); material.transparent = true;
        materials.push({ material, intensity: material.emissiveIntensity, emissive: material.emissive.clone() });
        return material;
      };
      node.material = Array.isArray(node.material) ? node.material.map(clone) : clone(node.material);
      node.castShadow = node.receiveShadow = true;
    });
    return { object, materials };
  }), [pedestal]);
  useEffect(() => () => { copies.forEach(copy => copy.materials.forEach(({ material }) => material.dispose())); }, [copies]);
  useFrame(() => {
    const { track, elapsedMs } = clock();
    const state = pedestalPresentation(track, elapsedMs, pedestal.height);
    copies.forEach((copy, index) => {
      const opacity = index ? state.destinationOpacity : state.sourceOpacity;
      const glow = index ? state.destinationGlow : state.sourceGlow;
      copy.object.visible = opacity > 0;
      const parent = copy.object.parent!;
      // A gliding piece carries its pedestal; a walking piece leaves it on the squares.
      const carried = track?.carriesPedestal ? sampleTrack(track, elapsedMs, DEFAULT_ANIMATION_CONFIG) : undefined;
      const point: [number, number] = carried ? [carried.x, carried.z] : (index ? track?.to : track?.from) ?? position;
      parent.position.set(point[0], 0, point[1]);
      for (const { material, intensity, emissive } of copy.materials) {
        material.opacity = opacity; material.depthWrite = opacity >= 0.99;
        if (glow > 0) material.emissive.set('#e3bd73');
        else material.emissive.copy(emissive);
        material.emissiveIntensity = glow > 0 ? glow : intensity;
      }
    });
  }, -1);
  return <>{copies.map((copy, index) => <group key={index} position={[position[0], 0, position[1]]} rotation={[0, yaw, 0]}>
    <primitive object={copy.object} dispose={null} />
  </group>)}</>;
}
