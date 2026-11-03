import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { expect } from "Leaf.lspkg/Utils/common/Expect"
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import { sleep } from "Leaf.lspkg/Utils/common/Utils"
import { dragMonitorsToLock, dragTowards, fmt, log, main, resetLens, rgbClose, rightMonitorTargetFor, st, toStudio, v3, waitReady } from "./AcousticMirrorLeafHelpers"

/**
 * Done criterion 1 — Speaker positioning.
 * Real SIK drags (LEAF DefaultLeafInteractor) on the RightMonitor until the speakers form
 * 60°±2° at the head; asserts lock, chime cue, card text, Next enabled, monitor stays on desk.
 */
@component
export class AMC1SpeakerPositioningScenario extends Scenario {
  async run(): Promise<void> {
    await waitReady()
    const ix = new DefaultLeafInteractor()
    await resetLens(ix)

    const s0 = st()
    log("C1 start angle=" + s0.speakerAngleDeg + " monitors=" + JSON.stringify(s0.monitors))
    expect(s0.step, "starts in step 1").toBe(1)
    expect(Math.abs(s0.speakerAngleDeg - 60) > 2, "starting angle is off the sweet spot (" + s0.speakerAngleDeg + ")").toBe(true)
    expect(s0.sweetSpotLocked, "not locked at start").toBe(false)
    expect(s0.card.nextEnabled, "Next disabled before lock").toBe(false)

    // 1) Real drag to an off-target angle (52°) — must NOT lock.
    const m = main()
    const deskY0 = toStudio(m.rightMonitor.getTransform().getWorldPosition()).y
    await dragTowards(ix, "RightMonitor", m.rightMonitor.getSceneObject(),
      () => rightMonitorTargetFor(52), () => Math.abs(st().speakerAngleDeg - 52) < 1.5, 10)
    const s1 = st()
    log("C1 after drag to ~52: angle=" + s1.speakerAngleDeg)
    expect(Math.abs(s1.speakerAngleDeg - 52) < 3, "drag moved the monitor to ~52° (got " + s1.speakerAngleDeg + ")").toBe(true)
    expect(s1.sweetSpotLocked, "not locked at ~52°").toBe(false)

    // 2) Real drag to 60° — must lock.
    const chimeBefore = s1.lastCue
    await dragMonitorsToLock(ix)
    await sleep(300)
    const s2 = st()
    log("C1 after drag to 60: angle=" + s2.speakerAngleDeg + " status=" + s2.card.status + " cue=" + s2.lastCue + " monitor=" + fmt(m.rightMonitor.getTransform().getWorldPosition()))
    expect(Math.abs(s2.speakerAngleDeg - 60) <= 2.3, "angle within 60±2 (got " + s2.speakerAngleDeg + ")").toBe(true)
    expect(s2.sweetSpotLocked, "sweet spot locked").toBe(true)
    expect(s2.lastCue, "lock chime played (before: " + chimeBefore + ")").toBe("lockChime")
    expect(s2.card.status, "status card text").toBe("Sweet Spot Locked")
    expect(s2.card.nextEnabled, "Next enabled after lock").toBe(true)
    // Monitor stays standing on the desk (Main constrains it; drag must not lift it off).
    const deskY1 = toStudio(m.rightMonitor.getTransform().getWorldPosition()).y
    expect(Math.abs(deskY1 - deskY0) < 0.5, "monitor stays on desk surface (y " + deskY0.toFixed(1) + " -> " + deskY1.toFixed(1) + ")").toBe(true)
    // Triangle turns green: Main uses successColor for the triangle while locked.
    const tri = (m as any).triangle
    const triCol = tri.lr.mat.mainPass.baseColor as vec4
    log("C1 triangle colour " + triCol.toString())
    expect(rgbClose(triCol, m.successColor), "speaker triangle is green (#10B981)").toBe(true)
    expect(v3(s2.monitors[1]).distance(v3(s0.monitors[1])) > 1, "RightMonitor actually moved").toBe(true)
  }
}
