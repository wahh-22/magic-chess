import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, Mesh, SkinnedMesh, Vector3, type Object3D } from 'three';
import type { PieceType } from '../../core/types';
import { DEFAULT_ANIMATION_CONFIG } from '../../config/animation';
import { sampleTrail, weaponTipBinding, type TrailPoint } from './trailSampler';
import { readQuality } from '../environment/battlefieldConfig';
import { DEFAULT_VFX_CONFIG } from '../../config/vfx';
import { trailColor } from './captureVfx';

/** Find the actual rigid weapon extremity, not a guessed hand-space offset. */
function weaponTip(scene: Object3D, type: PieceType, tipBone?: string) {
  if (tipBone) {
    const sanitized = tipBone.replace(/[.:[\] /]/g, '');
    let target: Object3D | undefined;
    scene.traverse(o => { if (o.name === tipBone || o.name.replace(/[.:[\] /]/g, '') === sanitized) target = o; });
    if (target) return { bone: target, tip: new Vector3() };
  }
  const { bone: name, direction } = weaponTipBinding(type);
  let bone: Object3D | undefined;
  scene.traverse(o => { if (o.name.replace('.', '') === name) bone = o; });
  if (!bone) return undefined;
  scene.updateMatrixWorld(true);
  let best = -Infinity;
  const point = new Vector3(), tip = new Vector3();
  scene.traverse(o => {
    if (!(o instanceof SkinnedMesh)) return;
    const joint = o.skeleton.bones.indexOf(bone as typeof o.skeleton.bones[number]);
    const indices = o.geometry.getAttribute('skinIndex'), weights = o.geometry.getAttribute('skinWeight');
    if (joint < 0 || !indices || !weights) return;
    for (let i = 0; i < indices.count; i++) {
      if (indices.getX(i) !== joint || weights.getX(i) < 0.9) continue;
      o.getVertexPosition(i, point); o.localToWorld(point); bone!.worldToLocal(point);
      const score = point.y * direction;
      if (score > best) { best = score; tip.copy(point); }
    }
  });
  return Number.isFinite(best) ? { bone, tip } : undefined;
}

export function WeaponTrail({ scene, type, attackTime, hitTimeMs, tipBone, window }: { scene: Object3D; type: PieceType; attackTime: () => number | undefined; hitTimeMs: number; tipBone?: string; window?: () => { startMs: number; endMs: number } | undefined }) {
  const target = useRef<ReturnType<typeof weaponTip>>(undefined);
  const mesh = useRef<Mesh>(null);
  const history = useRef<TrailPoint[]>([]);
  useEffect(() => { target.current = undefined; history.current = []; }, [scene, type, tipBone]);
  const point = useMemo(() => new Vector3(), []);
  const rgba = useMemo(() => new Float32Array(4), []);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(16 * 2 * 3), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(16 * 2 * 4), 4));
    g.setIndex(Array.from({ length: 15 }, (_, i) => [i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2]).flat());
    g.setDrawRange(0, 0);
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    const time = attackTime();
    if (!mesh.current) return;
    // Existing UI persists the quality preset. Low never samples or draws trails.
    if (time === undefined || readQuality() === 'low') {
      history.current = []; geometry.setDrawRange(0, 0); return;
    }
    // Resolve the rigid extremity lazily: low and idle pieces never scan skin
    // vertices, and each active rig scans only once.
    target.current ??= weaponTip(scene, type, tipBone);
    const weapon = target.current;
    if (!weapon) return;
    weapon.bone.updateWorldMatrix(true, false);
    point.copy(weapon.tip); weapon.bone.localToWorld(point); mesh.current.parent!.worldToLocal(point);
    history.current = sampleTrail(history.current, point.toArray(), time, hitTimeMs, DEFAULT_ANIMATION_CONFIG.trailLifetimeMs, true, window?.());
    const positions = geometry.getAttribute('position'), colors = geometry.getAttribute('color');
    history.current.forEach((p, i) => {
      // HDR white-gold at the contact so bloom catches the swing; cools and fades fast.
      trailColor(p.atMs, hitTimeMs, p.alpha, DEFAULT_VFX_CONFIG.trail, rgba, 0);
      for (let side = 0; side < 2; side++) {
        positions.setXYZ(i * 2 + side, p.position[0], p.position[1] + (side ? 0.016 : -0.016), p.position[2]);
        colors.setXYZW(i * 2 + side, rgba[0]!, rgba[1]!, rgba[2]!, rgba[3]!);
      }
    });
    positions.needsUpdate = colors.needsUpdate = true;
    geometry.setDrawRange(0, Math.max(0, history.current.length - 1) * 6);
  });
  return <mesh ref={mesh} geometry={geometry} frustumCulled={false} renderOrder={2}>
    <meshBasicMaterial vertexColors transparent depthWrite={false} side={DoubleSide} toneMapped={false} blending={AdditiveBlending} />
  </mesh>;
}
