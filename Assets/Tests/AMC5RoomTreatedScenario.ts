import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { expect } from "Leaf.lspkg/Utils/common/Expect"
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import { sleep } from "Leaf.lspkg/Utils/common/Utils"
import {
  dragPanelToPoint, gotoReflectionsFound, log, main, resetLens, rgbClose, st, tap, v3, waitFor, waitReady,
} from "./AcousticMirrorLeafHelpers"

/**
 * Done criterion 5 — Room treated with clear feedback, and Reset.
 * Real input throughout: drag-to-lock, Next, Find Reflections, Next, three real SIK panel
 * drags onto LeftWall/RightWall/Desk, then the Reset button.
 * Asserts all rays/rings green, completion chime, audio crossfade in thirds to fully clean,
 * card "ROOM TREATED – 3/3 REFLECTION POINTS"; after Reset: step 1, counter 0, monitors and
 * panels back at their start positions, rays hidden, audio back to hollow.
 */
@component
export class AMC5RoomTreatedScenario extends Scenario {
  async run(): Promise<void> {
    await waitReady()
    const ix = new DefaultLeafInteractor()
    const m = main()

    // Start positions = what Reset restores.
    await resetLens(ix)
    const startMon = [m.leftMonitor, m.rightMonitor].map(x => x.getTransform().getLocalPosition())
    const panels = [m.panel1, m.panel2, m.panel3]
    const startPanels = panels.map(p => p.getTransform().getLocalPosition())

    await gotoReflectionsFound(ix)
    await tap(ix, "NextButton")
    expect(await waitFor(() => st().step === 3, 2000), "step 3").toBe(true)
    await sleep(300)

    const targets: [number, string][] = [[0, "LeftWall"], [1, "RightWall"], [2, "Desk"]]
    const mixes: number[] = []
    for (const [panelIdx, pointId] of targets) {
      const before = st().treatedCount
      await dragPanelToPoint(ix, panelIdx, pointId)
      await sleep(300)
      const s = st()
      log("C5 after panel " + (panelIdx + 1) + " -> " + pointId + ": treated=" + s.treatedCount + " mix=" + s.audioMix + " step=" + s.step)
      expect(s.points.find((p: any) => p.id === pointId).treated, pointId + " treated by real drag").toBe(true)
      expect(s.treatedCount, "counter +1 after " + pointId).toBe(before + 1)
      mixes.push(s.audioMix)
    }
    expect(Math.abs(mixes[0] - 1 / 3) < 0.01 && Math.abs(mixes[1] - 2 / 3) < 0.01 && mixes[2] === 1,
      "audio crossfades hollow -> clean in thirds (" + mixes.join(", ") + ")").toBe(true)

    const s = st()
    expect(s.step, "complete step").toBe(4)
    expect(s.card.status, "card text").toBe("ROOM TREATED – 3/3 REFLECTION POINTS")
    expect(s.lastCue, "completion chime").toBe("completeChime")
    expect(m.completeCount > 0, "complete count incremented").toBe(true)
    expect(s.arrowVisible, "no guidance arrow when complete").toBe(false)
    for (let i = 0; i < 3; i++) {
      const vis = (m as any).points[i].visual
      expect(rgbClose(vis.incoming.mat.mainPass.baseColor, m.successColor) && rgbClose(vis.outgoing.mat.mainPass.baseColor, m.successColor),
        s.points[i].id + " rays green").toBe(true)
      expect(rgbClose(vis.ring.mainPass.baseColor, m.successColor), s.points[i].id + " ring green").toBe(true)
    }
    // Audio glides to fully clean.
    expect(await waitFor(() => st().audioMixCurrent >= 0.999, 6000), "played mix reaches clean (current=" + st().audioMixCurrent + ")").toBe(true)
    const audio = m.audio as any
    log("C5 volumes hollow=" + audio.hollowVolume + " clean=" + audio.cleanVolume)
    expect(audio.hollowVolume < 0.01, "hollow loop silent").toBe(true)
    expect(audio.cleanVolume > 0, "clean loop audible").toBe(true)

    // Reset (real button).
    await tap(ix, "ResetButton")
    expect(await waitFor(() => st().step === 1, 2000), "Reset -> step 1").toBe(true)
    await sleep(400)
    const r = st()
    log("C5 after reset " + JSON.stringify({ step: r.step, treated: r.treatedCount, mix: r.audioMix, cur: r.audioMixCurrent, status: r.card.status }))
    expect(r.treatedCount, "counter reset").toBe(0)
    expect(r.reflectionsFound, "reflections cleared").toBe(false)
    expect(r.points.every((p: any) => !p.visible && !p.treated), "points hidden & untreated").toBe(true)
    expect(r.audioMix === 0 && r.audioMixCurrent === 0, "audio back to hollow").toBe(true)
    expect(audio.hollowVolume > 0 && audio.cleanVolume < 0.01, "hollow loop audible again").toBe(true)
    expect(r.sweetSpotLocked, "not locked after reset").toBe(false)
    expect(r.card.status, "card back to step 1").toBe("Adjust speaker angle")
    for (let i = 0; i < 2; i++) {
      const now = [m.leftMonitor, m.rightMonitor][i].getTransform().getLocalPosition()
      expect(now.distance(startMon[i]) < 0.5, "monitor " + i + " back at start (" + now.distance(startMon[i]).toFixed(2) + "cm)").toBe(true)
    }
    for (let i = 0; i < 3; i++) {
      const now = panels[i].getTransform().getLocalPosition()
      expect(now.distance(startPanels[i]) < 0.5, "panel " + (i + 1) + " back on rack").toBe(true)
      expect(panels[i].isLocked, "panel " + (i + 1) + " unlocked").toBe(false)
      expect(panels[i].getSceneObject().enabled, "panel " + (i + 1) + " hidden until step 3").toBe(false)
    }
    for (let i = 0; i < 3; i++) {
      expect((m as any).points[i].visual.incoming.obj.isEnabledInHierarchy, "ray " + i + " hidden").toBe(false)
    }
    void v3
  }
}
