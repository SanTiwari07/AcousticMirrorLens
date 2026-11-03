import { AcousticMirrorMain } from "./AcousticMirrorMain"
import { getDisc, makeVisual } from "./AcousticMirrorMeshes"

/**
 * AcousticMirrorDemoDirector — DEBUG ONLY. Plays the whole flow on a fixed timeline for
 * recording a demo video frame by frame.
 *
 * Owns: nothing persistent. When `runOnStart` is on it sets global.amFixedDeltaTime so every
 * rendered frame advances the Lens by exactly 1/fps seconds, then drives Main through its
 * public API: eased head turns and a walk (by moving the studio around the head, the same
 * relative geometry the self-test uses), a smooth monitor drag, and panels gliding onto the
 * rings, where Main's normal 8 cm snap treats them. Prints "[Demo] mark <name> frame=<n>"
 * at each beat so the edit can be cut to the narration.
 * Must not: be required by the experience — Main never references it. Leave it off normally.
 */
@component
export class AcousticMirrorDemoDirector extends BaseScriptComponent {
  @input
  @hint("The experience orchestrator")
  main: AcousticMirrorMain

  @input
  @hint("Acoustic panel 1 (rack order)")
  panel1: SceneObject

  @input
  @hint("Acoustic panel 2")
  panel2: SceneObject

  @input
  @hint("Acoustic panel 3")
  panel3: SceneObject

  private get panels(): SceneObject[] {
    return [this.panel1, this.panel2, this.panel3]
  }

  @input
  @hint("Run the demo timeline when the lens starts")
  runOnStart: boolean = false

  @input
  @hint("Frames per second of the recording (each advance = 1/fps s of Lens time)")
  fps: number = 30

  @input
  @hint("Real seconds between advances; must be longer than one capture so every step is captured")
  realStepSeconds: number = 0.3

  @input
  @hint("Material for the frame-number stamp (any unlit material)")
  stampMaterial: Material

  private frame = 0
  private lastAdvance = -1
  private bits: Material[] = []
  private started = -1
  private baseRot: quat
  private basePos: vec3
  private yaw = 0
  private pitch = 0
  private shift = vec3.zero()
  private marks: { [k: string]: boolean } = {}
  private glide: { idx: number; from: vec3; point: number; t0: number; dur: number } | null = null

  onAwake(): void {
    if (!this.runOnStart) return
    ;(global as any).amFixedDeltaTime = 0
    this.createEvent("OnStartEvent").bind(() => this.buildStamp())
    this.createEvent("UpdateEvent").bind(() => {
      const now = getTime()
      if (this.lastAdvance >= 0 && now - this.lastAdvance < this.realStepSeconds) {
        ;(global as any).amFixedDeltaTime = 0
        return
      }
      this.lastAdvance = now
      ;(global as any).amFixedDeltaTime = 1 / this.fps
      this.tick()
      this.showStamp()
    })
  }

  /** 14-bit frame number as discs in the lower-left of the view, between two always-on anchors. */
  private buildStamp(): void {
    if (!this.stampMaterial) return
    const root = global.scene.createSceneObject("DemoStamp")
    root.setParent(this.main.cameraObject)
    // 15 cm from the eye (nearer than any scene content) along the bottom edge of the frame.
    root.getTransform().setLocalPosition(new vec3(-3.9, -4.6, -15))
    for (let i = 0; i < 16; i++) {
      const v = makeVisual(root, "bit" + i, getDisc(), this.stampMaterial, new vec4(1, 1, 1, 1))
      v.obj.getTransform().setLocalPosition(new vec3(i * 0.17, 0, 0))
      v.obj.getTransform().setLocalScale(new vec3(0.065, 0.065, 0.065))
      this.bits.push(v.mat)
    }
  }

  private showStamp(): void {
    if (this.bits.length < 16) return
    for (let i = 0; i < 14; i++) {
      const on = (this.frame >> i) & 1
      this.bits[i + 1].mainPass.baseColor = on ? new vec4(1, 1, 1, 1) : new vec4(0, 0, 0, 1)
    }
  }

  private mark(name: string): void {
    if (this.marks[name]) return
    this.marks[name] = true
    print("[Demo] mark " + name + " frame=" + this.frame + " t=" + (this.frame / this.fps).toFixed(2))
  }

  private ease(x: number): number {
    const c = Math.max(0, Math.min(1, x))
    return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2
  }

  /** Linear blend of a keyframed value; keys are [time, value], eased between keys. */
  private track(t: number, keys: number[][]): number {
    if (t <= keys[0][0]) return keys[0][1]
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        const a = keys[i - 1], b = keys[i]
        return a[1] + (b[1] - a[1]) * this.ease((t - a[0]) / (b[0] - a[0]))
      }
    }
    return keys[keys.length - 1][1]
  }

  private applyView(): void {
    const head = this.main.cameraObject.getTransform().getWorldPosition()
    const st = this.main.studioRoot.getTransform()
    const r = quat.angleAxis((this.pitch * Math.PI) / 180, vec3.right()).multiply(quat.angleAxis((this.yaw * Math.PI) / 180, vec3.up()))
    st.setWorldRotation(r.multiply(this.baseRot))
    st.setWorldPosition(head.add(r.multiplyVec3(this.basePos.sub(head))).add(r.multiplyVec3(this.shift)))
  }

  private pointPos(i: number): vec3 {
    const p = this.main.getState().points[i]
    return new vec3(p.position[0], p.position[1], p.position[2])
  }

  private startGlide(idx: number, point: number, t: number, dur: number): void {
    this.glide = { idx, from: this.panels[idx].getTransform().getWorldPosition(), point, t0: t, dur }
  }

  private tick(): void {
    this.frame++
    const s = this.main.getState()
    if (this.started < 0) {
      if (s.step !== 1 || this.frame < 10) return
      this.started = this.frame
      const st = this.main.studioRoot.getTransform()
      this.baseRot = st.getWorldRotation()
      this.basePos = st.getWorldPosition()
      this.mark("start")
    }
    const t = (this.frame - this.started) / this.fps
    const card = this.main.statusCard

    // Head: yaw (+ right), pitch (+ down), walk (cm, studio shift).
    this.yaw = this.track(t, [[0, 0], [3, 0], [5, -20], [11, -20], [13, 0], [19, 0], [22.5, -64], [38, -64],
      [41, -26], [44, -26], [46.5, 0], [48, 0], [50.5, -50], [51.5, -50], [55, -64], [58, -64], [62, 64], [65.5, 64],
      [68.5, -26], [72.5, -26], [75.5, 0]])
    this.pitch = this.track(t, [[0, 0], [3, 0], [5, 10], [11, 10], [13, 0], [38, 0], [41, 22], [44, 22], [46.5, 0],
      [48, 0], [50.5, 15], [51.5, 15], [55, 0], [65.5, 0], [68.5, 22], [72.5, 22], [75.5, 0]])
    const walk = this.track(t, [[0, 0], [27, 0], [30, -25], [31, -25], [35, 25], [36, 25], [38, 0]])
    this.shift = new vec3(0, 0, walk)
    this.applyView()

    // Step 1: drag the monitors from 45 to 60 degrees.
    if (t >= 5 && t <= 9.2) {
      this.mark("drag")
      this.main.setMonitorsForAngle(this.track(t, [[5, 45], [9, 60]]))
    }
    if (s.sweetSpotLocked) this.mark("locked")
    if (t >= 14.5 && s.step === 1) { card.pressNext(); this.mark("next_step2") }
    if (t >= 15.5 && s.step === 2 && !s.reflectionsFound) { card.pressFindReflections(); this.mark("find_reflections") }
    if (t >= 19) this.mark("turn_left")
    if (t >= 22.5) this.mark("left_wall")
    if (t >= 27) this.mark("walk")
    if (t >= 38) this.mark("desk_point")
    if (t >= 46.5 && s.step === 2) { card.pressNext(); this.mark("next_step3") }
    if (t >= 48) this.mark("look_rack")

    // Step 3: glide panels onto the rings; Main's 8 cm snap does the rest.
    if (t >= 51.5 && !this.marks["glide1"]) { this.mark("glide1"); this.startGlide(0, 0, t, 3.5) }
    if (t >= 58 && !this.marks["glide2"]) { this.mark("glide2"); this.startGlide(1, 1, t, 4.5) }
    if (t >= 68.5 && !this.marks["glide3"]) { this.mark("glide3"); this.startGlide(2, 2, t, 3.5) }
    const g = this.glide
    if (g) {
      const k = this.ease((t - g.t0) / g.dur)
      const pt = s.points[g.point]
      if (pt.treated) {
        this.glide = null
      } else {
        const target = this.pointPos(g.point)
        const lift = new vec3(0, 18 * Math.sin(Math.PI * k), 0)
        this.panels[g.idx].getTransform().setWorldPosition(vec3.lerp(g.from, target, k).add(lift))
      }
    }
    if (s.treatedCount >= 1) this.mark("treated1")
    if (s.treatedCount >= 2) this.mark("treated2")
    if (s.step === 4) this.mark("complete")
    if (t >= 80) this.mark("end")
  }
}
