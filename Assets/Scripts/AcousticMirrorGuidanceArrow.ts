import { amDeltaTime } from "./AcousticMirrorClock"
import { getArrow, getRing, makeVisual } from "./AcousticMirrorMeshes"

/**
 * AcousticMirrorGuidanceArrow — small directional arrow at the edge of the SPECS view.
 *
 * Owns: the arrow visual and its per-frame placement just inside the edge of the
 * viewing window, pointing towards the target direction.
 * API (Main → arrow): showTowards(camT, dir2d, hFovDeg, vFovDeg), hide().
 * Must not: decide when it should be shown — Main runs the field-of-view test.
 */
@component
export class AcousticMirrorGuidanceArrow extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">AcousticMirrorGuidanceArrow – out-of-view edge arrow</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("Base unlit material, cloned and tinted")
  baseMaterial: Material
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Distance in front of the eyes the arrow is drawn at, in cm")
  @widget(new SliderWidget(40, 150, 1))
  distanceCm: number = 70

  @input
  @hint("Arrow length in cm")
  @widget(new SliderWidget(1, 10, 0.5))
  sizeCm: number = 4

  @input
  @hint("How far towards the view edge the arrow sits (1 = exactly on the edge)")
  @widget(new SliderWidget(0.5, 0.98, 0.01))
  edgeFraction: number = 0.82

  @input('vec4', '{0.96,0.25,0.37,1}')
  @hint("Arrow colour (#F43F5E — matches untreated points)")
  @widget(new ColorWidget())
  color: vec4 = new vec4(0.957, 0.247, 0.369, 1)
  @ui.group_end

  private visual: SceneObject
  private _visible = false
  private time = 0
  /** Last 2D direction shown (x right, y up). */
  lastDir: vec2 = new vec2(0, 0)

  get isVisible(): boolean { return this._visible }

  onAwake(): void {
    this.visual = global.scene.createSceneObject("ArrowVisual")
    this.visual.setParent(this.sceneObject)
    const a = makeVisual(this.visual, "Arrow", getArrow(), this.baseMaterial, this.color)
    a.obj.getTransform().setLocalScale(new vec3(this.sizeCm * 0.8, this.sizeCm, 1))
    const halo = makeVisual(this.visual, "Halo", getRing(0.82), this.baseMaterial,
      new vec4(this.color.x, this.color.y, this.color.z, 0.6))
    halo.obj.getTransform().setLocalScale(new vec3(this.sizeCm * 0.85, this.sizeCm * 0.85, 1))
    this.visual.enabled = false
    this.createEvent("UpdateEvent").bind(() => { this.time += amDeltaTime() })
  }

  showTowards(camT: Transform, dir2d: vec2, hFovDeg: number, vFovDeg: number): void {
    this._visible = true
    this.lastDir = dir2d
    if (!this.visual.enabled) this.visual.enabled = true
    const d = this.distanceCm
    const halfW = Math.tan(((hFovDeg / 2) * Math.PI) / 180) * d * this.edgeFraction
    const halfH = Math.tan(((vFovDeg / 2) * Math.PI) / 180) * d * this.edgeFraction
    // Place on the ellipse inscribed in the view window, in the target's direction.
    const k = 1 / Math.sqrt((dir2d.x * dir2d.x) / (halfW * halfW) + (dir2d.y * dir2d.y) / (halfH * halfH))
    const bob = 1 + 0.06 * Math.sin(this.time * 6)
    const lx = dir2d.x * k * bob
    const ly = dir2d.y * k * bob
    const camRot = camT.getWorldRotation()
    const camPos = camT.getWorldPosition()
    const local = new vec3(lx, ly, -d)
    const t = this.visual.getTransform()
    t.setWorldPosition(camPos.add(camRot.multiplyVec3(local)))
    // Face the eyes; rotate in-plane so the arrow's +Y points along dir2d.
    const roll = Math.atan2(-dir2d.x, dir2d.y)
    t.setWorldRotation(camRot.multiply(quat.angleAxis(roll, new vec3(0, 0, 1))))
  }

  hide(): void {
    this._visible = false
    if (this.visual && this.visual.enabled) this.visual.enabled = false
  }
}
