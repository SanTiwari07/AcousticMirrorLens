import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { expect } from "Leaf.lspkg/Utils/common/Expect"
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils"
import { DEG, gotoReflectionsFound, LeafHead, log, main, st, studioDir, v3, waitReady } from "./AcousticMirrorLeafHelpers"

const HALF_W = 16 // SPECS view 32° wide
const HALF_H = 18.5 // SPECS view 37° tall

/** Yaw/pitch (deg) of world point p in the camera frame; + yaw = right, + pitch = up. */
function camAngles(p: vec3): { yaw: number, pitch: number, inView: boolean, local: vec3 } {
  const camT = main().cameraObject.getTransform()
  const local = camT.getWorldRotation().invert().multiplyVec3(p.sub(camT.getWorldPosition()))
  const fwd = -local.z
  const yaw = Math.atan2(local.x, fwd) * DEG
  const pitch = Math.atan2(local.y, Math.sqrt(local.x * local.x + fwd * fwd)) * DEG
  return { yaw, pitch, inView: fwd > 0 && Math.abs(yaw) <= HALF_W && Math.abs(pitch) <= HALF_H, local }
}

/**
 * Done criterion 6 (PRIORITY) — Out-of-view guidance arrow.
 * Turns the REAL world camera (LEAF HeadController, the head driver used by LEAF's IK
 * interactor) using SPECS' real view size (32° wide × 37° tall) as the in-view test:
 *  1. look at the LeftWall reflection point → point in view, arrow hidden;
 *  2. turn AWAY from it (no untreated point within 32°×37°) → arrow shown at the view edge,
 *     inside the visible window, pointing towards a point, and a ping plays;
 *  3. turn back TOWARDS the LeftWall point → arrow hidden, point in view, tag visible.
 * Every in-view verdict is re-derived independently in the test from the camera pose.
 */
@component
export class AMC6OutOfViewArrowScenario extends Scenario {
  async run(): Promise<void> {
    await waitReady()
    const ix = new DefaultLeafInteractor()
    await gotoReflectionsFound(ix)
    const m = main()
    const arrowVisual = findSceneObjectByName("ArrowVisual")
    expect(!!arrowVisual, "ArrowVisual exists under GuidanceArrow").toBe(true)
    const head = new LeafHead()
    const LW = 0
    try {
      // Facing the desk at start: arrow state must agree with the in-view test.
      const s0 = st()
      const anyIn0 = s0.points.some((p: any) => camAngles(v3(p.position)).inView)
      log("C6 facing desk: arrow=" + s0.arrowVisible + " anyInView=" + anyIn0 + " lens inView=" + s0.points.map((p: any) => p.inView))
      expect(s0.arrowVisible, "facing desk: arrow shown iff no point in the 32x37 view").toBe(!anyIn0)
      const lwAngle0 = camAngles(v3(s0.points[LW].position))
      log("C6 LeftWall point from desk view: yaw=" + lwAngle0.yaw.toFixed(1) + " pitch=" + lwAngle0.pitch.toFixed(1))
      expect(lwAngle0.inView, "side-wall point is outside the view while facing the desk").toBe(false)

      // 1. Look at the LeftWall point.
      const lwPos = v3(st().points[LW].position)
      expect(await head.lookAt(lwPos), "camera turned towards LeftWall point").toBe(true)
      const s1 = st()
      log("C6 at LeftWall: arrow=" + s1.arrowVisible + " inView=" + s1.points[LW].inView)
      expect(camAngles(lwPos).inView, "LeftWall point inside the 32x37 view (independent)").toBe(true)
      expect(s1.points[LW].inView, "lens agrees LeftWall point in view").toBe(true)
      expect(s1.arrowVisible, "arrow hidden while the point is in view").toBe(false)
      expect(arrowVisual.enabled, "ArrowVisual disabled while the point is in view").toBe(false)

      // 2. Turn AWAY from the side-wall point: straight ahead and up (walls ±~60°, desk below).
      const pingsBefore = st().pingCount
      expect(await head.lookDir(studioDir(10, 45)), "camera turned away").toBe(true)
      await sleep(400)
      const s2 = st()
      const angs = s2.points.map((p: any) => camAngles(v3(p.position)))
      log("C6 turned away: arrow=" + s2.arrowVisible + " target=" + s2.arrowTargetId + " pings " + pingsBefore + "->" + s2.pingCount +
        " point angles=" + angs.map((a: any) => a.yaw.toFixed(0) + "/" + a.pitch.toFixed(0)).join(" "))
      expect(angs.every((a: any) => !a.inView), "precondition: no reflection point inside the 32x37 view").toBe(true)
      expect(s2.points.every((p: any) => !p.inView), "lens agrees: no point in view").toBe(true)
      expect(s2.arrowVisible, "arrow SHOWN when the point is out of view").toBe(true)
      expect(m.guidanceArrow.isVisible, "GuidanceArrow component visible").toBe(true)
      expect(arrowVisual.enabled, "ArrowVisual SceneObject enabled").toBe(true)
      expect(s2.pingCount > pingsBefore, "subtle ping played when the arrow appeared").toBe(true)
      expect(s2.arrowTargetId !== "", "arrow has a target point").toBe(true)

      // Arrow sits at the edge of, but inside, the view window, and points towards its target.
      const arrowPos = arrowVisual.getTransform().getWorldPosition()
      const aa = camAngles(arrowPos)
      const ellipse = Math.sqrt((aa.yaw / HALF_W) * (aa.yaw / HALF_W) + (aa.pitch / HALF_H) * (aa.pitch / HALF_H))
      log("C6 arrow at yaw=" + aa.yaw.toFixed(1) + " pitch=" + aa.pitch.toFixed(1) + " ellipse r=" + ellipse.toFixed(2))
      expect(aa.inView, "arrow drawn inside the visible window").toBe(true)
      expect(ellipse > 0.6, "arrow sits near the edge of the view (r=" + ellipse.toFixed(2) + ")").toBe(true)
      const tgt = s2.points.find((p: any) => p.id === s2.arrowTargetId)
      const tl = camAngles(v3(tgt.position)).local
      const want = new vec2(tl.x, tl.y).normalize()
      const got = new vec2(aa.local.x, aa.local.y).normalize()
      const dot = want.x * got.x + want.y * got.y
      expect(dot > 0.95, "arrow points towards " + tgt.id + " (cos=" + dot.toFixed(3) + ")").toBe(true)

      // 3. Turn back TOWARDS the side-wall point.
      expect(await head.lookAt(lwPos), "camera turned back towards LeftWall point").toBe(true)
      await sleep(300)
      const s3 = st()
      log("C6 turned back: arrow=" + s3.arrowVisible + " inView=" + s3.points[LW].inView + " label=" + s3.points[LW].labelVisible)
      expect(camAngles(lwPos).inView, "LeftWall point in view after turning back (independent)").toBe(true)
      expect(s3.points[LW].inView, "lens: LeftWall point in view").toBe(true)
      expect(s3.arrowVisible, "arrow HIDDEN after turning towards the point").toBe(false)
      expect(arrowVisual.enabled, "ArrowVisual disabled after turning back").toBe(false)
      expect(s3.points[LW].visible, "reflection point visible").toBe(true)
      expect((m as any).points[LW].visual.root.isEnabledInHierarchy !== false, "point visual enabled").toBe(true)
      expect(s3.points[LW].labelVisible, "point tag visible").toBe(true)
    } finally {
      await head.restore()
    }
  }
}
