import { SurfaceRect } from "./AcousticMirrorGeometry"
import { getUnitBox, makeVisual } from "./AcousticMirrorMeshes"

/**
 * AcousticMirrorSurface — one reflecting stand-in surface (left/right/back wall or desk top).
 *
 * Owns: the surface rectangle definition (taken live from this SceneObject's
 * transform, so moving the wall in the scene moves the maths) and its subtle
 * glowing grid/outline visual. Never solid or black (additive display).
 * Expects: this SceneObject's local +Z (normalAxis "Z") or local +Y (normalAxis "Y")
 * to point into the room. Width runs along local X; height along local Y (walls)
 * or local Z (desk).
 * Must not: decide anything about reflections — Main asks for `getRect()`.
 */
@component
export class AcousticMirrorSurface extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">AcousticMirrorSurface – reflecting wall / desk stand-in</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("Base unlit material, cloned and tinted for the grid lines")
  lineMaterial: Material
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Surface id used in state and logs (LeftWall, RightWall, Desk, BackWall)")
  surfaceId: string = "Surface"

  @input
  @hint("Local axis that points into the room: Z for walls, Y for the desk top")
  @widget(new ComboBoxWidget([new ComboBoxItem("Z (wall)", "Z"), new ComboBoxItem("Y (desk top)", "Y")]))
  normalAxis: string = "Z"

  @input
  @hint("Surface width in cm (along local X)")
  @widget(new SliderWidget(20, 600, 1))
  widthCm: number = 400

  @input
  @hint("Surface height in cm (local Y for walls, local Z depth for the desk)")
  @widget(new SliderWidget(20, 400, 1))
  heightCm: number = 250

  @input
  @hint("Spacing of the faint glowing grid lines, in cm (0 = outline only)")
  @widget(new SliderWidget(0, 100, 1))
  gridSpacingCm: number = 50

  @input('vec4', '{0.55,0.65,0.95,0.55}')
  @hint("Outline / grid colour — keep it light; black is invisible on Specs")
  @widget(new ColorWidget())
  lineColor: vec4 = new vec4(0.55, 0.65, 0.95, 0.55)

  @input
  @hint("Line thickness in cm")
  @widget(new SliderWidget(0.1, 2, 0.1))
  lineThicknessCm: number = 0.4

  @input
  @hint("Desk only: build a solid desk top of this thickness (cm) plus legs. 0 = none")
  @widget(new SliderWidget(0, 10, 0.5))
  slabThicknessCm: number = 0

  @input
  @hint("Desk only: leg length below the top, cm")
  @widget(new SliderWidget(0, 150, 1))
  legLengthCm: number = 70

  @input('vec4', '{0.80,0.66,0.50,1}')
  @hint("Desk top colour (light wood — keep it light on the additive display)")
  @widget(new ColorWidget())
  slabColor: vec4 = new vec4(0.8, 0.66, 0.5, 1)
  @ui.group_end

  private built = false
  private gridRoot: SceneObject | null = null
  private wantVisible = true

  /** Show / hide the glowing outline (the plane still exists for the maths). */
  setGridVisible(on: boolean): void {
    this.wantVisible = on
    if (this.gridRoot && this.gridRoot.enabled !== on) this.gridRoot.enabled = on
  }

  get gridVisible(): boolean { return this.wantVisible }

  onAwake(): void {
    this.buildVisual()
  }

  /** World-space rectangle for the reflection solver (read live every call). */
  getRect(): SurfaceRect {
    const t = this.sceneObject.getTransform()
    const r = t.getWorldRotation()
    const lx = r.multiplyVec3(new vec3(1, 0, 0))
    const ly = r.multiplyVec3(new vec3(0, 1, 0))
    const lz = r.multiplyVec3(new vec3(0, 0, 1))
    const n = this.normalAxis === "Y" ? ly : lz
    const u = lx
    const v = this.normalAxis === "Y" ? lz : ly
    return {
      p0: t.getWorldPosition(),
      n: n.normalize(),
      u: u.normalize(),
      v: v.normalize(),
      halfU: this.widthCm / 2,
      halfV: this.heightCm / 2,
    }
  }

  private buildVisual(): void {
    if (this.built || !this.lineMaterial) return
    this.built = true
    const root = global.scene.createSceneObject(this.surfaceId + "Grid")
    root.setParent(this.sceneObject)
    this.gridRoot = root
    const box = getUnitBox()
    const W = this.widthCm
    const H = this.heightCm
    const th = this.lineThicknessCm
    const isDesk = this.normalAxis === "Y"
    // Lines in local space: "a" axis = local X, "b" axis = local Y (wall) or Z (desk).
    const place = (name: string, ca: number, cb: number, la: number, lb: number, color: vec4) => {
      const v = makeVisual(root, name, box, this.lineMaterial, color)
      const tr = v.obj.getTransform()
      if (isDesk) {
        tr.setLocalPosition(new vec3(ca, 0.15, cb))
        tr.setLocalScale(new vec3(la, th * 0.5, lb))
      } else {
        tr.setLocalPosition(new vec3(ca, cb, 0.1))
        tr.setLocalScale(new vec3(la, lb, th * 0.5))
      }
    }
    const strong = this.lineColor
    const faint = new vec4(strong.x, strong.y, strong.z, strong.w * 0.45)
    // Outline (brighter)
    place("EdgeA0", 0, -H / 2, W, th * 2, strong)
    place("EdgeA1", 0, H / 2, W, th * 2, strong)
    place("EdgeB0", -W / 2, 0, th * 2, H, strong)
    place("EdgeB1", W / 2, 0, th * 2, H, strong)
    // Grid (faint, regular — parametric, so script-built)
    if (this.gridSpacingCm > 0) {
      const s = this.gridSpacingCm
      for (let x = -W / 2 + s; x < W / 2 - 1; x += s) place("GridU", x, 0, th, H, faint)
      for (let y = -H / 2 + s; y < H / 2 - 1; y += s) place("GridV", 0, y, W, th, faint)
    }
    root.enabled = this.wantVisible
    if (isDesk && this.slabThicknessCm > 0) this.buildDeskBody(box, W, H)
  }

  private buildDeskBody(box: RenderMesh, W: number, D: number): void {
    const body = global.scene.createSceneObject(this.surfaceId + "Body")
    body.setParent(this.sceneObject)
    const solid = (name: string, pos: vec3, size: vec3, color: vec4) => {
      const v = makeVisual(body, name, box, this.lineMaterial, color, false)
      v.mat.mainPass.blendMode = BlendMode.Disabled
      v.mat.mainPass.depthWrite = true
      v.obj.getTransform().setLocalPosition(pos)
      v.obj.getTransform().setLocalScale(size)
    }
    const th = this.slabThicknessCm
    solid("Top", new vec3(0, -th / 2 - 0.05, 0), new vec3(W, th, D), this.slabColor)
    const legC = new vec4(this.slabColor.x * 0.85, this.slabColor.y * 0.85, this.slabColor.z * 0.85, 1)
    const ly = -th - this.legLengthCm / 2
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      solid("Leg", new vec3(sx * (W / 2 - 4), ly, sz * (D / 2 - 4)), new vec3(4, this.legLengthCm, 4), legC)
    }
  }
}
