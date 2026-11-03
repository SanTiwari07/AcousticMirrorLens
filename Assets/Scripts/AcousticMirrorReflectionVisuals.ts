import { Beam, getDisc, getRing, makeVisual, trimEnd } from "./AcousticMirrorMeshes"

/**
 * AcousticMirrorReflectionVisuals — runtime-only line/ring drawing (plain class, not a component).
 *
 * Owns: the speaker-triangle beams, the listening-position marker, and per reflection
 * point a direct ray, two reflected-ray segments (S→M, M→head) and a dot/ring/halo target.
 * All created under one runtime parent; Main pushes positions/colours every frame.
 * Must not: compute acoustics or hold flow state.
 */

export function faceRotation(n: vec3): quat {
  if (Math.abs(n.y) > 0.9) return quat.rotationFromTo(new vec3(0, 0, 1), n)
  return quat.angleAxis(Math.atan2(n.x, n.z), vec3.up())
}

function withAlpha(c: vec4, a: number): vec4 {
  return new vec4(c.x, c.y, c.z, c.w * a)
}

export class PointVisual {
  readonly root: SceneObject
  readonly direct: Beam
  readonly incoming: Beam
  readonly outgoing: Beam
  private dot: Material
  private ring: Material
  private halo: Material
  private ringObj: SceneObject
  private haloObj: SceneObject
  private dotObj: SceneObject
  private radius = 3

  constructor(parent: SceneObject, name: string, base: Material, rayCm: number) {
    this.direct = new Beam(parent, name + "_DirectRay", base, new vec4(1, 1, 1, 1), rayCm)
    this.incoming = new Beam(parent, name + "_ReflectedRayIn", base, new vec4(1, 1, 1, 1), rayCm)
    this.outgoing = new Beam(parent, name + "_ReflectedRayOut", base, new vec4(1, 1, 1, 1), rayCm)
    this.root = global.scene.createSceneObject(name + "_Target")
    this.root.setParent(parent)
    const h = makeVisual(this.root, "Halo", getRing(0.8), base, new vec4(1, 1, 1, 1))
    const r = makeVisual(this.root, "Ring", getRing(0.62), base, new vec4(1, 1, 1, 1))
    const d = makeVisual(this.root, "Dot", getDisc(), base, new vec4(1, 1, 1, 1))
    this.halo = h.mat; this.haloObj = h.obj
    this.ring = r.mat; this.ringObj = r.obj
    this.dot = d.mat; this.dotObj = d.obj
    this.setAllVisible(false)
  }

  setAllVisible(on: boolean): void {
    this.direct.setVisible(on)
    this.incoming.setVisible(on)
    this.outgoing.setVisible(on)
    if (this.root.enabled !== on) this.root.enabled = on
  }

  /** Place the ring flush on the surface at M (lifted `liftCm` along n to avoid z-fighting). */
  setTarget(m: vec3, n: vec3, liftCm: number, radiusCm: number, color: vec4, pulse: number, alpha: number): void {
    const t = this.root.getTransform()
    t.setWorldPosition(m.add(n.uniformScale(liftCm)))
    t.setWorldRotation(faceRotation(n))
    // Ease the radius so "expand when looked at" reads as an animation.
    this.radius += (radiusCm - this.radius) * 0.2
    const R = this.radius
    this.ringObj.getTransform().setLocalScale(new vec3(R, R, 1))
    this.haloObj.getTransform().setLocalScale(new vec3(R * (1.25 + 0.15 * pulse), R * (1.25 + 0.15 * pulse), 1))
    this.haloObj.getTransform().setLocalPosition(new vec3(0, 0, -0.05))
    this.dotObj.getTransform().setLocalScale(new vec3(Math.max(1.4, R * 0.3), Math.max(1.4, R * 0.3), 1))
    this.dotObj.getTransform().setLocalPosition(new vec3(0, 0, 0.05))
    this.ring.mainPass.baseColor = withAlpha(color, alpha)
    this.halo.mainPass.baseColor = withAlpha(color, alpha * (0.25 + 0.25 * pulse))
    this.dot.mainPass.baseColor = withAlpha(new vec4(1, 1, 1, 1), alpha * 0.9)
  }

  get currentRadius(): number { return this.radius }
}

export class TriangleVisual {
  readonly lr: Beam
  readonly lh: Beam
  readonly rh: Beam
  readonly marker: SceneObject
  private markerRing: Material
  private markerDot: Material

  constructor(parent: SceneObject, base: Material, rayCm: number) {
    this.lr = new Beam(parent, "Triangle_LeftRight", base, new vec4(1, 1, 1, 1), rayCm)
    this.lh = new Beam(parent, "Triangle_LeftHead", base, new vec4(1, 1, 1, 1), rayCm)
    this.rh = new Beam(parent, "Triangle_RightHead", base, new vec4(1, 1, 1, 1), rayCm)
    this.marker = global.scene.createSceneObject("ListeningMarkerVisual")
    this.marker.setParent(parent)
    const r = makeVisual(this.marker, "Ring", getRing(0.7), base, new vec4(1, 1, 1, 1))
    r.obj.getTransform().setLocalScale(new vec3(4, 4, 1))
    const d = makeVisual(this.marker, "Dot", getDisc(), base, new vec4(1, 1, 1, 1))
    d.obj.getTransform().setLocalScale(new vec3(1.2, 1.2, 1))
    this.markerRing = r.mat
    this.markerDot = d.mat
  }

  setVisible(on: boolean): void {
    this.lr.setVisible(on)
    this.lh.setVisible(on)
    this.rh.setVisible(on)
    if (this.marker.enabled !== on) this.marker.enabled = on
  }

  update(sl: vec3, sr: vec3, markerPos: vec3, color: vec4, alpha: number, pulse: number): void {
    const c = withAlpha(color, alpha)
    this.lr.setEnds(sl, sr)
    this.lh.setEnds(sl, markerPos)
    this.rh.setEnds(sr, markerPos)
    this.lr.setColor(c)
    this.lh.setColor(c)
    this.rh.setColor(c)
    const mt = this.marker.getTransform()
    mt.setWorldPosition(markerPos)
    // Flat on a horizontal plane, facing up.
    mt.setWorldRotation(quat.rotationFromTo(new vec3(0, 0, 1), vec3.up()))
    const s = 1 + 0.1 * pulse
    mt.setWorldScale(new vec3(s, s, s))
    this.markerRing.mainPass.baseColor = c
    this.markerDot.mainPass.baseColor = withAlpha(new vec4(1, 1, 1, 1), alpha)
  }
}

export { trimEnd }
