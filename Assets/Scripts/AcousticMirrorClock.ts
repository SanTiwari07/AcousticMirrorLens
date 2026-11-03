/**
 * AcousticMirrorClock — the one time source for the Lens's own animations.
 *
 * Normally it is just getDeltaTime(). A debug recorder (AcousticMirrorDemoDirector) can set
 * global.amFixedDeltaTime so every rendered frame advances by exactly that step; frame-by-frame
 * captures then play back at true speed however slowly the preview renders.
 */
export function amDeltaTime(): number {
  const fixed = (global as any).amFixedDeltaTime
  return typeof fixed === "number" && fixed >= 0 ? fixed : getDeltaTime()
}
