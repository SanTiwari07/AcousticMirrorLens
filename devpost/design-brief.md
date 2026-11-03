---
status: approved
---

# Design brief: AcousticMirror AR

## The one spatial moment
I'm sitting at my studio desk in my listening position, with two studio monitors in front of me. I look towards the left wall and see a glowing red point where sound from my left speaker reflects to my ears: a cyan line for the direct sound, a red line bouncing off the wall to my head, and a small label with the delay in milliseconds and the interference frequency. I grab a virtual acoustic panel and place it on the point. It snaps in, the red ray turns green, and the audio goes from hollow and phasey to clean. If I move my head or walk sideways, the reflection points move with me. I can see where my sound is going wrong and fix it myself, without a second person.

## Why it belongs on glasses
- Uses: shares your view, draws in the world, leaves your body free.
- Why it's better than the phone or laptop version: the glasses sit at the listener's head, which is exactly the point the reflections must reach. They replace the second person in the "mirror trick", who slides a mirror along the wall while you sit still. The rays and targets appear on the walls and desk at real size, and both hands stay free to move speakers and panels. A phone on the desk doesn't know where your ears are, and a laptop shows a 2D graph instead of the spot on your wall.

## Product or overlay
- Type: overlay. It responds to a real room: real walls, a real desk, real speakers.
- What the real version would sense: the positions of the walls, desk surface and studio monitors, plus the user's head position.
- Stand-in for the preview: a virtual home recording studio at real scale. It has a desk, two movable monitors, left and right walls, an optional back wall, and a panel rack. The user's head (the preview camera) is the listening position. The reflection math uses the stand-in surfaces exactly as it would use detected real surfaces.
- The audio is a simulated acoustic improvement, not a real-world acoustic measurement. It demonstrates what treating a reflection point does; nothing is measured from a real room or microphone.

## Where things live
- Where the user is looking during the main task: at the desk and monitors during setup, then turning towards the left wall, right wall and desk to inspect and treat reflection points.
- Listening position: the user's head at the start position, facing the desk. A small listening-position marker shows the sweet spot.
- Studio desk: a rectangle 140 cm wide × 70 cm deep, centred about 90–100 cm in front of the user's head and slightly below eye level. Desk top about 25 cm below eye height (default).
- Studio monitors (left and right): about 20 × 30 cm each, standing on the desk. They start off the 60° position, at roughly 45° (default), so step 1 has something to fix.
- Left and right walls: virtual walls about 1.2–1.5 m to either side of the listening position (135 cm, default). They have subtle glowing outlines or grid patterns, never solid or black.
- Back wall (optional): adds studio context only, with no reflection point on it. Placed about 1.5 m behind the listening position (default).
- Acoustic panels: three absorber panels, 60 × 60 × 5 cm each, starting on a small panel rack beside the desk.
- Status card: a small floating card above the right corner of the desk, about 80 cm from the user. It's anchored near the desk, never attached to the face, and never blocking the central view.
- Reflection points: three, one on the left wall (from the left monitor), one on the right wall (from the right monitor) and one on the desk surface (default mapping), each at its calculated first-reflection position. Every point must be geometrically valid: it lies on the actual virtual wall or desk surface, inside that surface's edges, never floating in the air or off the end of a wall.

## Hands and input
- Move a monitor: one-hand pinch and drag, restricted to the desk surface.
- Move a panel: one-hand pinch and drag from the rack. When it comes within about 8 cm of an untreated reflection point, it snaps into place, flush with that surface. Any panel can treat any point (default).
- Next button (status card): goes from speaker setup to reflection analysis. Only active once the sweet spot is locked.
- Find Reflections button (status card): calculates and shows the reflection paths and target points.
- Reset button (status card): restores the speakers, panels and reflection states to their starting positions.
- All interactions use one-hand pinch-and-drag gestures (and one-hand pinch to press buttons) through the Spectacles Interaction Kit. No custom gestures, no two-hand interactions. One person does everything alone: the glasses replace the second person who would hold the mirror.
- Targets are big and highlight when aimed at.
- Voice: none.

## When things show
- Step 1, speaker setup: show only the desk, the two monitors, the listening-position marker, the three lines of the speaker triangle (left monitor, right monitor, user's head), and the status card with the current step and speaker angle. The triangle updates live while a monitor is dragged. At about 60° (within ±2°, default) it turns green, a confirmation chime plays, and the card shows "Sweet Spot Locked". No reflection rays, panels or extra information yet.
- Step 2, reflection discovery: after Find Reflections, show cyan direct rays, red reflected rays and glowing red rings at the three reflection points. The speaker triangle fades away. Each reflection point starts as a small glowing dot. When the user looks towards it, it expands to show the delay in ms and the estimated interference frequency in Hz. No large info cards stay in view.
- Step 3, room treatment: the panels and rack appear. Direct rays and setup information fade. The target rings and their reflected rays stay prominent. When a panel snaps in, that ray turns green, the point changes to a treated state, and its red indicators fade so the remaining untreated points stand out. The status card shows progress, e.g. "1/3 Treated". The simulated audio moves one step from the hollow version towards the clean one for each treated point (one third per point, default).
- Completion: clear visual and audio feedback together. All three reflected rays and rings are green, a short completion chime plays (default), the simulated audio is fully clean, and the status card shows "ROOM TREATED – 3/3 REFLECTION POINTS". Reset lets the user try a different speaker setup.
- Reset: returns the monitors to their starting positions and the panels to the rack, clears all treated states, counters and rays, brings the audio back to the hollow version, and goes back to step 1.
- If something needs attention out of view: when an untreated reflection point is outside the viewing window, a small directional arrow appears at the edge of the visible area, pointing towards it, with a subtle audio ping. The arrow guides the user as they turn, and disappears once the ring is in view.
- Status card throughout: stays near the desk and changes with the step. Step 1 shows speaker setup and angle status. Step 2 shows reflection discovery. Step 3 shows the treated count. Completion shows "Room Treated – 3/3".

## Done criteria
Each one can be checked in Lens Studio's preview.
1. **Speaker positioning:** I can click and drag either monitor across the desk surface. When the speakers form about a 60° angle at the listening position, the triangle turns green, a chime plays, and the status card shows "Sweet Spot Locked".
2. **Reflection points appear:** after clicking Find Reflections, I see cyan direct rays, red reflected rays and three glowing reflection points on the left wall, right wall and desk. Each point sits on its surface, inside the surface's edges, and the reflected ray bounces exactly at it. Each point shows its estimated delay and interference frequency when I look towards it.
3. **Reflection points follow me:** when I walk sideways or change position with WASD, the reflection points and reflected rays recalculate and visibly move with my head position. This shows the geometry is calculated live, not pre-recorded.
4. **Panels snap to reflection points:** I can click and drag a panel from the rack towards a reflection point. Within about 8 cm it snaps into place, the matching red ray turns green, and the treated counter goes up.
5. **Room treated with clear feedback:** after all three points are treated, all rays and rings are green, a completion chime plays, the simulated audio has moved from the hollow, phasey version to the clean version, and the status card shows "Room Treated – 3/3 Reflection Points". Pressing Reset restores the starting scene (monitors, panels, rays, counter, audio and step 1) so I can repeat it.
6. **Out-of-view guidance (priority):** when a reflection point is outside the narrow SPECS viewing window, a directional arrow appears at the edge of the view with a subtle ping. When I turn towards the point, the arrow disappears and the reflection point is visible. This is a priority to test because the side walls are outside the view while facing the desk.

Each criterion should have a LEAF test where possible. Never report a test as passing unless it actually ran and passed.

## Out of scope
- Scanning or detecting a real room's walls, desk or speakers. The preview uses the virtual studio stand-in.
- Measuring real sound with a microphone, or any real-world acoustic measurement. The audio is a simulated acoustic improvement.
- Ceiling and back-wall reflections, and reflections beyond the first bounce.
- Two-hand or custom gestures, and voice commands.
- Saving a room setup between sessions.

## Risks and open questions
- The side-wall reflection points sit outside the narrow SPECS view (about 37° × 32°) while the user faces the desk. The edge arrow and ping are the mitigation, and they are the top testing priority. How natural turning feels is feel unproven.
- The hollow-versus-clean audio is a simulated acoustic improvement, not a measurement (the clean loop and the same loop with a short delayed copy mixed in). Real glasses speakers may not reproduce low frequencies well. Feel unproven.
- How well the glowing rays and rings show against a real, brightly lit room on the additive display can only be judged on real glasses.

## Build notes for CLAD
- Build for SPECS so it runs and can be demonstrated in Lens Studio's preview. No SPECS device is available.
- Use Spectacles Interaction Kit (SIK) and UI Kit for all interactions, so they work with the mouse in Interactive Preview and with LEAF.
- Build any stand-in exactly as described above, and keep it obvious in the scene.
- Use real-world scale in centimeters. Keep content inside the user's view during the main task.
- The display is additive: black renders as transparent. Don't rely on black or very dark content to be seen; keep text light and readable from where the user stands.
- Get the basic flow working first, then add detail.
- Write LEAF scenarios for each done criterion, run them in preview, and report which pass. Say which criteria have no test.
- Don't record, identify, or follow people.
- Reflection geometry (default): use the image-source method every frame, with the head position H read from the camera. For speaker S and a surface with point P0 and unit normal n: image source S' = S − 2((S − P0)·n)n; reflection point M = S' + t(H − S'), where t = ((P0 − S')·n) / ((H − S')·n). Extra path Δd = |S−M| + |M−H| − |S−H|. Delay Δt = Δd / 343 m/s (show it in ms). Interference frequency f = 1 / (2Δt) (show it in Hz).
- Geometric validity: only show a reflection point when 0 < t < 1 and M lies inside the bounds of its wall or desk rectangle. Place the ring flush on that surface and make the reflected ray pass exactly through M. If a point would fall outside its surface, hide it rather than draw it in the air.
- Field-of-view testing is a priority: the LEAF test for done criterion 6 should turn the camera away from a side-wall point, check the edge arrow is shown, turn back, and check the arrow is hidden. Use SPECS' real view size, about 37° tall by 32° wide, to decide what counts as out of view.
- Colors (default): cyan direct rays (#38BDF8), red reflected rays and untreated rings (#F43F5E), green for locked or treated (#10B981). All bright on a transparent background.
- Audio (default): two looping, original (not copyrighted) clips, generated for this Lens, playing as spatial sound from the monitors. One is clean. The other is the same loop mixed with a copy delayed about 3–4 ms, which sounds hollow and phasey. Crossfade from hollow to clean in thirds as points are treated. Also a short confirmation chime and a subtle ping.

## After the build: judge it
This part is for you, after CLAD finishes.

1. **Does it work?** Ask your agent which LEAF tests passed and which done criteria have no test.
2. **Walk around it.** Open the preview in Interactive Preview. Use WASD to move, Q and E to go down and up, and right-drag (or hold Shift) to look around. Clicking acts as a pinch. Stand where a user would and look at the task.
3. **Ask the three questions.**
   - Does it use what I'm looking at?
   - Does it put something in my space, where it belongs?
   - Does it free my hands or let me keep my eyes up?
   - Would it be just as good on a phone? If so, what would make it need the glasses?
4. **Check comfort.**
   - Everything I need is in view while I do the task. Nothing sits at the edges, behind me, or stuck to my face.
   - Every control is within reach of someone standing there.
   - Text reads easily from where I stand. No dark UI disappearing.
   - Things show when needed and get out of the way.
5. **Label what you know.** Write "logic proven" next to anything the tests and preview show working, and "feel unproven" next to anything only real glasses could tell you (comfort over time, real hand tracking, real recognition).
6. **Fix with design notes, not code.** Tell your agent what to change in design terms, for example: "Move the step card 15 cm lower and next to the pan. Make the Next button twice as big. Re-run the tests." If a fix takes under a minute, like nudging a panel, do it yourself in the scene.
7. **Submit.** Record a video under 3 minutes of your Lens in the preview, public on YouTube. Make your repo public with your Lens Studio project and this `devpost/` folder. Details are on the hackathon site: https://learn-specs.devpost.com/resources
