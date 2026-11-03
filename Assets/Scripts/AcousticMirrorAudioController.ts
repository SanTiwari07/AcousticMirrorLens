import { amDeltaTime } from "./AcousticMirrorClock"
/**
 * AcousticMirrorAudioController — the simulated acoustic improvement.
 *
 * Owns: two looping beds played from the monitors (hollow = loop + ~3.5 ms delayed
 * copy, clean = the dry loop), the hollow→clean crossfade, and one-shot cues
 * (sweet-spot chime, completion chime, out-of-view ping, panel snap).
 * Expects: AudioTrackAssets wired in the Inspector; left/right monitor SceneObjects
 * to host the loop AudioComponents.
 * Must not: decide when cues fire — Main calls the playX() and setMix() methods.
 * This is a demonstration, not an acoustic measurement.
 */
@component
export class AcousticMirrorAudioController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">AcousticMirrorAudioController – hollow → clean crossfade + cues</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("Hollow, phasey loop (clean loop mixed with a ~3.5 ms delayed copy)")
  @allowUndefined
  hollowLoop: AudioTrackAsset

  @input
  @hint("Clean loop (same material, no comb filtering)")
  @allowUndefined
  cleanLoop: AudioTrackAsset

  @input
  @hint("Confirmation chime when the sweet spot locks")
  @allowUndefined
  lockChime: AudioTrackAsset

  @input
  @hint("Completion chime when all reflection points are treated")
  @allowUndefined
  completeChime: AudioTrackAsset

  @input
  @hint("Subtle ping when an untreated point is out of view")
  @allowUndefined
  ping: AudioTrackAsset

  @input
  @hint("Soft thud when a panel snaps onto a reflection point")
  @allowUndefined
  snapSound: AudioTrackAsset

  @input
  @hint("Left studio monitor — hosts one copy of the loops")
  leftMonitor: SceneObject

  @input
  @hint("Right studio monitor — hosts one copy of the loops")
  rightMonitor: SceneObject
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Overall loop volume")
  @widget(new SliderWidget(0, 1, 0.05))
  loopVolume: number = 0.6

  @input
  @hint("Volume of the chimes and snap cue")
  @widget(new SliderWidget(0, 1, 0.05))
  cueVolume: number = 0.8

  @input
  @hint("Volume of the subtle out-of-view ping")
  @widget(new SliderWidget(0, 1, 0.05))
  pingVolume: number = 0.35

  @input
  @hint("Seconds to glide between mix steps")
  @widget(new SliderWidget(0.1, 3, 0.1))
  crossfadeSeconds: number = 1.0

  @input
  @hint("Play the loops as spatial sound from the monitors (needs an Audio Listener on the camera)")
  spatialLoops: boolean = false
  @ui.group_end

  private hollowSources: AudioComponent[] = []
  private cleanSources: AudioComponent[] = []
  private cue: AudioComponent
  private pingSrc: AudioComponent
  private target = 0
  private current = 0
  private started = false

  /** 0 = fully hollow, 1 = fully clean (target value, as set by Main). */
  get mixTarget(): number { return this.target }
  /** 0..1 — the mix value actually being played this frame. */
  get mix(): number { return this.current }
  get hollowVolume(): number { return this.hollowSources.length ? this.hollowSources[0].volume : 0 }
  get cleanVolume(): number { return this.cleanSources.length ? this.cleanSources[0].volume : 0 }
  /** Name of the last one-shot cue played (for tests/logs). */
  lastCue = ""
  cueCount = 0

  onAwake(): void {
    for (const host of [this.leftMonitor, this.rightMonitor]) {
      if (!host) continue
      if (this.hollowLoop) this.hollowSources.push(this.makeLoop(host, this.hollowLoop))
      if (this.cleanLoop) this.cleanSources.push(this.makeLoop(host, this.cleanLoop))
    }
    this.cue = this.sceneObject.createComponent("Component.AudioComponent") as AudioComponent
    this.cue.playbackMode = Audio.PlaybackMode.LowLatency
    this.pingSrc = this.sceneObject.createComponent("Component.AudioComponent") as AudioComponent
    this.pingSrc.playbackMode = Audio.PlaybackMode.LowLatency
    this.createEvent("OnStartEvent").bind(() => this.startLoops())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  private makeLoop(host: SceneObject, track: AudioTrackAsset): AudioComponent {
    const a = host.createComponent("Component.AudioComponent") as AudioComponent
    a.audioTrack = track
    a.volume = 0
    if (this.spatialLoops && a.spatialAudio) a.spatialAudio.enabled = true
    return a
  }

  private startLoops(): void {
    if (this.started) return
    this.started = true
    for (const a of this.hollowSources.concat(this.cleanSources)) a.play(-1)
    this.applyVolumes()
  }

  /** Set the hollow→clean mix target (0..1); glides over crossfadeSeconds. */
  setMix(value: number, immediate: boolean = false): void {
    this.target = Math.max(0, Math.min(1, value))
    if (immediate) {
      this.current = this.target
      this.applyVolumes()
    }
  }

  private onUpdate(): void {
    if (Math.abs(this.current - this.target) < 1e-4) return
    const step = amDeltaTime() / Math.max(0.05, this.crossfadeSeconds)
    if (this.current < this.target) this.current = Math.min(this.target, this.current + step)
    else this.current = Math.max(this.target, this.current - step)
    this.applyVolumes()
  }

  private applyVolumes(): void {
    // Equal-power crossfade so loudness stays steady while the colour changes.
    const c = Math.sin((this.current * Math.PI) / 2)
    const h = Math.cos((this.current * Math.PI) / 2)
    for (const a of this.hollowSources) a.volume = h * this.loopVolume
    for (const a of this.cleanSources) a.volume = c * this.loopVolume
  }

  playLockChime(): void { this.playCue(this.lockChime, "lockChime", this.cueVolume) }
  playCompleteChime(): void { this.playCue(this.completeChime, "completeChime", this.cueVolume) }
  playSnap(): void { this.playCue(this.snapSound, "snap", this.cueVolume * 0.8) }

  playPing(): void {
    this.lastCue = "ping"
    this.cueCount++
    if (!this.ping) return
    this.pingSrc.audioTrack = this.ping
    this.pingSrc.volume = this.pingVolume
    this.pingSrc.play(1)
  }

  private playCue(track: AudioTrackAsset, name: string, vol: number): void {
    this.lastCue = name
    this.cueCount++
    if (!track) return
    if (this.cue.isPlaying()) this.cue.stop(false)
    this.cue.audioTrack = track
    this.cue.volume = vol
    this.cue.play(1)
  }
}
