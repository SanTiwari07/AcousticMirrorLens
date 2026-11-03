import { FlexLayout } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import { FlexItem } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import { FlexAlign, FlexAlignSelf, FlexDirection, FlexJustify } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import { BackPlate } from "SpectaclesUIKit.lspkg/Scripts/BackPlate"
import { Button } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event"

/**
 * AcousticMirrorStatusCardUI — the small floating status card above the right desk corner.
 *
 * Owns: the card visuals (UIKit BackPlate + FlexLayout column), the step / status /
 * detail / hint text, and the Next / Find Reflections / Reset buttons.
 * API (Main → UI): setStep, setStatus, setDetail, setHint, setNextEnabled, setFindEnabled.
 * Events (UI → Main): onNext, onFindReflections, onReset.
 * Must not: hold experience state or make flow decisions — it is a passive view.
 */

const imageMaterial = requireAsset("../Materials/ImageMaterial.mat") as Material
const ICON_TITLE = requireAsset("../Icons/graphic_eq.png") as Texture
const ICON_NEXT = requireAsset("../Icons/arrow_forward.png") as Texture
const ICON_FIND = requireAsset("../Icons/radar.png") as Texture
const ICON_RESET = requireAsset("../Icons/restart_alt.png") as Texture

const FONT_SIZE_SCALE = 1.0
type TextRole =
  | "Title1" | "Title2" | "HeadlineXL" | "Headline1" | "Headline2"
  | "Subheadline" | "Button" | "Callout" | "Body" | "Caption"
const TYPE_SCALE: Record<TextRole, { size: number; weight: number }> = {
  Title1: { size: 105, weight: 700 }, Title2: { size: 93, weight: 700 },
  HeadlineXL: { size: 62, weight: 700 }, Headline1: { size: 54, weight: 700 },
  Headline2: { size: 48, weight: 700 }, Subheadline: { size: 41, weight: 700 },
  Button: { size: 39, weight: 500 }, Callout: { size: 39, weight: 700 },
  Body: { size: 39, weight: 500 }, Caption: { size: 38, weight: 500 },
}
function roleSize(role: TextRole, distanceCm: number = 110): number {
  return TYPE_SCALE[role].size * FONT_SIZE_SCALE * (distanceCm / 110)
}
function applyTextRole(t: Text, role: TextRole, distanceCm: number = 110): void {
  t.size = roleSize(role, distanceCm)
  ;(t as Text & { weight?: number }).weight = TYPE_SCALE[role].weight
}

const CONTENT_Z = 0.6
const BUTTON_LABEL_Z = 0.08

@component
export class AcousticMirrorStatusCardUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">AcousticMirrorStatusCardUI – step / status card + buttons</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Card width in cm")
  @widget(new SliderWidget(20, 40, 0.5))
  cardWidthCm: number = 24

  @input
  @hint("Viewing distance the text is sized for, in cm (card sits ~80 cm from the listener)")
  @widget(new SliderWidget(50, 150, 1))
  readingDistanceCm: number = 72

  @input
  @hint("Card title")
  title: string = "AcousticMirror"

  @input('vec4', '{0.06,0.72,0.51,1}')
  @hint("Locked / treated accent colour (#10B981)")
  @widget(new ColorWidget())
  successColor: vec4 = new vec4(0.063, 0.725, 0.506, 1)

  @input('vec4', '{0.22,0.74,0.97,1}')
  @hint("Info accent colour (#38BDF8)")
  @widget(new ColorWidget())
  infoColor: vec4 = new vec4(0.22, 0.741, 0.973, 1)
  @ui.group_end

  private stepText: Text
  private statusText: Text
  private detailText: Text
  private hintText: Text
  private nextBtn: Button
  private findBtn: Button
  private nextLabel: Text
  private findLabel: Text

  private _step = ""
  private _status = ""
  private _detail = ""
  private _hint = ""
  private _nextEnabled = false
  private _findEnabled = false

  private _onNext = new Event<void>()
  private _onFind = new Event<void>()
  private _onReset = new Event<void>()
  get onNext(): PublicApi<void> { return this._onNext.publicApi() }
  get onFindReflections(): PublicApi<void> { return this._onFind.publicApi() }
  get onReset(): PublicApi<void> { return this._onReset.publicApi() }

  // Read-back getters (used by LEAF tests and logs).
  get stepLabel(): string { return this._step }
  get statusLabel(): string { return this._status }
  get detailLabel(): string { return this._detail }
  get hintLabel(): string { return this._hint }
  get nextEnabled(): boolean { return this._nextEnabled }
  get findEnabled(): boolean { return this._findEnabled }

  onAwake(): void {
    this.sceneObject.createComponent("Component.Canvas")
    const plate = this.sceneObject.createComponent(BackPlate.getTypeName()) as BackPlate

    const content = global.scene.createSceneObject("Content")
    content.setParent(this.sceneObject)
    content.getTransform().setLocalPosition(new vec3(0, 0, CONTENT_Z))

    const W = this.cardWidthCm
    const flex = content.createComponent(FlexLayout.getTypeName()) as FlexLayout
    flex.width = W
    flex.height = -1
    flex.direction = FlexDirection.Column
    flex.justifyContent = FlexJustify.Start
    flex.alignItems = FlexAlign.Stretch
    flex.rowGap = 0.7
    flex.paddingTop = 1.4
    flex.paddingBottom = 1.4
    flex.paddingLeft = 1.2
    flex.paddingRight = 1.2
    flex.onLayoutComplete.add((r) => {
      plate.size = new vec2(r.containerWidth, r.containerHeight)
    })

    const inner = W - 2.4
    this.addTitleRow(content, inner)
    this.stepText = this.addColumnText(content, "STEP 1 OF 3 · SPEAKER SETUP", "Caption", 1.6, new vec4(1, 1, 1, 0.7))
    this.statusText = this.addColumnText(content, "ROOM TREATED – 3/3 REFLECTION POINTS", "Headline2", 2.6, new vec4(1, 1, 1, 1))
    this.detailText = this.addColumnText(content, "Speaker angle 45.0°  ·  target 60° ± 2°", "Body", 2.0, new vec4(1, 1, 1, 0.9))
    this.hintText = this.addColumnText(content, "Pinch and drag a monitor across the desk.", "Caption", 2.0, new vec4(1, 1, 1, 0.6))
    this.addButtonRow(content, inner)

    this.setStep("STEP 1 OF 3 · SPEAKER SETUP")
    this.setStatus("Set up your speakers")
    this.setDetail("")
    this.setHint("")
    this.setNextEnabled(false)
    this.setFindEnabled(false)
  }

  // ── Public API (Main → UI) ─────────────────────────────────
  setStep(text: string): void {
    this._step = text
    if (this.stepText) this.stepText.text = text
  }

  /** kind: "neutral" | "success" | "info" */
  setStatus(text: string, kind: string = "neutral"): void {
    this._status = text
    if (!this.statusText) return
    this.statusText.text = text
    this.statusText.textFill.color = kind === "success" ? this.successColor
      : kind === "info" ? this.infoColor : new vec4(1, 1, 1, 1)
  }

  setDetail(text: string): void {
    this._detail = text
    if (this.detailText) this.detailText.text = text
  }

  setHint(text: string): void {
    this._hint = text
    if (this.hintText) this.hintText.text = text
  }

  setNextEnabled(on: boolean): void {
    this._nextEnabled = on
    if (this.nextBtn) this.nextBtn.inactive = !on
    if (this.nextLabel) this.nextLabel.textFill.color = new vec4(1, 1, 1, on ? 1 : 0.35)
  }

  setFindEnabled(on: boolean): void {
    this._findEnabled = on
    if (this.findBtn) this.findBtn.inactive = !on
    if (this.findLabel) this.findLabel.textFill.color = new vec4(1, 1, 1, on ? 1 : 0.35)
  }

  /** Test/automation hooks — behave exactly like pressing the button. */
  pressNext(): void { if (this._nextEnabled) this._onNext.invoke() }
  pressFindReflections(): void { if (this._findEnabled) this._onFind.invoke() }
  pressReset(): void { this._onReset.invoke() }

  // ── Builders ───────────────────────────────────────────────
  private obj(parent: SceneObject, name: string): SceneObject {
    const so = global.scene.createSceneObject(name)
    so.setParent(parent)
    return so
  }

  private makeText(so: SceneObject, text: string, role: TextRole, color: vec4, w: number, h: number): Text {
    const t = so.createComponent("Component.Text") as Text
    t.text = text
    t.depthTest = true
    applyTextRole(t, role, this.readingDistanceCm)
    t.textFill.color = color
    t.horizontalAlignment = HorizontalAlignment.Center
    t.verticalAlignment = VerticalAlignment.Center
    t.horizontalOverflow = HorizontalOverflow.Overflow
    t.verticalOverflow = VerticalOverflow.Overflow
    t.layoutRect = Rect.create(-w / 2, w / 2, -h / 2, h / 2)
    return t
  }

  /** Full-width text row in the column (Stretch on the cross axis). */
  private addColumnText(parent: SceneObject, text: string, role: TextRole, h: number, color: vec4): Text {
    const so = this.obj(parent, "Text")
    const t = this.makeText(so, text, role, color, 1, 1)
    t.layoutRect = Rect.create(-0.5, 0.5, -h / 2, h / 2)
    const item = so.createComponent(FlexItem.getTypeName()) as FlexItem
    item.alignSelf = FlexAlignSelf.Stretch
    item.overrideHeight = h
    return t
  }

  private addImage(parent: SceneObject, tex: Texture, sizeCm: number): SceneObject {
    const so = this.obj(parent, "Icon")
    const img = so.createComponent("Component.Image") as Image
    const mat = imageMaterial.clone()
    mat.mainPass.baseTex = tex
    mat.mainPass.depthTest = true
    mat.mainPass.depthWrite = false
    img.clearMaterials()
    img.addMaterial(mat)
    so.getTransform().setLocalScale(new vec3(sizeCm, sizeCm, 1))
    const item = so.createComponent(FlexItem.getTypeName()) as FlexItem
    item.overrideWidth = sizeCm
    item.overrideHeight = sizeCm
    return so
  }

  private addTitleRow(parent: SceneObject, inner: number): void {
    const row = this.obj(parent, "TitleRow")
    const f = row.createComponent(FlexLayout.getTypeName()) as FlexLayout
    f.direction = FlexDirection.Row
    f.justifyContent = FlexJustify.Center
    f.alignItems = FlexAlign.Center
    f.columnGap = 0.6
    f.width = inner
    f.height = 2.6
    const ri = row.createComponent(FlexItem.getTypeName()) as FlexItem
    ri.overrideHeight = 2.6
    this.addImage(row, ICON_TITLE, 2.0)
    const tso = this.obj(row, "Title")
    const titleW = Math.max(8, this.title.length * 0.55)
    this.makeText(tso, this.title, "Headline1", this.infoColor, titleW, 2.4)
    const ti = tso.createComponent(FlexItem.getTypeName()) as FlexItem
    ti.overrideWidth = titleW
    ti.overrideHeight = 2.4
  }

  private addButtonRow(parent: SceneObject, inner: number): void {
    // Row 1: Find Reflections (full width). Row 2: Next | Reset.
    const gap = 0.8
    const r1 = this.makeButtonRow(parent, "FindRow", inner, 0.3)
    const fb = this.addButton(r1, "FindReflectionsButton", "Find Reflections", ICON_FIND, inner, () => this.pressFindReflections())
    this.findBtn = fb.btn
    this.findLabel = fb.label
    const r2 = this.makeButtonRow(parent, "NavRow", inner, 0)
    const half = (inner - gap) / 2
    const n = this.addButton(r2, "NextButton", "Next", ICON_NEXT, half, () => this.pressNext())
    this.nextBtn = n.btn
    this.nextLabel = n.label
    this.addButton(r2, "ResetButton", "Reset", ICON_RESET, half, () => this.pressReset())
  }

  private makeButtonRow(parent: SceneObject, name: string, inner: number, marginTop: number): SceneObject {
    const row = this.obj(parent, name)
    const f = row.createComponent(FlexLayout.getTypeName()) as FlexLayout
    f.direction = FlexDirection.Row
    f.justifyContent = FlexJustify.SpaceBetween
    f.alignItems = FlexAlign.Center
    f.width = inner
    f.height = 3.4
    const ri = row.createComponent(FlexItem.getTypeName()) as FlexItem
    ri.overrideHeight = 3.4
    ri.marginTop = marginTop
    return row
  }

  private addButton(parent: SceneObject, name: string, label: string, icon: Texture, w: number,
                    onClick: () => void): { btn: Button, label: Text } {
    const h = 3.2
    const so = this.obj(parent, name)
    const btn = so.createComponent(Button.getTypeName()) as Button
    btn.size = new vec3(w, h, 1)
    const bi = so.createComponent(FlexItem.getTypeName()) as FlexItem
    bi.overrideWidth = w
    bi.overrideHeight = h

    // Face: icon + label laid out by a row FlexLayout, lifted in front of the button face.
    const face = this.obj(so, "Face")
    face.getTransform().setLocalPosition(new vec3(0, 0, BUTTON_LABEL_Z))
    const ff = face.createComponent(FlexLayout.getTypeName()) as FlexLayout
    ff.direction = FlexDirection.Row
    ff.justifyContent = FlexJustify.Center
    ff.alignItems = FlexAlign.Center
    ff.columnGap = 0.4
    ff.width = w - 0.4
    ff.height = h
    const iconSize = 1.5
    this.addImage(face, icon, iconSize)
    const lso = this.obj(face, "Label")
    const labelW = Math.max(2, w - iconSize - 1.2)
    const t = this.makeText(lso, label, "Button", new vec4(1, 1, 1, 1), labelW, 2.0)
    const li = lso.createComponent(FlexItem.getTypeName()) as FlexItem
    li.overrideWidth = labelW
    li.overrideHeight = 2.0

    btn.onTriggerUp.add(onClick)
    return { btn, label: t }
  }
}
