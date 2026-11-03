import { FlexLayout } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import { FlexItem } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import { FlexAlign, FlexAlignSelf, FlexDirection, FlexJustify } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import { BackPlate } from "SpectaclesUIKit.lspkg/Scripts/BackPlate"

/**
 * AcousticMirrorPointLabelsUI — small info tags next to each reflection point.
 *
 * Owns: one compact UIKit BackPlate card per reflection point (title + "x.x ms · yyy Hz").
 * A tag is only shown while Main says the user is looking towards its point — no large
 * info cards stay in view.
 * API (Main → UI): setLabel(index, visible, worldPos, facePos, title, body, kind).
 * Must not: compute acoustics or decide visibility.
 */

const FONT_SIZE_SCALE = 1.0
type TextRole = "Headline2" | "Subheadline" | "Body" | "Caption"
const TYPE_SCALE: Record<TextRole, { size: number; weight: number }> = {
  Headline2: { size: 48, weight: 700 }, Subheadline: { size: 41, weight: 700 },
  Body: { size: 39, weight: 500 }, Caption: { size: 38, weight: 500 },
}
function applyTextRole(t: Text, role: TextRole, distanceCm: number = 110): void {
  t.size = TYPE_SCALE[role].size * FONT_SIZE_SCALE * (distanceCm / 110)
  ;(t as Text & { weight?: number }).weight = TYPE_SCALE[role].weight
}

interface Tag {
  root: SceneObject
  title: Text
  body: Text
  visible: boolean
  titleStr: string
  bodyStr: string
}

@component
export class AcousticMirrorPointLabelsUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">AcousticMirrorPointLabelsUI – reflection point tags</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Number of tags to create (one per reflection point)")
  @widget(new SliderWidget(1, 6, 1))
  tagCount: number = 3

  @input
  @hint("Tag width in cm")
  @widget(new SliderWidget(10, 40, 0.5))
  tagWidthCm: number = 22

  @input
  @hint("Viewing distance the tag text is sized for, in cm")
  @widget(new SliderWidget(60, 250, 1))
  readingDistanceCm: number = 140

  @input('vec4', '{0.96,0.25,0.37,1}')
  @hint("Untreated accent colour (#F43F5E)")
  @widget(new ColorWidget())
  untreatedColor: vec4 = new vec4(0.957, 0.247, 0.369, 1)

  @input('vec4', '{0.06,0.72,0.51,1}')
  @hint("Treated accent colour (#10B981)")
  @widget(new ColorWidget())
  treatedColor: vec4 = new vec4(0.063, 0.725, 0.506, 1)
  @ui.group_end

  private tags: Tag[] = []
  private hideOnFirstFrame = true

  onAwake(): void {
    for (let i = 0; i < this.tagCount; i++) this.tags.push(this.buildTag(i))
    // Hide after the BackPlates/Flex layouts have initialised (never disable before OnStart).
    this.createEvent("UpdateEvent").bind(() => {
      if (!this.hideOnFirstFrame) return
      this.hideOnFirstFrame = false
      for (const t of this.tags) if (!t.visible) t.root.enabled = false
    })
  }

  isTagVisible(index: number): boolean {
    return index >= 0 && index < this.tags.length && this.tags[index].visible
  }

  tagText(index: number): string {
    if (index < 0 || index >= this.tags.length) return ""
    return this.tags[index].titleStr + " | " + this.tags[index].bodyStr
  }

  /** kind: "untreated" | "treated" */
  setLabel(index: number, visible: boolean, worldPos: vec3, facePos: vec3,
           title: string, body: string, kind: string): void {
    if (index < 0 || index >= this.tags.length) return
    const tag = this.tags[index]
    tag.visible = visible
    if (!this.hideOnFirstFrame && tag.root.enabled !== visible) tag.root.enabled = visible
    if (!visible) return
    const tr = tag.root.getTransform()
    tr.setWorldPosition(worldPos)
    const toViewer = facePos.sub(worldPos)
    const flat = new vec3(toViewer.x, 0, toViewer.z)
    if (flat.length > 1e-3) tr.setWorldRotation(quat.angleAxis(Math.atan2(flat.x, flat.z), vec3.up()))
    if (tag.titleStr !== title) { tag.titleStr = title; tag.title.text = title }
    if (tag.bodyStr !== body) { tag.bodyStr = body; tag.body.text = body }
    tag.title.textFill.color = kind === "treated" ? this.treatedColor : this.untreatedColor
  }

  private buildTag(i: number): Tag {
    const root = global.scene.createSceneObject("PointTag" + i)
    root.setParent(this.sceneObject)
    root.createComponent("Component.Canvas")
    const plate = root.createComponent(BackPlate.getTypeName()) as BackPlate
    const content = global.scene.createSceneObject("Content")
    content.setParent(root)
    content.getTransform().setLocalPosition(new vec3(0, 0, 0.6))
    const flex = content.createComponent(FlexLayout.getTypeName()) as FlexLayout
    flex.width = this.tagWidthCm
    flex.height = -1
    flex.direction = FlexDirection.Column
    flex.justifyContent = FlexJustify.Start
    flex.alignItems = FlexAlign.Stretch
    flex.rowGap = 0.4
    flex.paddingTop = 1.0
    flex.paddingBottom = 1.0
    flex.paddingLeft = 1.0
    flex.paddingRight = 1.0
    flex.onLayoutComplete.add((r) => { plate.size = new vec2(r.containerWidth, r.containerHeight) })
    const title = this.addText(content, "Right wall reflection", "Subheadline", 2.4, this.untreatedColor)
    const body = this.addText(content, "3.1 ms  ·  161 Hz", "Body", 2.4, new vec4(1, 1, 1, 1))
    return { root, title, body, visible: false, titleStr: "", bodyStr: "" }
  }

  private addText(parent: SceneObject, text: string, role: TextRole, h: number, color: vec4): Text {
    const so = global.scene.createSceneObject("Text")
    so.setParent(parent)
    const t = so.createComponent("Component.Text") as Text
    t.text = text
    t.depthTest = true
    applyTextRole(t, role, this.readingDistanceCm)
    t.textFill.color = color
    t.horizontalAlignment = HorizontalAlignment.Center
    t.verticalAlignment = VerticalAlignment.Center
    t.horizontalOverflow = HorizontalOverflow.Overflow
    t.verticalOverflow = VerticalOverflow.Overflow
    t.layoutRect = Rect.create(-0.5, 0.5, -h / 2, h / 2)
    const item = so.createComponent(FlexItem.getTypeName()) as FlexItem
    item.alignSelf = FlexAlignSelf.Stretch
    item.overrideHeight = h
    return t
  }
}
