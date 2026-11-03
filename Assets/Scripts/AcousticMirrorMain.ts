import { AcousticMirrorAudioController } from "./AcousticMirrorAudioController"
import { AcousticMirrorDraggable } from "./AcousticMirrorDraggable"
import { horizontalAngleDeg, ReflectionResult, solveReflection, viewInfo } from "./AcousticMirrorGeometry"
import { AcousticMirrorGuidanceArrow } from "./AcousticMirrorGuidanceArrow"
import { getUnitBox, makeVisual, trimEnd } from "./AcousticMirrorMeshes"
import { AcousticMirrorPointLabelsUI } from "./AcousticMirrorPointLabelsUI"
import { faceRotation, PointVisual, TriangleVisual } from "./AcousticMirrorReflectionVisuals"
import { AcousticMirrorStatusCardUI } from "./AcousticMirrorStatusCardUI"
import { AcousticMirrorSurface } from "./AcousticMirrorSurface"

/**
 * AcousticMirrorMain — orchestrator and single owner of the experience state.
 *
 * Owns: the step flow (1 speaker setup → 2 reflection discovery → 3 room treatment →
 * 4 complete, Reset → 1), the live speaker angle + sweet-spot lock, the three
 * first-reflection points (image-source method every frame, head = camera),
 * panel snapping + treated count, the out-of-view edge arrow, and the audio mix.
 * Expects (@input): camera, studio root, two monitor + three panel Draggables,
 * left/right/desk (+ optional back) Surfaces, status card + point-label UI modules,
 * guidance arrow, audio controller, a base unlit material.
 * Must not: author UI text components or UIKit — all text goes through the UI modules.
 *
 * Test surface: `getState()` (also reachable as `global.acousticMirror.getState()`).
 */

const STEP_NAMES = ["", "speakerSetup", "reflectionDiscovery", "roomTreatment", "complete"]

interface PointState {
  id: string
  surface: AcousticMirrorSurface
  sourceSide: string
  res: ReflectionResult
  treated: boolean
  panelIndex: number
  inView: boolean
  labelVisible: boolean
  yawDeg: number
  pitchDeg: number
  visual: PointVisual
}

@component
export class AcousticMirrorMain extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">AcousticMirrorMain – flow, reflection maths, snapping, guidance</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("The world camera — its position is the listening position (your head)")
  cameraObject: SceneObject

  @input
  @hint("Root of the virtual studio stand-in; re-anchored to the head on start")
  studioRoot: SceneObject

  @input
  @hint("Left studio monitor")
  leftMonitor: AcousticMirrorDraggable

  @input
  @hint("Right studio monitor")
  rightMonitor: AcousticMirrorDraggable

  @input
  @hint("Acoustic panel 1")
  panel1: AcousticMirrorDraggable

  @input
  @hint("Acoustic panel 2")
  panel2: AcousticMirrorDraggable

  @input
  @hint("Acoustic panel 3")
  panel3: AcousticMirrorDraggable

  @input
  @hint("Panel rack (shown with the panels in step 3)")
  panelRack: SceneObject

  @input
  @hint("Left wall surface")
  leftWall: AcousticMirrorSurface

  @input
  @hint("Right wall surface")
  rightWall: AcousticMirrorSurface

  @input
  @hint("Desk top surface")
  desk: AcousticMirrorSurface

  @input
  @hint("Optional back wall (studio context only, no reflection point)")
  @allowUndefined
  backWall: AcousticMirrorSurface

  @input
  @hint("Status card UI module")
  statusCard: AcousticMirrorStatusCardUI

  @input
  @hint("Reflection point tag UI module")
  pointLabels: AcousticMirrorPointLabelsUI

  @input
  @hint("Out-of-view edge arrow")
  guidanceArrow: AcousticMirrorGuidanceArrow

  @input
  @hint("Audio controller (hollow → clean crossfade + cues)")
  audio: AcousticMirrorAudioController

  @input
  @hint("Base unlit material, cloned and tinted for rays / rings / rack")
  baseMaterial: Material

  @input
  @hint("Parent for runtime-created rays and rings")
  visualsRoot: SceneObject
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Speaker setup</span>')
  @ui.group_start("Speaker setup")
  @input
  @hint("Target speaker angle at the listening position, degrees")
  @widget(new SliderWidget(30, 90, 1))
  targetAngleDeg: number = 60

  @input
  @hint("Sweet-spot tolerance, ± degrees")
  @widget(new SliderWidget(0.5, 10, 0.5))
  angleToleranceDeg: number = 2

  @input
  @hint("Height of the acoustic centre above the desk top, cm")
  @widget(new SliderWidget(5, 30, 0.5))
  acousticCenterHeightCm: number = 12

  @input
  @hint("Monitor height in cm (its origin sits half this above the desk)")
  @widget(new SliderWidget(10, 50, 1))
  monitorHeightCm: number = 30

  @input
  @hint("How far a monitor centre must stay inside the desk edges, cm")
  @widget(new SliderWidget(0, 20, 0.5))
  monitorEdgeMarginCm: number = 5

  @input
  @hint("Which monitor produces the desk reflection")
  @widget(new ComboBoxWidget([new ComboBoxItem("Left", "Left"), new ComboBoxItem("Right", "Right")]))
  deskSourceMonitor: string = "Left"
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Treatment &amp; guidance</span>')
  @ui.group_start("Treatment & guidance")
  @input
  @hint("A panel snaps when its centre comes within this distance of an untreated point, cm")
  @widget(new SliderWidget(2, 30, 0.5))
  snapDistanceCm: number = 8

  @input
  @hint("Also snap while dragging when the panel covers the point along your line of sight (same distance)")
  aimAssist: boolean = true

  @input
  @hint("Panel thickness in cm (snapped panels sit flush, half this off the surface)")
  @widget(new SliderWidget(1, 15, 0.5))
  panelThicknessCm: number = 5

  @input
  @hint("SPECS view width in degrees (out-of-view test)")
  @widget(new SliderWidget(10, 90, 0.5))
  viewWidthDeg: number = 32

  @input
  @hint("SPECS view height in degrees (out-of-view test)")
  @widget(new SliderWidget(10, 90, 0.5))
  viewHeightDeg: number = 37

  @input
  @hint("Seconds between subtle pings while the edge arrow is shown")
  @widget(new SliderWidget(1, 15, 0.5))
  pingIntervalSeconds: number = 4

  @input
  @hint("Untreated ring radius when looked at, cm")
  @widget(new SliderWidget(3, 20, 0.5))
  ringRadiusCm: number = 9

  @input
  @hint("Ray thickness, cm")
  @widget(new SliderWidget(0.1, 2, 0.05))
  rayThicknessCm: number = 0.5

  @input
  @hint("Rays stop this far short of your eyes, cm")
  @widget(new SliderWidget(5, 60, 1))
  rayEyeGapCm: number = 25
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Colours</span>')
  @ui.group_start("Colours")
  @input('vec4', '{0.22,0.74,0.97,1}')
  @hint("Direct rays (#38BDF8)")
  @widget(new ColorWidget())
  directColor: vec4 = new vec4(0.22, 0.741, 0.973, 1)

  @input('vec4', '{0.96,0.25,0.37,1}')
  @hint("Reflected rays and untreated rings (#F43F5E)")
  @widget(new ColorWidget())
  reflectedColor: vec4 = new vec4(0.957, 0.247, 0.369, 1)

  @input('vec4', '{0.06,0.72,0.51,1}')
  @hint("Locked / treated (#10B981)")
  @widget(new ColorWidget())
  successColor: vec4 = new vec4(0.063, 0.725, 0.506, 1)

  @input('vec4', '{0.9,0.93,1,0.9}')
  @hint("Speaker triangle while not yet locked")
  @widget(new ColorWidget())
  triangleColor: vec4 = new vec4(0.9, 0.93, 1, 0.9)
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Debug</span>')
  @ui.group_start("Debug")
  @input
  @hint("Re-anchor the studio to the head position/heading on start")
  anchorToHeadOnStart: boolean = true

  @input
  @hint("Print state changes to the log")
  verboseLogs: boolean = true
  @ui.group_end

  // ── State (single owner) ───────────────────────────────────
  step = 1
  sweetSpotLocked = false
  speakerAngleDeg = 0
  reflectionsFound = false
  treatedCount = 0
  arrowVisible = false
  arrowTargetId = ""
  pingCount = 0
  completeCount = 0

  private points: PointState[] = []
  private panels: AcousticMirrorDraggable[] = []
  private triangle: TriangleVisual
  private monitorStart: vec3[] = []
  private panelStart: { pos: vec3, rot: quat }[] = []
  private frame = 0
  private time = 0
  private triangleAlpha = 1
  private directAlpha = 0
  private pingTimer = 0
  private rackBuilt = false
  private ready = false

  onAwake(): void {
    if (!this.validate()) return
    ;(global as any).acousticMirror = this
    this.panels = [this.panel1, this.panel2, this.panel3]
    this.triangle = new TriangleVisual(this.visualsRoot, this.baseMaterial, this.rayThicknessCm)
    const deskSrc = this.deskSourceMonitor === "Right" ? "Right" : "Left"
    const defs: [string, AcousticMirrorSurface, string][] = [
      ["LeftWall", this.leftWall, "Left"],
      ["RightWall", this.rightWall, "Right"],
      ["Desk", this.desk, deskSrc],
    ]
    for (const d of defs) {
      this.points.push({
        id: d[0], surface: d[1], sourceSide: d[2],
        // Placeholder until the first frame (other components are not awake yet here).
        res: { valid: false, reason: "not-computed", t: 0, point: vec3.zero(), imageSource: vec3.zero(),
               extraPathCm: 0, delayMs: 0, freqHz: 0 },
        treated: false, panelIndex: -1, inView: false, labelVisible: false, yawDeg: 0, pitchDeg: 0,
        visual: new PointVisual(this.visualsRoot, d[0], this.baseMaterial, this.rayThicknessCm),
      })
    }
    this.buildRack()

    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("LateUpdateEvent").bind(() => this.onLateUpdate())
  }

  private validate(): boolean {
    const missing: string[] = []
    const req: [string, any][] = [
      ["cameraObject", this.cameraObject], ["studioRoot", this.studioRoot],
      ["leftMonitor", this.leftMonitor], ["rightMonitor", this.rightMonitor],
      ["panel1", this.panel1], ["panel2", this.panel2], ["panel3", this.panel3],
      ["panelRack", this.panelRack], ["leftWall", this.leftWall], ["rightWall", this.rightWall],
      ["desk", this.desk], ["statusCard", this.statusCard], ["pointLabels", this.pointLabels],
      ["guidanceArrow", this.guidanceArrow], ["audio", this.audio], ["baseMaterial", this.baseMaterial],
      ["visualsRoot", this.visualsRoot],
    ]
    for (const r of req) if (!r[1]) missing.push(r[0])
    if (missing.length) {
      print("[AcousticMirror] ERROR missing inputs: " + missing.join(", "))
      return false
    }
    return true
  }

  private onStart(): void {
    this.statusCard.onNext.add(() => this.onNext())
    this.statusCard.onFindReflections.add(() => this.findReflections())
    this.statusCard.onReset.add(() => this.reset())
    this.log("started")
  }

  // ── Flow ───────────────────────────────────────────────────
  private onNext(): void {
    if (this.step === 1 && this.sweetSpotLocked) {
      this.enterStep(2)
    } else if (this.step === 2 && this.reflectionsFound) {
      this.enterStep(3)
    }
  }

  /** Calculates and shows the reflection paths and target points (step 2). */
  findReflections(): void {
    if (this.step !== 2) return
    this.reflectionsFound = true
    this.computeReflections()
    this.directAlpha = 0
    this.log("reflections found: " + this.points.map(p => p.id + (p.res.valid ? "" : "(hidden:" + p.res.reason + ")")).join(", "))
    this.refreshCard()
  }

  private enterStep(s: number): void {
    this.step = s
    if (s === 2) {
      this.leftMonitor.setLocked(true)
      this.rightMonitor.setLocked(true)
      this.setWallsVisible(true)
    }
    if (s === 3) {
      this.setPanelsVisible(true)
    }
    if (s === 4) {
      this.completeCount++
      this.audio.playCompleteChime()
      this.guidanceArrow.hide()
      this.arrowVisible = false
    }
    this.log("step -> " + s + " (" + STEP_NAMES[s] + ")")
    this.refreshCard()
  }

  /** Restore the starting scene: monitors, panels, rays, counter, audio, step 1. */
  reset(): void {
    this.step = 1
    this.sweetSpotLocked = false
    this.reflectionsFound = false
    this.treatedCount = 0
    this.triangleAlpha = 1
    this.directAlpha = 0
    this.pingTimer = 0
    this.leftMonitor.setLocked(false)
    this.rightMonitor.setLocked(false)
    this.leftMonitor.getTransform().setLocalPosition(this.monitorStart[0])
    this.rightMonitor.getTransform().setLocalPosition(this.monitorStart[1])
    for (let i = 0; i < this.panels.length; i++) {
      const p = this.panels[i]
      p.setLocked(false)
      p.getTransform().setLocalPosition(this.panelStart[i].pos)
      p.getTransform().setLocalRotation(this.panelStart[i].rot)
    }
    for (const pt of this.points) {
      pt.treated = false
      pt.panelIndex = -1
      pt.labelVisible = false
      pt.visual.setAllVisible(false)
      this.pointLabels.setLabel(this.points.indexOf(pt), false, vec3.zero(), vec3.zero(), "", "", "untreated")
    }
    this.setPanelsVisible(false)
    this.setWallsVisible(false)
    this.guidanceArrow.hide()
    this.arrowVisible = false
    this.arrowTargetId = ""
    this.audio.setMix(0, true)
    this.log("reset")
    this.refreshCard()
  }

  private setWallsVisible(on: boolean): void {
    this.leftWall.setGridVisible(on)
    this.rightWall.setGridVisible(on)
    if (this.backWall) this.backWall.setGridVisible(on)
  }

  private setPanelsVisible(on: boolean): void {
    this.panelRack.enabled = on
    for (const p of this.panels) p.getSceneObject().enabled = on
  }

  // ── Per frame ──────────────────────────────────────────────
  private onLateUpdate(): void {
    this.frame++
    this.time += getDeltaTime()
    if (!this.ready) {
      // Wait two frames so device tracking has written the camera pose, then initialise.
      if (this.frame < 2) return
      this.initialise()
      return
    }
    const camT = this.cameraObject.getTransform()
    const head = camT.getWorldPosition()
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4)

    this.constrainMonitors(head)
    const sl = this.speakerPos(this.leftMonitor)
    const sr = this.speakerPos(this.rightMonitor)
    this.speakerAngleDeg = horizontalAngleDeg(head, sl, sr)

    // Step 1 — sweet spot (with a small hysteresis so the chime doesn't chatter).
    if (this.step === 1) {
      const err = Math.abs(this.speakerAngleDeg - this.targetAngleDeg)
      const wasLocked = this.sweetSpotLocked
      this.sweetSpotLocked = wasLocked ? err <= this.angleToleranceDeg + 0.3 : err <= this.angleToleranceDeg
      if (this.sweetSpotLocked && !wasLocked) {
        this.audio.playLockChime()
        this.log("sweet spot locked at " + this.speakerAngleDeg.toFixed(1) + " deg")
      }
      this.refreshCard()
    }

    // Speaker triangle: shown in step 1, fades away in step 2.
    this.triangleAlpha = this.approach(this.triangleAlpha, this.step === 1 ? 1 : 0, 1.5)
    if (this.triangleAlpha > 0.01) {
      this.triangle.setVisible(true)
      const marker = this.markerPos(camT)
      const col = this.sweetSpotLocked ? this.successColor : this.triangleColor
      this.triangle.update(sl, sr, marker, col, this.triangleAlpha, pulse)
    } else {
      this.triangle.setVisible(false)
    }

    // Reflections (steps 2–4): recomputed live from the current head position.
    if (this.reflectionsFound) {
      this.directAlpha = this.approach(this.directAlpha, this.step === 2 ? 1 : 0, 1.5)
      this.computeReflections()
      this.updatePanels(head)
      this.drawReflections(camT, head, sl, sr, pulse)
      this.updateGuidance(camT)
    }
  }

  private initialise(): void {
    if (this.anchorToHeadOnStart) {
      const camT = this.cameraObject.getTransform()
      const f = camT.getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
      const yaw = Math.atan2(-f.x, -f.z)
      const st = this.studioRoot.getTransform()
      st.setWorldPosition(camT.getWorldPosition())
      st.setWorldRotation(quat.angleAxis(yaw, vec3.up()))
    }
    this.monitorStart = [
      this.leftMonitor.getTransform().getLocalPosition(),
      this.rightMonitor.getTransform().getLocalPosition(),
    ]
    this.panelStart = this.panels.map(p => ({
      pos: p.getTransform().getLocalPosition(),
      rot: p.getTransform().getLocalRotation(),
    }))
    this.ready = true
    this.reset()
  }

  private approach(v: number, target: number, ratePerSec: number): number {
    const d = ratePerSec * getDeltaTime()
    return v < target ? Math.min(target, v + d) : Math.max(target, v - d)
  }

  private markerPos(camT: Transform): vec3 {
    // Listening-position marker: just below and in front of the eyes, in the room's horizontal frame.
    const f = camT.getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
    const flat = new vec3(f.x, 0, f.z)
    const fwd = flat.length > 1e-3 ? flat.normalize() : new vec3(0, 0, -1)
    return camT.getWorldPosition().add(fwd.uniformScale(30)).add(new vec3(0, -9, 0))
  }

  private speakerPos(m: AcousticMirrorDraggable): vec3 {
    const rect = this.desk.getRect()
    const offset = this.acousticCenterHeightCm - this.monitorHeightCm / 2
    return m.getTransform().getWorldPosition().add(rect.n.uniformScale(offset))
  }

  /** Keep monitors standing on the desk surface, inside its edges, toed-in towards the head. */
  private constrainMonitors(head: vec3): void {
    const rect = this.desk.getRect()
    for (const m of [this.leftMonitor, this.rightMonitor]) {
      const t = m.getTransform()
      const rel = t.getWorldPosition().sub(rect.p0)
      const lu = Math.max(-(rect.halfU - this.monitorEdgeMarginCm), Math.min(rect.halfU - this.monitorEdgeMarginCm, rel.dot(rect.u)))
      const lv = Math.max(-(rect.halfV - 10), Math.min(rect.halfV - 10, rel.dot(rect.v)))
      const p = rect.p0.add(rect.u.uniformScale(lu)).add(rect.v.uniformScale(lv)).add(rect.n.uniformScale(this.monitorHeightCm / 2))
      t.setWorldPosition(p)
      const toHead = head.sub(p)
      t.setWorldRotation(quat.angleAxis(Math.atan2(toHead.x, toHead.z), vec3.up()))
    }
  }

  private computeReflections(): void {
    const head = this.cameraObject.getTransform().getWorldPosition()
    const sl = this.speakerPos(this.leftMonitor)
    const sr = this.speakerPos(this.rightMonitor)
    for (const p of this.points) {
      const s = p.sourceSide === "Left" ? sl : sr
      p.res = solveReflection(s, head, p.surface.getRect())
    }
  }

  // ── Panels / snapping ──────────────────────────────────────
  private updatePanels(head: vec3): void {
    if (this.step !== 3 && this.step !== 4) return
    for (let i = 0; i < this.panels.length; i++) {
      const panel = this.panels[i]
      const owned = this.points.find(p => p.panelIndex === i)
      if (owned) {
        if (owned.res.valid) this.placePanelOn(panel, owned)
        continue
      }
      if (this.step !== 3) continue
      const pos = panel.getTransform().getWorldPosition()
      for (const pt of this.points) {
        if (pt.treated || !pt.res.valid) continue
        const m = pt.res.point
        let near = pos.distance(m) <= this.snapDistanceCm
        if (!near && this.aimAssist && panel.isDragging) {
          near = this.distanceToSegment(pos, head, m) <= this.snapDistanceCm && pos.distance(head) > 30
        }
        if (near) {
          this.treat(pt, i)
          break
        }
      }
    }
  }

  private distanceToSegment(p: vec3, a: vec3, b: vec3): number {
    const ab = b.sub(a)
    const l2 = ab.dot(ab)
    if (l2 < 1e-6) return p.distance(a)
    const t = Math.max(0, Math.min(1, p.sub(a).dot(ab) / l2))
    return p.distance(a.add(ab.uniformScale(t)))
  }

  private placePanelOn(panel: AcousticMirrorDraggable, pt: PointState): void {
    const n = pt.surface.getRect().n
    const t = panel.getTransform()
    t.setWorldPosition(pt.res.point.add(n.uniformScale(this.panelThicknessCm / 2 + 0.2)))
    t.setWorldRotation(faceRotation(n))
  }

  private treat(pt: PointState, panelIndex: number): void {
    pt.treated = true
    pt.panelIndex = panelIndex
    const panel = this.panels[panelIndex]
    panel.setLocked(true)
    panel.forceRelease()
    this.placePanelOn(panel, pt)
    this.treatedCount = this.points.filter(p => p.treated).length
    this.audio.setMix(this.treatedCount / this.points.length)
    this.audio.playSnap()
    this.log("panel " + (panelIndex + 1) + " snapped to " + pt.id + " -> " + this.treatedCount + "/3 treated")
    if (this.treatedCount >= this.points.length) this.enterStep(4)
    else this.refreshCard()
  }

  /** Test helper: move a panel onto a point; the regular snap check then treats it. */
  movePanelToPoint(panelIndex: number, pointId: string): boolean {
    const pt = this.points.find(p => p.id === pointId)
    const panel = this.panels[panelIndex]
    if (!pt || !panel || !pt.res.valid) return false
    panel.getTransform().setWorldPosition(pt.res.point.add(pt.surface.getRect().n.uniformScale(3)))
    return true
  }

  /** Test helper: place both monitors symmetrically for a given total angle at `depthCm` from the head. */
  setMonitorsForAngle(totalAngleDeg: number, depthCm: number = 108): void {
    const head = this.studioRoot.getTransform().getInvertedWorldTransform().multiplyPoint(this.cameraObject.getTransform().getWorldPosition())
    const half = ((totalAngleDeg / 2) * Math.PI) / 180
    const x = Math.tan(half) * depthCm
    const y = this.leftMonitor.getTransform().getLocalPosition().y
    this.leftMonitor.getTransform().setLocalPosition(new vec3(head.x - x, y, head.z - depthCm))
    this.rightMonitor.getTransform().setLocalPosition(new vec3(head.x + x, y, head.z - depthCm))
  }

  // ── Drawing ────────────────────────────────────────────────
  /**
   * Where a point's tag sits. It must never be hidden by a snapped panel or by the
   * rays that run from the speaker and towards the eye.
   * - Wall: above the ring, standing off the wall by more than a panel's thickness
   *   once treated, so the panel never swallows it.
   * - Desk: beside the ring on the side away from the speaker (both rays run from the
   *   speaker's side or towards the eye, which project over the area above the ring),
   *   lifted above the desk top, and above the panel once treated.
   */
  private tagPosition(m: vec3, n: vec3, speaker: vec3, head: vec3, treated: boolean): vec3 {
    const panel = treated ? this.panelThicknessCm : 0
    if (Math.abs(n.y) < 0.9) {
      return m.add(n.uniformScale(panel + 4)).add(new vec3(0, this.ringRadiusCm + 9, 0))
    }
    const toHead = head.sub(m)
    const flat = new vec3(toHead.x, 0, toHead.z)
    let side = flat.length > 1e-3 ? vec3.up().cross(flat).normalize() : vec3.right()
    const toSpeaker = speaker.sub(m)
    if (side.dot(new vec3(toSpeaker.x, 0, toSpeaker.z)) > 0) side = side.uniformScale(-1)
    const sideways = this.ringRadiusCm + 13
    return m.add(side.uniformScale(sideways)).add(new vec3(0, panel + 6, 0))
  }

  private drawReflections(camT: Transform, head: vec3, sl: vec3, sr: vec3, pulse: number): void {
    const vis = this.points
    for (let i = 0; i < vis.length; i++) {
      const p = vis[i]
      const v = p.visual
      const s = p.sourceSide === "Left" ? sl : sr
      const info = viewInfo(camT, p.res.point, this.viewWidthDeg, this.viewHeightDeg)
      p.inView = p.res.valid && info.inView
      p.yawDeg = info.yawDeg
      p.pitchDeg = info.pitchDeg
      if (!p.res.valid) {
        // Geometric validity rule: hide rather than draw in the air.
        v.setAllVisible(false)
        p.labelVisible = false
        this.pointLabels.setLabel(i, false, vec3.zero(), vec3.zero(), "", "", "untreated")
        continue
      }
      v.setAllVisible(true)
      const n = p.surface.getRect().n
      const col = p.treated ? this.successColor : this.reflectedColor
      // Direct ray (cyan) — step 2 only, fades in step 3.
      if (this.directAlpha > 0.01) {
        v.direct.setVisible(true)
        v.direct.setEnds(s, trimEnd(s, head, this.rayEyeGapCm))
        v.direct.setColor(new vec4(this.directColor.x, this.directColor.y, this.directColor.z, this.directAlpha))
      } else {
        v.direct.setVisible(false)
      }
      // Reflected ray — passes exactly through M.
      const rayA = p.treated ? 0.7 : 1
      v.incoming.setEnds(s, p.res.point)
      v.outgoing.setEnds(p.res.point, trimEnd(p.res.point, head, this.rayEyeGapCm))
      v.incoming.setColor(new vec4(col.x, col.y, col.z, rayA))
      v.outgoing.setColor(new vec4(col.x, col.y, col.z, rayA))
      // Target: small glowing dot, expands when looked at; treated = green and calmer.
      const looked = p.inView
      const radius = p.treated ? this.ringRadiusCm * 0.8 : (looked ? this.ringRadiusCm : 3.5)
      v.setTarget(p.res.point, n, 0.4 + (p.treated ? this.panelThicknessCm + 0.5 : 0),
        radius, col, p.treated ? 0.2 : pulse, p.treated ? 0.6 : 1)
      // Tag: delay + interference frequency, only while looked at.
      p.labelVisible = looked
      const tagPos = this.tagPosition(p.res.point, n, s, head, p.treated)
      const title = this.prettyName(p.id) + (p.treated ? " · treated" : " reflection")
      const body = p.res.delayMs.toFixed(1) + " ms  ·  " + Math.round(p.res.freqHz) + " Hz"
      this.pointLabels.setLabel(i, looked, tagPos, head, title, body, p.treated ? "treated" : "untreated")
    }
  }

  private prettyName(id: string): string {
    return id === "LeftWall" ? "Left wall" : id === "RightWall" ? "Right wall" : "Desk"
  }

  // ── Out-of-view guidance ──────────────────────────────────
  private updateGuidance(camT: Transform): void {
    if (this.step === 4) {
      this.guidanceArrow.hide()
      this.arrowVisible = false
      return
    }
    const untreated = this.points.filter(p => !p.treated && p.res.valid)
    const anyInView = untreated.some(p => p.inView)
    if (untreated.length === 0 || anyInView) {
      if (this.arrowVisible) this.log("arrow hidden (point in view)")
      this.guidanceArrow.hide()
      this.arrowVisible = false
      this.arrowTargetId = ""
      return
    }
    // Point towards the untreated point closest to the view centre.
    let best = untreated[0]
    let bestA = 1e9
    for (const p of untreated) {
      const a = Math.sqrt(p.yawDeg * p.yawDeg + p.pitchDeg * p.pitchDeg)
      if (a < bestA) { bestA = a; best = p }
    }
    const info = viewInfo(camT, best.res.point, this.viewWidthDeg, this.viewHeightDeg)
    this.guidanceArrow.showTowards(camT, info.dir2d, this.viewWidthDeg, this.viewHeightDeg)
    if (!this.arrowVisible) {
      this.pingTimer = 0
      this.log("arrow shown -> " + best.id)
    }
    this.pingTimer -= getDeltaTime()
    if (this.pingTimer <= 0) {
      this.audio.playPing()
      this.pingCount++
      this.pingTimer = this.pingIntervalSeconds
    }
    this.arrowVisible = true
    this.arrowTargetId = best.id
  }

  // ── Status card ────────────────────────────────────────────
  private refreshCard(): void {
    const c = this.statusCard
    const angle = this.speakerAngleDeg.toFixed(1) + "°"
    if (this.step === 1) {
      c.setStep("STEP 1 OF 3 · SPEAKER SETUP")
      if (this.sweetSpotLocked) {
        c.setStatus("Sweet Spot Locked", "success")
        c.setHint("Press Next to look for reflections.")
      } else {
        c.setStatus("Adjust speaker angle", "neutral")
        c.setHint("Pinch and drag a monitor across the desk.")
      }
      c.setDetail("Speaker angle " + angle + "  ·  target " + this.targetAngleDeg + "° ± " + this.angleToleranceDeg + "°")
      c.setNextEnabled(this.sweetSpotLocked)
      c.setFindEnabled(false)
    } else if (this.step === 2) {
      c.setStep("STEP 2 OF 3 · REFLECTION DISCOVERY")
      if (this.reflectionsFound) {
        const shown = this.points.filter(p => p.res.valid).length
        c.setStatus(shown + " reflection points found", "info")
        c.setDetail("Cyan = direct sound  ·  red = first reflection")
        c.setHint("Look at a red point to see its delay. Then press Next.")
      } else {
        c.setStatus("Reflection discovery", "neutral")
        c.setDetail("Speakers locked at " + angle)
        c.setHint("Press Find Reflections.")
      }
      c.setNextEnabled(this.reflectionsFound)
      c.setFindEnabled(!this.reflectionsFound)
    } else if (this.step === 3) {
      c.setStep("STEP 3 OF 3 · ROOM TREATMENT")
      c.setStatus(this.treatedCount + "/3 Treated", this.treatedCount > 0 ? "success" : "neutral")
      c.setDetail("Audio clarity " + Math.round((this.treatedCount / 3) * 100) + "%")
      c.setHint("Drag a panel from the rack onto a red point.")
      c.setNextEnabled(false)
      c.setFindEnabled(false)
    } else {
      c.setStep("COMPLETE")
      c.setStatus("ROOM TREATED – 3/3 REFLECTION POINTS", "success")
      c.setDetail("Audio clarity 100%  ·  all reflections absorbed")
      c.setHint("Press Reset to try a different speaker setup.")
      c.setNextEnabled(false)
      c.setFindEnabled(false)
    }
  }

  // ── Rack visual (cheap placeholder frame) ──────────────────
  private buildRack(): void {
    if (this.rackBuilt) return
    this.rackBuilt = true
    const col = new vec4(0.7, 0.72, 0.78, 1)
    const parts: [vec3, vec3][] = [
      [new vec3(0, 0, 0), new vec3(56, 3, 34)],
      [new vec3(-26, 22, -14), new vec3(3, 44, 3)],
      [new vec3(26, 22, -14), new vec3(3, 44, 3)],
      [new vec3(0, 42, -14), new vec3(56, 3, 3)],
      [new vec3(-26, -12, 0), new vec3(3, 24, 3)],
      [new vec3(26, -12, 0), new vec3(3, 24, 3)],
    ]
    for (const p of parts) {
      const v = makeVisual(this.panelRack, "RackPart", getUnitBox(), this.baseMaterial, col, false)
      v.mat.mainPass.blendMode = BlendMode.Disabled
      v.mat.mainPass.depthWrite = true
      v.obj.getTransform().setLocalPosition(p[0])
      v.obj.getTransform().setLocalScale(p[1])
    }
  }

  // ── Test / inspection surface ──────────────────────────────
  getState(): any {
    return {
      step: this.step,
      stepName: STEP_NAMES[this.step],
      sweetSpotLocked: this.sweetSpotLocked,
      speakerAngleDeg: Math.round(this.speakerAngleDeg * 100) / 100,
      reflectionsFound: this.reflectionsFound,
      treatedCount: this.treatedCount,
      arrowVisible: this.arrowVisible,
      arrowTargetId: this.arrowTargetId,
      pingCount: this.pingCount,
      audioMix: this.audio.mixTarget,
      audioMixCurrent: Math.round(this.audio.mix * 1000) / 1000,
      lastCue: this.audio.lastCue,
      card: {
        step: this.statusCard.stepLabel,
        status: this.statusCard.statusLabel,
        detail: this.statusCard.detailLabel,
        nextEnabled: this.statusCard.nextEnabled,
        findEnabled: this.statusCard.findEnabled,
      },
      points: this.points.map((p, i) => ({
        id: p.id,
        source: p.sourceSide,
        visible: this.reflectionsFound && p.res.valid,
        valid: p.res.valid,
        reason: p.res.reason,
        t: Math.round(p.res.t * 1000) / 1000,
        position: [p.res.point.x, p.res.point.y, p.res.point.z].map(v => Math.round(v * 10) / 10),
        delayMs: Math.round(p.res.delayMs * 100) / 100,
        freqHz: Math.round(p.res.freqHz),
        treated: p.treated,
        panelIndex: p.panelIndex,
        inView: p.inView,
        labelVisible: this.pointLabels.isTagVisible(i),
      })),
      monitors: [this.leftMonitor, this.rightMonitor].map(m => {
        const w = m.getTransform().getWorldPosition()
        return [w.x, w.y, w.z].map(v => Math.round(v * 10) / 10)
      }),
      head: (() => {
        const h = this.cameraObject.getTransform().getWorldPosition()
        return [h.x, h.y, h.z].map(v => Math.round(v * 10) / 10)
      })(),
    }
  }

  private log(msg: string): void {
    if (this.verboseLogs) print("[AcousticMirror] " + msg)
  }
}
