# Dimensional Motion (template: dimensional)

Starter template. Built on card library 03 (the dimensional set: real perspective, chrome type, thin
instrument linework with a lens fringe, near-black canvas). The brand's own answers outrank anything here;
its Nos become hard rules.

## The idea in one line

Engineered and expensive: the speaker talks in a cold, clean frame while chrome words and instrument
readouts float in real depth around them, so the product or offer feels like serious machinery.

## Who it's for

Tech products, software and automation companies, premium agencies, engineers, fintech, and any offer that
should feel precise rather than friendly. Best for launches, product reveals, "how it works" and proof
videos. Not for warm, personal, or beginner education content (it reads cold on purpose).

## Format defaults

- Vertical 1080x1920, 30fps. Face + B-roll: speaker on camera about 60% of runtime, the rest is dimensional
  takeovers and screen proof floating in 3D.
- Canvas `#050507`. Speaker graded cold and slightly desaturated so chrome reads as the brightest thing.
- Text safe zone: x 90-960, y 220-1500. Floating objects may cross the safe edge; their text may not.
- Captions: system-log style. JetBrains Mono 400, 44px, `#79C8FF` at 90%, lowercase, typed on at 30
  characters per second with a 2px block cursor, left-aligned at x 90, baseline y 1380, max 2 lines of 30
  characters. Only the speaker's key phrases are captioned in display type (see 2).

## The signature pieces

1. **Push in from depth.** Every entrance comes from the z axis (translateZ -800 to 0, 1.2-1.8s,
   expo.out), never from a frame edge. Exits pull back into the distance. Nothing snaps.
2. **Chrome display words.** The 1-3 words that carry each claim appear in Michroma, 120-160px, uppercase,
   tracked +4%, filled with the chrome ramp (white top, steel mid, near-black band, bright lip), in the top
   band y 240-560 above the speaker's head. One chrome phrase per claim, held 1.5-3s.
3. **Instrument readouts.** Thin 1.5px linework rings, tick marks and coordinate labels around a number
   (`t1.stat.signalfield`), with a warm/cool lens fringe (`#FF3B30` / `#0A84FF`, 2px offset, 40% opacity)
   always as a pair.
4. **Proof in 3D.** The brand's real screenshots, dashboards and posts float as tilted panels (rotateY
   12-18 degrees) with slow idle drift on mismatched sine periods (5s, 7s, 11s) so they never bob in unison
   (`t2.proof.postfloat`).
5. **The tunnel opener.** For launches, the hook word turns inside a tunnel of the brand's own screens
   (`t1.section.chrometunnel`), 2-3s, then pushes through into the speaker.
6. **Grade: bleach bypass, cool.** Contrast +15, saturation -25, shadows cooled toward `#0A1420`, skin kept
   neutral (never blue). Light grain 4%. Vignette 20%.

## Allowed with restraint

- Accent blue `#79C8FF` for live readouts only (a number counting, a status dot).
- A zoom-blur push between sections (0.4s).
- One slow 3D orbit around a product panel per video (max 4s).
- Soft camera push on the speaker (1.00 to 1.05 over 8s). No punch-ins.

## Never

- Warm grades, light leaks, emoji, stickers, hand-drawn elements.
- Bouncy or back-out easing, stepped motion, fast whips.
- Flat 2D slides from the frame edge.
- More than one accent color, or a fifth color anywhere.
- Fake dashboards or invented numbers on the floating panels.
- Full word-by-word pop captions.

## Rhythm (pace 4 of 10, density balanced)

- 0-2.5s: hook as a chrome word pushing out of depth over a dark plate, voice on frame 0; cut to the
  speaker on the second sentence.
- Cuts on the speaker every 3-5s (clean jump cuts, no scale change); a dimensional element every 5-8s.
- Heavy objects take their time: allow 1.2s for an entrance to settle before the next word lands on it.
- Pattern interrupt every 10-12s: a full takeover (tunnel, signal field, floating proof stack) for 2-3s.
- Close on the strongest proof panel, then the end tag.

## Sound

- Music: synthwave / electronic or dark cinematic score with a pulse, 90-110 BPM, -24 LUFS under voice.
- SFX: deep sub whoosh on depth entrances (-26 dB), fine mechanical ticks on readout count-ups, a low
  metallic hit when a chrome word locks in place. No pops, no cartoon sounds.
- Leave 0.5s of near-silence before the main reveal.

## End tag

The logo in chrome pushes out of the tunnel throat, settles over 1.5s, a thin ring readout draws around it,
and the @HANDLE types on in JetBrains Mono under it at y 1280. Hold 2s.

## Card library

Library 03 cards (the dimensional set). Card ids are written without the style prefix: look up library
number `03` in `style-library/registry.json` and prepend its style id. Cards: `t1.section.chrometunnel`,
`t1.stat.signalfield`, `t2.proof.postfloat`. Library cards are 1920x1080; in 9:16 mount them as a
full-frame plate scaled to cover with the focal object centered in y 480-1300. The set is small, so build
new elements from the same tokens (chrome ramp, fringe pair, linework) rather than borrowing from other sets.
