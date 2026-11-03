/**
 * AcousticMirrorGeometry — pure acoustic / view math. No scene access.
 *
 * Owns: the image-source first-reflection solver, the speaker-triangle angle,
 * and the SPECS field-of-view test. Everything is in world-space centimetres.
 * Must not: touch SceneObjects, materials, or UI.
 *
 * Image-source method (design brief, "Build notes for CLAD"):
 *   S' = S − 2((S − P0)·n)n
 *   t  = ((P0 − S')·n) / ((H − S')·n)
 *   M  = S' + t(H − S')
 *   Δd = |S−M| + |M−H| − |S−H|,  Δt = Δd / 343 m/s,  f = 1 / (2Δt)
 * A point is valid only when 0 < t < 1 AND M lies inside the surface rectangle.
 */

export const SPEED_OF_SOUND_CM_PER_S = 34300

/** A finite rectangular reflecting surface (wall or desk top). */
export interface SurfaceRect {
  /** Any point on the plane — the rectangle centre. */
  p0: vec3
  /** Unit normal pointing into the room (towards the listener). */
  n: vec3
  /** Unit in-plane axis along the rectangle width. */
  u: vec3
  /** Unit in-plane axis along the rectangle height / depth. */
  v: vec3
  halfU: number
  halfV: number
}

export interface ReflectionResult {
  valid: boolean
  /** Why the point is invalid ("" when valid). */
  reason: string
  t: number
  point: vec3
  imageSource: vec3
  extraPathCm: number
  delayMs: number
  freqHz: number
}

export function imageSource(s: vec3, surf: SurfaceRect): vec3 {
  const d = s.sub(surf.p0).dot(surf.n)
  return s.sub(surf.n.uniformScale(2 * d))
}

/** True when `p` (assumed on the plane) lies inside the rectangle, with optional inset. */
export function insideRect(p: vec3, surf: SurfaceRect, insetCm: number = 0): boolean {
  const rel = p.sub(surf.p0)
  const a = rel.dot(surf.u)
  const b = rel.dot(surf.v)
  return Math.abs(a) <= surf.halfU - insetCm && Math.abs(b) <= surf.halfV - insetCm
}

export function solveReflection(s: vec3, h: vec3, surf: SurfaceRect): ReflectionResult {
  const sp = imageSource(s, surf)
  const hs = h.sub(sp)
  const denom = hs.dot(surf.n)
  const out: ReflectionResult = {
    valid: false, reason: "", t: 0, point: vec3.zero(), imageSource: sp,
    extraPathCm: 0, delayMs: 0, freqHz: 0,
  }
  // Speaker and listener must both be on the room side of the surface.
  if (s.sub(surf.p0).dot(surf.n) <= 0 || h.sub(surf.p0).dot(surf.n) <= 0) {
    out.reason = "behind-surface"
    return out
  }
  if (Math.abs(denom) < 1e-6) {
    out.reason = "parallel"
    return out
  }
  const t = surf.p0.sub(sp).dot(surf.n) / denom
  out.t = t
  const m = sp.add(hs.uniformScale(t))
  out.point = m
  const direct = s.distance(h)
  out.extraPathCm = s.distance(m) + m.distance(h) - direct
  const dtS = out.extraPathCm / SPEED_OF_SOUND_CM_PER_S
  out.delayMs = dtS * 1000
  out.freqHz = dtS > 0 ? 1 / (2 * dtS) : 0
  if (!(t > 0 && t < 1)) {
    out.reason = "t-out-of-range"
    return out
  }
  if (!insideRect(m, surf)) {
    out.reason = "outside-surface"
    return out
  }
  out.valid = true
  return out
}

/** Horizontal (XZ-plane) angle in degrees at `h` between the directions to `a` and `b`. */
export function horizontalAngleDeg(h: vec3, a: vec3, b: vec3): number {
  const da = new vec3(a.x - h.x, 0, a.z - h.z)
  const db = new vec3(b.x - h.x, 0, b.z - h.z)
  const la = da.length
  const lb = db.length
  if (la < 1e-4 || lb < 1e-4) return 0
  const c = Math.max(-1, Math.min(1, da.dot(db) / (la * lb)))
  return (Math.acos(c) * 180) / Math.PI
}

export interface ViewInfo {
  inView: boolean
  /** Horizontal angle (deg) of the point from the view centre; + = right. */
  yawDeg: number
  /** Vertical angle (deg) of the point from the view centre; + = up. */
  pitchDeg: number
  /** Unit 2D direction (x right, y up) from view centre towards the point. */
  dir2d: vec2
}

/**
 * Field-of-view test against the SPECS display window.
 * `camT` is the camera transform (looks down its local −Z).
 */
export function viewInfo(camT: Transform, p: vec3, hFovDeg: number, vFovDeg: number): ViewInfo {
  // Camera-local coordinates without scale: rotate the offset by the inverse rotation.
  const local = camT.getWorldRotation().invert().multiplyVec3(p.sub(camT.getWorldPosition()))
  const fwd = -local.z
  const yaw = (Math.atan2(local.x, fwd) * 180) / Math.PI
  const pitch = (Math.atan2(local.y, Math.sqrt(local.x * local.x + fwd * fwd)) * 180) / Math.PI
  const inView = fwd > 0 && Math.abs(yaw) <= hFovDeg / 2 && Math.abs(pitch) <= vFovDeg / 2
  let d = new vec2(local.x, local.y)
  if (fwd <= 0 && d.length < 1e-3) d = new vec2(1, 0)
  if (d.length < 1e-6) d = new vec2(0, 1)
  return { inView, yawDeg: yaw, pitchDeg: pitch, dir2d: d.normalize() }
}
