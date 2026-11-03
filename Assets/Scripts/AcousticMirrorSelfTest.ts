import { AcousticMirrorMain } from "./AcousticMirrorMain"

/**
 * AcousticMirrorSelfTest — DEBUG ONLY. Scripted walkthrough of the whole flow in preview.
 *
 * Owns: nothing persistent. When `runOnStart` is on it drives Main through its public
 * API (monitor placement, Next, Find Reflections, panel placement, Reset) and simulates
 * head motion by moving/rotating the studio around the head (same relative geometry),
 * printing PASS/FAIL lines per done criterion. Leave `runOnStart` off for normal use.
 * Must not: be required by the experience — Main never references it.
 */
@component
export class AcousticMirrorSelfTest extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">AcousticMirrorSelfTest – debug walkthrough (off by default)</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("The experience orchestrator")
  main: AcousticMirrorMain
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Debug</span>')
  @ui.group_start("Debug")
  @input
  @hint("Run the scripted walkthrough when the lens starts")
  runOnStart: boolean = false

  @input
  @hint("Seconds between walkthrough steps (raise to take screenshots)")
  @widget(new SliderWidget(0.3, 10, 0.1))
  stepSeconds: number = 1.2

  @input
  @hint("Stop the walkthrough after this many steps (for screenshots). 99 = run all")
  @widget(new SliderWidget(0, 99, 1))
  holdAtStep: number = 99

  @input
  @hint("While holding, turn the view by this many degrees (+ = look right)")
  @widget(new SliderWidget(-180, 180, 1))
  holdViewYawDeg: number = 0

  @input
  @hint("While holding, look down/up by this many degrees (+ = look down)")
  @widget(new SliderWidget(-60, 60, 1))
  holdViewPitchDeg: number = 0
  @ui.group_end

  private t = 0
  private idx = 0
  private nextAt = 2
  private baseRot: quat
  private basePos: vec3
  private results: string[] = []
  private store: any = {}

  onAwake(): void {
    if (!this.runOnStart) return
    this.createEvent("UpdateEvent").bind(() => this.tick())
  }

  private st(): any { return this.main.getState() }
  private check(name: string, ok: boolean, info: string = ""): void {
    const line = (ok ? "PASS " : "FAIL ") + name + (info ? " :: " + info : "")
    this.results.push(line)
    print("[SelfTest] " + line)
  }

  /** Rotate (deg, about +Y) and translate the studio around the head — equivalent to the inverse head motion. */
  private moveWorld(yawDeg: number, shift: vec3, pitchDeg: number = 0): void {
    const head = this.main.cameraObject.getTransform().getWorldPosition()
    const st = this.main.studioRoot.getTransform()
    const r = quat.angleAxis((pitchDeg * Math.PI) / 180, vec3.right()).multiply(quat.angleAxis((yawDeg * Math.PI) / 180, vec3.up()))
    st.setWorldRotation(r.multiply(this.baseRot))
    st.setWorldPosition(head.add(r.multiplyVec3(this.basePos.sub(head))).add(shift))
  }

  private tick(): void {
    this.t += getDeltaTime()
    if (this.idx >= this.holdAtStep && this.baseRot) {
      // Rotating the world by -64 deg brings the left wall in front, so +yaw here looks right.
      this.moveWorld(this.holdViewYawDeg, vec3.zero(), this.holdViewPitchDeg)
      return
    }
    if (this.t < this.nextAt) return
    this.nextAt = this.t + this.stepSeconds
    const m = this.main
    const card = m.statusCard
    const steps: (() => void)[] = [
      () => {
        const st = m.studioRoot.getTransform()
        this.baseRot = st.getWorldRotation()
        this.basePos = st.getWorldPosition()
        const s = this.st()
        print("[SelfTest] initial " + JSON.stringify(s))
        this.check("C1.start step1 unlocked", s.step === 1 && !s.sweetSpotLocked, "angle=" + s.speakerAngleDeg)
        this.check("C1.next disabled before lock", !s.card.nextEnabled)
        m.setMonitorsForAngle(52)
      },
      () => {
        const s = this.st()
        this.check("C1.not locked at 52deg", !s.sweetSpotLocked, "angle=" + s.speakerAngleDeg)
        m.setMonitorsForAngle(60)
      },
      () => {
        const s = this.st()
        this.check("C1.locked at 60deg", s.sweetSpotLocked, "angle=" + s.speakerAngleDeg)
        this.check("C1.chime", s.lastCue === "lockChime")
        this.check("C1.card Sweet Spot Locked", s.card.status === "Sweet Spot Locked")
        this.check("C1.next enabled", s.card.nextEnabled)
        card.pressNext()
      },
      () => {
        const s = this.st()
        this.check("C2.step2", s.step === 2 && !s.reflectionsFound)
        card.pressFindReflections()
      },
      () => {
        const s = this.st()
        print("[SelfTest] reflections " + JSON.stringify(s.points))
        this.check("C2.three points visible", s.points.filter((p: any) => p.visible).length === 3)
        for (const p of s.points) {
          this.check("C2." + p.id + " valid 0<t<1", p.valid && p.t > 0 && p.t < 1, "t=" + p.t + " pos=" + p.position + " " + p.delayMs + "ms " + p.freqHz + "Hz")
        }
        this.check("C6.arrow shown facing desk (no point in view)", s.arrowVisible === !s.points.some((p: any) => p.inView), "arrow=" + s.arrowVisible + " target=" + s.arrowTargetId)
        this.store.leftPos = s.points[0].position
        this.moveWorld(-64, vec3.zero()) // == turning the head ~64deg left, towards the left wall point
      },
      () => {
        const s = this.st()
        const lw = s.points[0]
        this.check("C6.left wall point in view after turning", lw.inView, "inView=" + lw.inView)
        this.check("C6.arrow hidden after turning", !s.arrowVisible)
        this.check("C2.label shown when looked at", lw.labelVisible)
        this.moveWorld(0, vec3.zero())
      },
      () => {
        const s = this.st()
        this.check("C6.arrow back after turning away", s.arrowVisible || s.points.some((p: any) => p.inView), "arrow=" + s.arrowVisible)
        this.check("C6.ping played", s.pingCount > 0, "pings=" + s.pingCount)
        this.moveWorld(0, new vec3(30, 0, 0)) // == walking 30 cm to the left
      },
      () => {
        const s = this.st()
        const before = this.store.leftPos
        const after = s.points[0].position
        const moved = Math.abs(before[2] - after[2]) + Math.abs(before[1] - after[1])
        this.check("C3.points recalc with head position", moved > 1, "before=" + before + " after=" + after)
        this.moveWorld(0, vec3.zero())
      },
      () => {
        card.pressNext()
      },
      () => {
        const s = this.st()
        this.check("C4.step3", s.step === 3, "status=" + s.card.status)
        m.movePanelToPoint(0, "LeftWall")
      },
      () => {
        const s = this.st()
        this.check("C4.snap LeftWall -> 1/3", s.treatedCount === 1 && s.points[0].treated, "status=" + s.card.status)
        this.check("C4.audio mix 1/3", Math.abs(s.audioMix - 1 / 3) < 0.01, "mix=" + s.audioMix)
        m.movePanelToPoint(1, "RightWall")
      },
      () => {
        m.movePanelToPoint(2, "Desk")
      },
      () => {
        const s = this.st()
        this.check("C5.all treated", s.treatedCount === 3 && s.step === 4)
        this.check("C5.card room treated", s.card.status === "ROOM TREATED – 3/3 REFLECTION POINTS", s.card.status)
        this.check("C5.complete chime", s.lastCue === "completeChime")
        this.check("C5.audio clean", s.audioMix === 1, "mix=" + s.audioMix + " current=" + s.audioMixCurrent)
        this.check("C5.arrow hidden at completion", !s.arrowVisible)
        card.pressReset()
      },
      () => {
        const s = this.st()
        this.check("C5.reset step1", s.step === 1 && s.treatedCount === 0 && !s.reflectionsFound)
        this.check("C5.reset audio hollow", s.audioMix === 0)
        print("[SelfTest] after reset " + JSON.stringify(s))
        const fails = this.results.filter(r => r.indexOf("FAIL") === 0).length
        print("[SelfTest] DONE " + (this.results.length - fails) + "/" + this.results.length + " passed")
      },
    ]
    if (this.idx < steps.length) {
      steps[this.idx]()
      this.idx++
    }
  }
}
