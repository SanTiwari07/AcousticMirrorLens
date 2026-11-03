import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { InteractableManipulation } from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation"
import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event"
import { getDisc, getRing, getUnitBox, makeVisual } from "./AcousticMirrorMeshes"

/**
 * AcousticMirrorDraggable — a one-hand pinch-and-drag prop (studio monitor or acoustic panel).
 *
 * Owns: its collider, SIK Interactable + InteractableManipulation (translation only),
 * hover highlight, and a cheap placeholder visual. If a child SceneObject named
 * "Visual" already exists (e.g. a generated GLB was swapped in), no placeholder is built.
 * The SceneObject origin is the prop's visual centre.
 * Must not: clamp itself or decide snapping — Main constrains/snaps it every frame.
 */
@component
export class AcousticMirrorDraggable extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">AcousticMirrorDraggable – pinch-drag prop</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("Base unlit material cloned for the placeholder visual")
  baseMaterial: Material
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Placeholder style")
  @widget(new ComboBoxWidget([new ComboBoxItem("Studio monitor", "monitor"), new ComboBoxItem("Acoustic panel", "panel")]))
  kind: string = "monitor"

  @input
  @hint("Prop size in cm (width, height, depth) — also the grab collider size")
  sizeCm: vec3 = new vec3(20, 30, 22)

  @input('vec4', '{0.78,0.82,0.92,1}')
  @hint("Placeholder body colour (keep light — dark is invisible on Specs)")
  @widget(new ColorWidget())
  bodyColor: vec4 = new vec4(0.78, 0.82, 0.92, 1)

  @input('vec4', '{0.22,0.74,0.97,1}')
  @hint("Accent / highlight colour shown while aimed at")
  @widget(new ColorWidget())
  highlightColor: vec4 = new vec4(0.22, 0.74, 0.97, 1)

  @input
  @hint("Extra collider padding in cm so targets are big and easy to hit")
  @widget(new SliderWidget(0, 10, 0.5))
  colliderPaddingCm: number = 2
  @ui.group_end

  private interactable: Interactable
  private manip: InteractableManipulation
  private bodyMats: Material[] = []
  private _dragging = false
  private _hovered = false
  private _locked = false
  private _onDragStart = new Event<void>()
  private _onDragEnd = new Event<void>()

  get onDragStart(): PublicApi<void> { return this._onDragStart.publicApi() }
  get onDragEnd(): PublicApi<void> { return this._onDragEnd.publicApi() }
  get isDragging(): boolean { return this._dragging }
  get isHovered(): boolean { return this._hovered }
  get isLocked(): boolean { return this._locked }

  onAwake(): void {
    const col = this.sceneObject.createComponent("Physics.ColliderComponent") as ColliderComponent
    const shape = Shape.createBoxShape()
    const p = this.colliderPaddingCm * 2
    shape.size = new vec3(this.sizeCm.x + p, this.sizeCm.y + p, this.sizeCm.z + p)
    col.shape = shape
    col.fitVisual = false

    this.interactable = this.sceneObject.createComponent(Interactable.getTypeName()) as Interactable
    this.manip = this.sceneObject.createComponent(InteractableManipulation.getTypeName()) as InteractableManipulation
    this.manip.setCanRotate(false)
    this.manip.setCanScale(false)

    this.buildPlaceholder()

    this.createEvent("OnStartEvent").bind(() => {
      this.manip.onManipulationStart.add(() => {
        this._dragging = true
        this._onDragStart.invoke()
      })
      this.manip.onManipulationEnd.add(() => {
        this._dragging = false
        this._onDragEnd.invoke()
      })
      this.interactable.onHoverEnter.add(() => { this._hovered = true; this.refreshTint() })
      this.interactable.onHoverExit.add(() => { this._hovered = false; this.refreshTint() })
    })
  }

  /** Lock (e.g. a snapped panel) — disables grabbing. */
  setLocked(locked: boolean): void {
    this._locked = locked
    this.manip.setCanTranslate(!locked)
    this.interactable.enabled = !locked
    if (locked) this._dragging = false
    this.refreshTint()
  }

  /** Programmatically mark the end of a drag (used when a panel snaps mid-drag). */
  forceRelease(): void {
    this._dragging = false
  }

  private refreshTint(): void {
    const c = this._hovered && !this._locked
      ? new vec4(
          Math.min(1, this.bodyColor.x * 0.6 + this.highlightColor.x * 0.5),
          Math.min(1, this.bodyColor.y * 0.6 + this.highlightColor.y * 0.5),
          Math.min(1, this.bodyColor.z * 0.6 + this.highlightColor.z * 0.5), 1)
      : this.bodyColor
    for (const m of this.bodyMats) m.mainPass.baseColor = c
  }

  private hasChild(name: string): boolean {
    for (let i = 0; i < this.sceneObject.getChildrenCount(); i++) {
      if (this.sceneObject.getChild(i).name === name) return true
    }
    return false
  }

  private buildPlaceholder(): void {
    if (!this.baseMaterial || this.hasChild("Visual")) return
    const root = global.scene.createSceneObject("PlaceholderVisual")
    root.setParent(this.sceneObject)
    const s = this.sizeCm
    const body = makeVisual(root, "Body", getUnitBox(), this.baseMaterial, this.bodyColor, false)
    body.obj.getTransform().setLocalScale(s)
    body.mat.mainPass.depthWrite = true
    body.mat.mainPass.blendMode = BlendMode.Disabled
    this.bodyMats.push(body.mat)
    const front = s.z / 2 + 0.2
    if (this.kind === "monitor") {
      // Woofer ring + tweeter dot on the front face (+Z faces the listener).
      const woofer = makeVisual(root, "Woofer", getRing(0.55), this.baseMaterial, this.highlightColor)
      woofer.obj.getTransform().setLocalPosition(new vec3(0, -s.y * 0.18, front))
      woofer.obj.getTransform().setLocalScale(new vec3(s.x * 0.36, s.x * 0.36, 1))
      const tweeter = makeVisual(root, "Tweeter", getDisc(), this.baseMaterial, this.highlightColor)
      tweeter.obj.getTransform().setLocalPosition(new vec3(0, s.y * 0.28, front))
      tweeter.obj.getTransform().setLocalScale(new vec3(s.x * 0.12, s.x * 0.12, 1))
    } else {
      // Foam-wedge stripes across the panel face.
      const stripe = new vec4(this.bodyColor.x * 0.75, this.bodyColor.y * 0.85, this.bodyColor.z * 0.9, 1)
      for (let i = -2; i <= 2; i++) {
        const v = makeVisual(root, "Wedge", getUnitBox(), this.baseMaterial, stripe, false)
        v.obj.getTransform().setLocalPosition(new vec3(0, i * s.y * 0.18, front))
        v.obj.getTransform().setLocalScale(new vec3(s.x * 0.92, s.y * 0.05, 0.4))
      }
    }
  }
}
