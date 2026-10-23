import { Quaternion, Vector3 } from 'three';

// Angular frequency (rad/s), damping ratio, and propagation time in seconds.
// Cloth follows rather than duplicates the torso; distal joints whip last.
export function springProfile(name) {
  if (/cape_low/.test(name)) return { frequency: 28, damping: 0.68, delay: 0.14 };
  if (/cape_top/.test(name)) return { frequency: 32, damping: 0.72, delay: 0.10 };
  const delay = /hand|lance/.test(name) ? 0.09 : /forearm/.test(name) ? 0.07 : /shoulder|upper_arm/.test(name) ? 0.05 : /chest|spine|neck|jaw/.test(name) ? 0.03 : 0;
  return { frequency: /hand|lance/.test(name) ? 48 : 42, damping: 0.76, delay };
}

/** Piecewise pose targets, pursued on SO(3), integrated at 480 Hz and baked
 * at 60 Hz. Angular velocity survives target changes: no stop at pose keys.
 * Log/exp error chooses the short arc and keeps the quaternion normalized. */
export function bakeQuaternionSpring(times, poses, duration, profile) {
  const count = Math.ceil(duration * 60), dt = duration / count / 8;
  const q = new Quaternion().fromArray(poses[0]), velocity = new Vector3();
  const samples = [q.toArray()];
  for (let frame = 1; frame <= count; frame++) {
    for (let sub = 0; sub < 8; sub++) {
      const t = ((frame - 1) * 8 + sub + 1) * dt - profile.delay;
      let key = 0;
      while (key + 1 < times.length && times[key + 1] <= t) key++;
      const error = q.clone().invert().multiply(new Quaternion().fromArray(poses[key]));
      if (error.w < 0) error.set(-error.x, -error.y, -error.z, -error.w);
      const axis = new Vector3(error.x, error.y, error.z);
      const length = axis.length();
      if (length > 1e-10) axis.multiplyScalar(2 * Math.atan2(length, error.w) / length);
      velocity.addScaledVector(axis, profile.frequency ** 2 * dt).multiplyScalar(1 / (1 + 2 * profile.damping * profile.frequency * dt));
      const angle = velocity.length() * dt;
      if (angle > 1e-10) q.multiply(new Quaternion().setFromAxisAngle(velocity.clone().normalize(), angle)).normalize();
    }
    samples.push(q.toArray());
  }
  return samples;
}
