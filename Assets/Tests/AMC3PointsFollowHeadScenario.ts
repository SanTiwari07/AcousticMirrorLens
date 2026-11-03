import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { expect } from "Leaf.lspkg/Utils/common/Expect"
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import { sleep } from "Leaf.lspkg/Utils/common/Utils"
import {
  beamEnds, expectedReflection, fmt, gotoReflectionsFound, LeafHead, log, main, sourceFor, st, studioDir, surfaceFor, v3, waitReady,
} from "./AcousticMirrorLeafHelpers"

/**
 * Done criterion 3 — Reflection points follow the head.
 * Moves the real world camera sideways (LEAF HeadController position target — the same
 * head-driving LEAF's IK interactor uses) 30 cm left, then 30 cm right, then forward.
 * Asserts the points and the reflected-ray endpoints move, and still match an independent
 * image-source solve for the NEW head position (live calculation, not pre-recorded).
 */
@component
export class AMC3PointsFollowHeadScenario extends Scenario {
  async run(): Promise<void> {
    await waitReady()
    const ix = new DefaultLeafInteractor()
    await gotoReflectionsFound(ix)
    const m = main()
    const head = new LeafHead()
    const start = head.position
    const fwd = studioDir(0, 0)
    const right = m.studioRoot.getTransform().getWorldRotation().multiplyVec3(vec3.right())
    const base = st()

    const checkAt = async (label: string, pos: vec3): Promise<void> => {
      const moved = await head.lookAt(pos.add(fwd.uniformScale(300)), pos)
      await sleep(300)
      const s = st()
      const H = v3(s.head)
      log("C3 " + label + " head=" + fmt(H) + " (wanted " + fmt(pos) + ") points=" + JSON.stringify(s.points.map((p: any) => p.position)))
      expect(moved, "camera moved to " + label).toBe(true)
      expect(H.distance(pos) < 1, "head position read by the lens follows the camera (" + label + ")").toBe(true)
      for (let i = 0; i < 3; i++) {
        const p = s.points[i]
        const b = base.points[i]
        const delta = v3(p.position).distance(v3(b.position))
        expect(p.valid, p.id + " still valid at " + label).toBe(true)
        expect(delta > 1, p.id + " moved with the head at " + label + " (" + delta.toFixed(1) + "cm)").toBe(true)
        const e = expectedReflection(sourceFor(p.id, s), H, surfaceFor(p.id))
        const err = v3(p.position).distance(e.point)
        expect(err < 0.5, p.id + " recalculated for the new head position at " + label + " (err " + err.toFixed(2) + "cm)").toBe(true)
        expect(Math.abs(p.delayMs - e.delayMs) < 0.05, p.id + " delay recalculated at " + label).toBe(true)
        // Reflected ray endpoint follows M.
        const vis = (m as any).points[i].visual
        const inc = beamEnds(vis.incoming.obj)
        const out = beamEnds(vis.outgoing.obj)
        const M = v3(p.position)
        expect(inc[1].distance(M) < 0.5 && out[0].distance(M) < 0.5,
          p.id + " reflected ray bounces at the new M (in-end " + inc[1].distance(M).toFixed(2) + ", out-start " + out[0].distance(M).toFixed(2) + ")").toBe(true)
      }
    }

    try {
      await checkAt("30cm left", start.add(right.uniformScale(-30)))
      await checkAt("30cm right", start.add(right.uniformScale(30)))
      await checkAt("20cm forward", start.add(fwd.uniformScale(20)))
    } finally {
      await head.restore()
    }
    await sleep(300)
    const back = st()
    for (let i = 0; i < 3; i++) {
      const d = v3(back.points[i].position).distance(v3(base.points[i].position))
      expect(d < 1, back.points[i].id + " returns when the head returns (" + d.toFixed(2) + "cm)").toBe(true)
    }
  }
}
