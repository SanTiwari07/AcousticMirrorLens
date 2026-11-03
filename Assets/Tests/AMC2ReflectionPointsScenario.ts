import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { expect } from "Leaf.lspkg/Utils/common/Expect"
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import { sleep } from "Leaf.lspkg/Utils/common/Utils"
import {
  expectedReflection, fmt, gotoReflectionsFound, LeafHead, log, main, rgbClose, sourceFor, st, studioDir, surfaceFor, v3, waitReady,
} from "./AcousticMirrorLeafHelpers"

/**
 * Done criterion 2 — Reflection points appear.
 * Real input: drag-to-lock, Next and Find Reflections buttons (LEAF SIK triggers).
 * Asserts: 3 points on LeftWall/RightWall/Desk, 0<t<1, each point on its surface plane and
 * inside its rectangle, matches an independent image-source re-derivation (so the reflected
 * ray bounces exactly at M), delay = Δd/343 m/s and f = 1/(2Δt), ray colours cyan/red, and
 * each point's delay/frequency tag shows only when the camera is turned towards it.
 */
@component
export class AMC2ReflectionPointsScenario extends Scenario {
  async run(): Promise<void> {
    await waitReady()
    const ix = new DefaultLeafInteractor()
    await gotoReflectionsFound(ix)
    const m = main()

    const s = st()
    log("C2 points " + JSON.stringify(s.points))
    expect(s.step, "in step 2").toBe(2)
    expect(s.points.length, "three reflection points").toBe(3)
    const ids = s.points.map((p: any) => p.id).join(",")
    expect(ids, "point ids").toBe("LeftWall,RightWall,Desk")
    const H = v3(s.head)

    for (let i = 0; i < 3; i++) {
      const p = s.points[i]
      expect(p.visible && p.valid, p.id + " visible & valid").toBe(true)
      expect(p.t > 0 && p.t < 1, p.id + " 0<t<1 (t=" + p.t + ")").toBe(true)
      const r = surfaceFor(p.id)
      const M = v3(p.position)
      const rel = M.sub(r.p0)
      expect(Math.abs(rel.dot(r.n)) < 0.3, p.id + " sits on its surface plane (off by " + rel.dot(r.n).toFixed(2) + "cm)").toBe(true)
      expect(Math.abs(rel.dot(r.u)) <= r.halfU + 0.1 && Math.abs(rel.dot(r.v)) <= r.halfV + 0.1,
        p.id + " inside surface edges (u=" + rel.dot(r.u).toFixed(1) + "/" + r.halfU + ", v=" + rel.dot(r.v).toFixed(1) + "/" + r.halfV + ")").toBe(true)
      const e = expectedReflection(sourceFor(p.id, s), H, r)
      log("C2 " + p.id + " lens M=" + fmt(M) + " expected M=" + fmt(e.point) + " delay " + p.delayMs + "/" + e.delayMs.toFixed(2) + "ms freq " + p.freqHz + "/" + e.freqHz.toFixed(0) + "Hz")
      expect(M.distance(e.point) < 0.5, p.id + " matches image-source reflection point (err " + M.distance(e.point).toFixed(2) + "cm)").toBe(true)
      expect(Math.abs(p.delayMs - e.delayMs) < 0.05, p.id + " delay ms").toBe(true)
      expect(Math.abs(p.freqHz - e.freqHz) <= Math.max(2, e.freqHz * 0.01), p.id + " interference frequency Hz").toBe(true)
      expect(p.delayMs > 0 && p.freqHz > 0, p.id + " positive delay/frequency").toBe(true)

      // Rays: incoming S→M and outgoing M→head both meet exactly at M; red; direct cyan.
      const vis = (m as any).points[i].visual
      expect(vis.root.enabled !== false, p.id + " visuals enabled").toBe(true)
      expect(rgbClose(vis.incoming.mat.mainPass.baseColor, m.reflectedColor), p.id + " reflected ray red (#F43F5E)").toBe(true)
      expect(rgbClose(vis.outgoing.mat.mainPass.baseColor, m.reflectedColor), p.id + " outgoing ray red").toBe(true)
      expect(rgbClose(vis.direct.mat.mainPass.baseColor, m.directColor), p.id + " direct ray cyan (#38BDF8)").toBe(true)
    }

    // Tags show delay + frequency only when looked at — turn the real camera to each point.
    const head = new LeafHead()
    try {
      for (let i = 0; i < 3; i++) {
        const id = st().points[i].id
        const turned = await head.lookAt(v3(st().points[i].position))
        await sleep(300)
        const p = st().points[i]
        log("C2 look at " + id + " turned=" + turned + " inView=" + p.inView + " label=" + p.labelVisible)
        expect(turned, "camera turned towards " + id).toBe(true)
        expect(p.inView, id + " in view when looked at").toBe(true)
        expect(p.labelVisible, id + " delay/frequency tag visible when looked at").toBe(true)
        const tag = (m.pointLabels as any).tags[i]
        const txt = m.pointLabels.tagText(i)
        log("C2 tag " + i + ": '" + txt + "' rootEnabled=" + tag.root.enabled)
        expect(tag.root.enabled, id + " tag SceneObject enabled").toBe(true)
        expect(txt.includes(p.delayMs.toFixed(1) + " ms"), id + " tag shows delay '" + txt + "'").toBe(true)
        expect(txt.includes(Math.round(p.freqHz) + " Hz"), id + " tag shows frequency '" + txt + "'").toBe(true)
      }
      // Look up and away: no tag should be visible.
      await head.lookDir(studioDir(0, 50))
      await sleep(300)
      const away = st()
      log("C2 look away: inView=" + away.points.map((p: any) => p.inView) + " labels=" + away.points.map((p: any) => p.labelVisible))
      for (const p of away.points) {
        expect(p.labelVisible === p.inView, p.id + " tag hidden when not looked at").toBe(true)
      }
    } finally {
      await head.restore()
    }
  }
}
