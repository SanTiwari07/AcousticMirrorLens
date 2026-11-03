import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { expect } from "Leaf.lspkg/Utils/common/Expect"
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import { sleep } from "Leaf.lspkg/Utils/common/Utils"
import {
  dragTowards, fmt, gotoReflectionsFound, log, main, rgbClose, st, surfaceFor, tap, v3, waitFor, waitReady,
} from "./AcousticMirrorLeafHelpers"

/**
 * Done criterion 4 — Panels snap to reflection points.
 * Real SIK drag (LEAF) of AcousticPanel1 from the rack: first to ~15 cm from the LeftWall
 * point (must NOT snap), then onto it (must snap within the 8 cm radius). Asserts the panel
 * locks flush on the wall at M, the matching ray turns green, and the counter goes 0 → 1.
 */
@component
export class AMC4PanelSnapScenario extends Scenario {
  async run(): Promise<void> {
    await waitReady()
    const ix = new DefaultLeafInteractor()
    await gotoReflectionsFound(ix)
    await tap(ix, "NextButton")
    expect(await waitFor(() => st().step === 3, 2000), "Next enters step 3 (room treatment)").toBe(true)
    await sleep(300)
    const m = main()
    const s0 = st()
    expect(s0.treatedCount, "counter starts at 0").toBe(0)
    expect(s0.card.status, "card shows 0/3").toBe("0/3 Treated")
    const panelObj = m.panel1.getSceneObject()
    expect(panelObj.isEnabledInHierarchy, "panel 1 shown in step 3").toBe(true)

    const pointIdx = 0 // LeftWall
    const pt = () => st().points[pointIdx]
    const r = surfaceFor("LeftWall")
    const vis = (m as any).points[pointIdx].visual

    // Phase 1: stop ~15 cm above the point (off the line of sight) — no snap yet.
    const nearTarget = () => v3(pt().position).add(r.n.uniformScale(3)).add(new vec3(0, 15, 0))
    await dragTowards(ix, "AcousticPanel1", panelObj, nearTarget,
      () => pt().treated || panelObj.getTransform().getWorldPosition().distance(nearTarget()) < 2, 12, 400)
    await sleep(300)
    const dNear = panelObj.getTransform().getWorldPosition().distance(v3(pt().position))
    log("C4 phase1 panel=" + fmt(panelObj.getTransform().getWorldPosition()) + " M=" + fmt(v3(pt().position)) + " dist=" + dNear.toFixed(1) + " treated=" + pt().treated)
    expect(dNear > 8, "phase 1 panel parked outside the 8cm snap radius (" + dNear.toFixed(1) + "cm)").toBe(true)
    expect(pt().treated, "no snap while > 8 cm away").toBe(false)
    expect(st().treatedCount, "counter unchanged before snap").toBe(0)

    // Phase 2: drag onto the point — must snap.
    await dragTowards(ix, "AcousticPanel1", panelObj, () => v3(pt().position).add(r.n.uniformScale(3)),
      () => pt().treated, 12, 400)
    await sleep(400)
    const s1 = st()
    const p = s1.points[pointIdx]
    const panelPos = panelObj.getTransform().getWorldPosition()
    const rel = panelPos.sub(v3(p.position))
    log("C4 phase2 treated=" + p.treated + " count=" + s1.treatedCount + " panel=" + fmt(panelPos) + " normalOffset=" + rel.dot(r.n).toFixed(2) + " status=" + s1.card.status)
    expect(p.treated, "LeftWall point treated by the dragged panel").toBe(true)
    expect(p.panelIndex, "treated by panel 1").toBe(0)
    expect(s1.treatedCount, "counter 0 -> 1").toBe(1)
    expect(s1.card.status, "card shows 1/3").toBe("1/3 Treated")
    expect(m.panel1.isLocked, "panel locked after snapping").toBe(true)
    // Snapped flush: centred on M, half the panel thickness off the wall.
    const tangential = rel.sub(r.n.uniformScale(rel.dot(r.n))).length
    expect(tangential < 0.5, "panel centred on M (" + tangential.toFixed(2) + "cm)").toBe(true)
    expect(Math.abs(rel.dot(r.n) - (m.panelThicknessCm / 2 + 0.2)) < 0.3, "panel flush on the wall").toBe(true)
    // Matching ray turns green; others stay red.
    expect(rgbClose(vis.incoming.mat.mainPass.baseColor, m.successColor), "LeftWall reflected ray green").toBe(true)
    expect(rgbClose(vis.outgoing.mat.mainPass.baseColor, m.successColor), "LeftWall outgoing ray green").toBe(true)
    const other = (m as any).points[1].visual
    expect(rgbClose(other.incoming.mat.mainPass.baseColor, m.reflectedColor), "RightWall ray still red").toBe(true)
    expect(s1.lastCue === "snap" || s1.lastCue === "ping", "snap cue played (lastCue=" + s1.lastCue + ")").toBe(true)
    expect(Math.abs(s1.audioMix - 1 / 3) < 0.01, "audio crossfade moved one third (" + s1.audioMix + ")").toBe(true)
  }
}
