/**
 * AcousticMirrorMeshes — cached MeshBuilder primitives + unlit-material helpers.
 *
 * Owns: unit box (centred, 1 cm), flat annulus ring, flat disc and flat arrow
 * meshes in the local XY plane facing +Z, plus `makeVisual()` / `Beam` helpers
 * that clone a base unlit material per instance so colours can be tinted.
 * Must not: hold experience state.
 */

let unitBox: RenderMesh | null = null
const ringCache: { [key: string]: RenderMesh } = {}
let discMesh: RenderMesh | null = null
let arrowMesh: RenderMesh | null = null

function builder(): MeshBuilder {
  const mb = new MeshBuilder([
    { name: "position", components: 3 },
    { name: "normal", components: 3 },
    { name: "texture0", components: 2 },
  ])
  mb.topology = MeshTopology.Triangles
  mb.indexType = MeshIndexType.UInt16
  return mb
}

/** 1×1×1 cm box centred on the origin. Scale a leaf visual node to size it. */
export function getUnitBox(): RenderMesh {
  if (unitBox) return unitBox
  const mb = builder()
  const faces: number[][] = [
    // normal, u-axis, v-axis
    [0, 0, 1, 1, 0, 0, 0, 1, 0],
    [0, 0, -1, -1, 0, 0, 0, 1, 0],
    [1, 0, 0, 0, 0, -1, 0, 1, 0],
    [-1, 0, 0, 0, 0, 1, 0, 1, 0],
    [0, 1, 0, 1, 0, 0, 0, 0, -1],
    [0, -1, 0, 1, 0, 0, 0, 0, 1],
  ]
  let base = 0
  for (const f of faces) {
    const n = new vec3(f[0], f[1], f[2])
    const u = new vec3(f[3], f[4], f[5])
    const v = new vec3(f[6], f[7], f[8])
    const c = n.uniformScale(0.5)
    const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]
    for (const k of corners) {
      const p = c.add(u.uniformScale(k[0])).add(v.uniformScale(k[1]))
      mb.appendVerticesInterleaved([p.x, p.y, p.z, n.x, n.y, n.z, k[0] + 0.5, k[1] + 0.5])
    }
    mb.appendIndices([base, base + 1, base + 2, base, base + 2, base + 3])
    base += 4
  }
  mb.updateMesh()
  unitBox = mb.getMesh()
  return unitBox
}

/** Flat annulus in XY facing +Z, outer radius 1, inner radius `innerRatio`. */
export function getRing(innerRatio: number, segments: number = 48): RenderMesh {
  const key = innerRatio.toFixed(3) + "_" + segments
  if (ringCache[key]) return ringCache[key]
  const mb = builder()
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    mb.appendVerticesInterleaved([c, s, 0, 0, 0, 1, i / segments, 1])
    mb.appendVerticesInterleaved([c * innerRatio, s * innerRatio, 0, 0, 0, 1, i / segments, 0])
  }
  for (let i = 0; i < segments; i++) {
    const o = i * 2
    mb.appendIndices([o, o + 1, o + 2, o + 1, o + 3, o + 2])
  }
  mb.updateMesh()
  ringCache[key] = mb.getMesh()
  return ringCache[key]
}

/** Flat unit-radius disc in XY facing +Z. */
export function getDisc(segments: number = 32): RenderMesh {
  if (discMesh) return discMesh
  const mb = builder()
  mb.appendVerticesInterleaved([0, 0, 0, 0, 0, 1, 0.5, 0.5])
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    mb.appendVerticesInterleaved([Math.cos(a), Math.sin(a), 0, 0, 0, 1, 0.5, 0.5])
  }
  for (let i = 1; i <= segments; i++) mb.appendIndices([0, i, i + 1])
  mb.updateMesh()
  discMesh = mb.getMesh()
  return discMesh
}

/** Flat arrow in XY facing +Z, pointing along +Y, total length 1 (tip at y=+0.5). */
export function getArrow(): RenderMesh {
  if (arrowMesh) return arrowMesh
  const mb = builder()
  const pts = [
    [0, 0.5], [-0.45, 0.0], [-0.17, 0.0], [-0.17, -0.5], [0.17, -0.5], [0.17, 0.0], [0.45, 0.0],
  ]
  for (const p of pts) mb.appendVerticesInterleaved([p[0], p[1], 0, 0, 0, 1, p[0] + 0.5, p[1] + 0.5])
  mb.appendIndices([0, 1, 6, 2, 3, 4, 2, 4, 5])
  mb.updateMesh()
  arrowMesh = mb.getMesh()
  return arrowMesh
}

/** Clone `base` and configure it as a bright, depth-tested, alpha-blended unlit colour. */
export function tintedMaterial(base: Material, color: vec4, twoSided: boolean = true): Material {
  const m = base.clone()
  m.mainPass.baseColor = color
  m.mainPass.blendMode = BlendMode.Normal
  m.mainPass.depthWrite = false
  m.mainPass.depthTest = true
  m.mainPass.twoSided = twoSided
  return m
}

/** Create a child SceneObject with a RenderMeshVisual using a tinted clone of `base`. */
export function makeVisual(parent: SceneObject, name: string, mesh: RenderMesh, base: Material,
                           color: vec4, twoSided: boolean = true): { obj: SceneObject, rmv: RenderMeshVisual, mat: Material } {
  const obj = global.scene.createSceneObject(name)
  obj.setParent(parent)
  const rmv = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
  rmv.mesh = mesh
  const mat = tintedMaterial(base, color, twoSided)
  rmv.mainMaterial = mat
  return { obj, rmv, mat }
}

/** A straight glowing segment between two world points, built from the unit box. */
export class Beam {
  readonly obj: SceneObject
  readonly mat: Material
  private t: Transform
  thickness: number

  constructor(parent: SceneObject, name: string, base: Material, color: vec4, thicknessCm: number) {
    const v = makeVisual(parent, name, getUnitBox(), base, color)
    this.obj = v.obj
    this.mat = v.mat
    this.t = this.obj.getTransform()
    this.thickness = thicknessCm
  }

  setColor(c: vec4): void {
    this.mat.mainPass.baseColor = c
  }

  setVisible(on: boolean): void {
    if (this.obj.enabled !== on) this.obj.enabled = on
  }

  /** Stretch between world points a and b. */
  setEnds(a: vec3, b: vec3): void {
    const d = b.sub(a)
    const len = d.length
    if (len < 1e-4) {
      this.t.setWorldScale(new vec3(0.001, 0.001, 0.001))
      return
    }
    this.t.setWorldPosition(a.add(d.uniformScale(0.5)))
    const fwd = d.uniformScale(1 / len)
    this.t.setWorldRotation(quat.rotationFromTo(new vec3(0, 0, 1), fwd))
    this.t.setWorldScale(new vec3(this.thickness, this.thickness, len))
  }
}

/** Shorten a segment a→b by `cm` at the b end (so rays don't pass through the viewer's eyes). */
export function trimEnd(a: vec3, b: vec3, cm: number): vec3 {
  const d = b.sub(a)
  const len = d.length
  if (len <= cm + 1) return a.add(d.uniformScale(0.5))
  return a.add(d.uniformScale((len - cm) / len))
}
