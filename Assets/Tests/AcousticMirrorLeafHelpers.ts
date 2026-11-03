import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import { findInteractableByName } from "Leaf.lspkg/Interactors/InteractableUtils"
import { HeadController } from "Leaf.lspkg/IKSolver/HeadController"
import { PoseTransform } from "Leaf.lspkg/IKSolver/PoseTransform"
import { UpdateDispatcher } from "Leaf.lspkg/Utils/common/UpdateDispatcher"
import { nextFrame, sleep, withTimeout } from "Leaf.lspkg/Utils/common/Utils"
import { AcousticMirrorMain } from "../Scripts/AcousticMirrorMain"
import { SurfaceRect } from "../Scripts/AcousticMirrorGeometry"

/**
 * Shared helpers for the AcousticMirror LEAF scenarios.
 * Test-only: never referenced by the Lens itself.
 */

export const TARGET_ANGLE = 60
let DRAG_TRACE = false
export function setDragTrace(on: boolean): void { DRAG_TRACE = on }
export const DEG = 180 / Math.PI

export function main(): AcousticMirrorMain {
  const m = (global as any).acousticMirror as AcousticMirrorMain
  if (!m) throw new Error("global.acousticMirror not found — AcousticMirrorMain did not start")
  return m
}

export function st(): any {
  return main().getState()
}

export function log(msg: string): void {
  print("[AMTest] " + msg)
}

/** Poll every frame until cond() is true or timeout. Returns whether it became true. */
export async function waitFor(cond: () => boolean, timeoutMs: number = 3000): Promise<boolean> {
  const end = getTime() + timeoutMs / 1000
  while (getTime() < end) {
    if (cond()) return true
    await nextFrame()
  }
  return cond()
}

export async function waitReady(): Promise<void> {
  const ok = await waitFor(() => !!(global as any).acousticMirror && (main() as any).ready === true, 5000)
  if (!ok) throw new Error("AcousticMirrorMain never became ready")
  await sleep(300)
}

export function v3(a: number[]): vec3 {
  return new vec3(a[0], a[1], a[2])
}

/** RGB channels within tolerance (alpha ignored — beams fade). */
export function rgbClose(a: vec4, b: vec4, tol: number = 0.02): boolean {
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.z - b.z) <= tol
}

/** World endpoints [a, b] of a Beam (unit box stretched along local Z between a and b). */
export function beamEnds(obj: SceneObject): vec3[] {
  const t = obj.getTransform()
  const c = t.getWorldPosition()
  const half = t.getWorldRotation().multiplyVec3(new vec3(0, 0, t.getWorldScale().z / 2))
  return [c.sub(half), c.add(half)]
}

export function fmt(v: vec3): string {
  return "(" + v.x.toFixed(1) + ", " + v.y.toFixed(1) + ", " + v.z.toFixed(1) + ")"
}

// ── Real SIK input via LEAF ─────────────────────────────────────

/** Clear a LEAF interactor's override state after a drag that never got its DragEnd. */
function unstick(ix: DefaultLeafInteractor): void {
  const a = ix as any
  a.overrideTrigger = 0
  a.overrideDragVector = undefined
  a.overrideInteractable = undefined
  try { a.resetStartEndPoint() } catch (e) { /* ignore */ }
}

/** Real SIK trigger on a UIKit button through the LEAF interactor. */
export async function tap(ix: DefaultLeafInteractor, name: string): Promise<void> {
  const btn = findInteractableByName(name, undefined, true)
  if (!btn) throw new Error("Button '" + name + "' not found or not enabled")
  await withTimeout(ix.trigger(btn), 4000, "trigger '" + name + "' timed out")
  await sleep(250)
}

/**
 * One real SIK drag. Returns false if the drag never ended (e.g. the target got locked
 * mid-drag because it snapped) — the interactor is then unstuck.
 */
export async function dragOnce(ix: DefaultLeafInteractor, name: string, perFrame: vec3, durationMs: number): Promise<boolean> {
  const it = findInteractableByName(name, undefined, true)
  if (!it) throw new Error("Interactable '" + name + "' not found or not enabled")
  const trace: string[] = []
  const unsub = DRAG_TRACE ? UpdateDispatcher.getInstance().onLateUpdate.add(() => {
    const p = toStudio(it.getTransform().getWorldPosition())
    trace.push(p.x.toFixed(1) + "/" + p.z.toFixed(1))
  }) : null
  try {
    await withTimeout(ix.drag(it, perFrame, durationMs), durationMs + 2500, "drag timeout")
    if (unsub) { unsub(); log("trace " + name + " per=" + fmt(perFrame) + ": " + trace.join(" ")) }
    return true
  } catch (e) {
    if (unsub) unsub()
    log("drag on " + name + " did not end normally (" + e + ") — unsticking interactor")
    unstick(ix)
    await sleep(200)
    return false
  }
}

/**
 * Closed-loop ("servo") real drag. One real SIK pinch-drag through the LEAF interactor;
 * LEAF adds the same `dragVector` object to the ray every frame, so we steer it in place
 * each frame towards target() (max `speed` cm/frame) and zero it once done() is true —
 * the hand then holds still until the drag releases. Repeats up to maxIters drags.
 * (Needed because each SIK grab first pulls the prop towards the simulated ray's anchor.)
 */
export async function dragTowards(
  ix: DefaultLeafInteractor,
  name: string,
  obj: SceneObject,
  target: () => vec3,
  done: () => boolean,
  maxIters: number = 4,
  durationMs: number = 1800,
  speed: number = 2.5,
): Promise<number> {
  let iters = 0
  for (let i = 0; i < maxIters; i++) {
    if (done()) break
    const it = findInteractableByName(name, undefined, true)
    if (!it) throw new Error("Interactable '" + name + "' not found or not enabled")
    // LEAF moves its simulated ray by `per` on every onDragUpdate; we add a steering step on
    // the same event (same mechanism), so the hand follows target() and stops when done().
    const d0 = target().sub(obj.getTransform().getWorldPosition())
    const per = d0.length > 1e-3 ? d0.normalize().uniformScale(0.01) : new vec3(0.01, 0, 0)
    let frozen = false
    let steps = 0
    const a = ix as any
    const unsub = it.onDragUpdate.add(() => {
      if (frozen || done()) { frozen = true; return }
      const d = target().sub(obj.getTransform().getWorldPosition())
      let step = d.uniformScale(0.35)
      if (step.length > speed) step = step.normalize().uniformScale(speed)
      a.startPoint = a.startPoint.add(step)
      a.endPoint = a.endPoint.add(step)
      steps++
    })
    let ended = false
    try {
      ended = await dragOnce(ix, name, per, durationMs)
    } finally {
      unsub()
    }
    log("drag " + name + " steering steps=" + steps)
    iters++
    await sleep(200)
    log("drag " + name + " #" + i + " frozen=" + frozen + " done=" + done() + " dist=" + obj.getTransform().getWorldPosition().distance(target()).toFixed(1))
    if (done() || !ended) break
  }
  return iters
}

/** Studio-local position of a world point. */
export function toStudio(p: vec3): vec3 {
  return main().studioRoot.getTransform().getInvertedWorldTransform().multiplyPoint(p)
}
export function fromStudio(p: vec3): vec3 {
  return main().studioRoot.getTransform().getWorldTransform().multiplyPoint(p)
}

/**
 * World position the RightMonitor must be at (left monitor fixed) for the speakers to
 * form exactly TARGET_ANGLE at the head, in the horizontal plane.
 */
export function rightMonitorTargetFor(angleDeg: number): vec3 {
  const m = main()
  const h = toStudio(m.cameraObject.getTransform().getWorldPosition())
  const l = toStudio(m.leftMonitor.getTransform().getWorldPosition())
  const r = toStudio(m.rightMonitor.getTransform().getWorldPosition())
  const aLeft = Math.atan2(h.x - l.x, h.z - l.z)
  const aRight = angleDeg / DEG - aLeft
  const x = h.x + (h.z - r.z) * Math.tan(aRight)
  return fromStudio(new vec3(x, r.y, r.z))
}

/** Real drag of the RightMonitor until the sweet spot locks. */
export async function dragMonitorsToLock(ix: DefaultLeafInteractor): Promise<number> {
  const m = main()
  return dragTowards(ix, "RightMonitor", m.rightMonitor.getSceneObject(),
    () => rightMonitorTargetFor(TARGET_ANGLE), () => st().sweetSpotLocked)
}

/** Press Reset (real button) and wait for step 1. */
export async function resetLens(ix: DefaultLeafInteractor): Promise<void> {
  await tap(ix, "ResetButton")
  const ok = await waitFor(() => { const s = st(); return s.step === 1 && !s.reflectionsFound && s.treatedCount === 0 }, 2000)
  if (!ok) throw new Error("Reset did not return to step 1: " + JSON.stringify(st().card))
  await sleep(300)
}

/** Reset → real drag to lock → Next → Find Reflections (all real input). */
export async function gotoReflectionsFound(ix: DefaultLeafInteractor): Promise<void> {
  await resetLens(ix)
  await dragMonitorsToLock(ix)
  if (!st().sweetSpotLocked) throw new Error("Could not lock sweet spot by dragging; angle=" + st().speakerAngleDeg)
  await tap(ix, "NextButton")
  if (!(await waitFor(() => st().step === 2, 2000))) throw new Error("Next did not enter step 2")
  await tap(ix, "FindReflectionsButton")
  if (!(await waitFor(() => st().reflectionsFound, 2000))) throw new Error("Find Reflections did not run")
  await sleep(300)
}

/** Real drag of a panel onto a point until it is treated. */
export async function dragPanelToPoint(ix: DefaultLeafInteractor, panelIdx: number, pointId: string): Promise<void> {
  const m = main()
  const panelName = "AcousticPanel" + (panelIdx + 1)
  const panelObj = (m as any).panels[panelIdx].getSceneObject() as SceneObject
  const surface = pointId === "LeftWall" ? m.leftWall : pointId === "RightWall" ? m.rightWall : m.desk
  const pointOf = () => st().points.find((p: any) => p.id === pointId)
  await dragTowards(ix, panelName, panelObj,
    () => v3(pointOf().position).add(surface.getRect().n.uniformScale(3)),
    () => pointOf().treated)
}

// ── Reflection maths (independent re-derivation, image-source method) ──

export interface Expected {
  point: vec3
  t: number
  delayMs: number
  freqHz: number
}

export function speakerPos(monitorWorld: vec3): vec3 {
  const m = main()
  const n = m.desk.getRect().n
  return monitorWorld.add(n.uniformScale(m.acousticCenterHeightCm - m.monitorHeightCm / 2))
}

export function expectedReflection(S: vec3, H: vec3, r: SurfaceRect): Expected {
  const n = r.n
  const Sp = S.sub(n.uniformScale(2 * S.sub(r.p0).dot(n)))
  const t = r.p0.sub(Sp).dot(n) / H.sub(Sp).dot(n)
  const M = Sp.add(H.sub(Sp).uniformScale(t))
  const dd = S.distance(M) + M.distance(H) - S.distance(H)
  const dt = dd / 100 / 343
  return { point: M, t, delayMs: dt * 1000, freqHz: 1 / (2 * dt) }
}

export function surfaceFor(id: string): SurfaceRect {
  const m = main()
  return (id === "LeftWall" ? m.leftWall : id === "RightWall" ? m.rightWall : m.desk).getRect()
}

export function sourceFor(id: string, s: any): vec3 {
  const m = main()
  const deskLeft = m.deskSourceMonitor !== "Right"
  const left = id === "LeftWall" || (id === "Desk" && deskLeft)
  return speakerPos(v3(s.monitors[left ? 0 : 1]))
}

// ── Head (camera) control, using LEAF's own IK HeadController on the world camera ──

/**
 * Drives the real world camera transform the same way LEAF's IKBodyInteractor does
 * (HeadController physics + PoseTransform.apply in Update). Turning the head = rotating
 * the camera; walking = moving it.
 */
export class LeafHead {
  private ctrl = new HeadController()
  private pose: PoseTransform
  private unsub: () => void
  readonly startPos: vec3
  readonly startRot: quat

  constructor() {
    const camT = main().cameraObject.getTransform()
    this.pose = new PoseTransform(camT)
    this.startPos = camT.getWorldPosition()
    this.startRot = camT.getWorldRotation()
    this.unsub = UpdateDispatcher.getInstance().onUpdate.add(() => {
      const p = this.ctrl.update(getDeltaTime(), this.pose.toPose())
      if (p !== undefined) this.pose.apply(p)
    })
  }

  get position(): vec3 { return main().cameraObject.getTransform().getWorldPosition() }
  get forward(): vec3 { return main().cameraObject.getTransform().getWorldRotation().multiplyVec3(new vec3(0, 0, -1)) }

  /** Angle (deg) between the view direction and the direction to p. */
  angleTo(p: vec3): number {
    const d = p.sub(this.position).normalize()
    return Math.acos(Math.max(-1, Math.min(1, d.dot(this.forward)))) * DEG
  }

  /** Turn (and optionally walk) so the camera looks at `lookAt`. */
  async lookAt(lookAt: vec3, position?: vec3, timeoutMs: number = 5000): Promise<boolean> {
    this.ctrl.setTarget(lookAt, position)
    const ok = await waitFor(() =>
      this.angleTo(lookAt) < 1.0 && (position === undefined || this.position.distance(position) < 0.5), timeoutMs)
    await sleep(250) // let Main's LateUpdate settle on the new pose
    return ok
  }

  /** Look along a world direction from the current (or given) position. */
  async lookDir(dir: vec3, position?: vec3): Promise<boolean> {
    const from = position ?? this.position
    return this.lookAt(from.add(dir.normalize().uniformScale(300)), position)
  }

  /** Turn/walk back to the starting pose, then stop driving the camera. */
  async restore(): Promise<void> {
    const fwd = this.startRot.multiplyVec3(new vec3(0, 0, -1))
    await this.lookAt(this.startPos.add(fwd.uniformScale(300)), this.startPos, 4000)
    this.unsub()
    const camT = main().cameraObject.getTransform()
    camT.setWorldPosition(this.startPos)
    camT.setWorldRotation(this.startRot)
    await sleep(200)
  }
}

/** Studio-frame direction: yaw (+ = right) and pitch (+ = up) in degrees from studio forward. */
export function studioDir(yawDeg: number, pitchDeg: number): vec3 {
  const y = yawDeg / DEG
  const p = pitchDeg / DEG
  const local = new vec3(Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p))
  return main().studioRoot.getTransform().getWorldRotation().multiplyVec3(local)
}
