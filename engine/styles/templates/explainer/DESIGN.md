# Visual Explainer (template: explainer)

Starter template. Built on card library 01 (the paper collage set: warm paper, ink, cut-out photos, one
signature blue shape per beat, hand-drawn arrows, choppy stop-motion). The brand's own answers outrank
anything here; its Nos become hard rules.

## The idea in one line

The voice tells a story and the screen builds it out of paper: cut-out photos, highlighter boxes, arrows and
numbers snap in on the exact words, so a complicated idea feels obvious by the end.

## Who it's for

Educators, analysts, finance and history explainers, researchers, and any business explaining "why this
works" or "how this happened". Best for 45-90 second videos where the idea is the star and the speaker is the
narrator. Works with or without a face.

## Format defaults

- Vertical 1080x1920, 30fps. Mostly visuals with the narrator's voice; the face appears in a torn-paper
  window (540x540, top-right at x 480-1020, y 240-780) or full frame for the hook and the close.
- Background: paper `#efe9dc` with a subtle fiber texture; ink `#17130e`.
- Text safe zone: x 90-960, y 220-1500. Graphics may bleed off-frame on purpose, text never does.
- Captions: boxed highlight, Manrope 700, 54px, sentence case, centered with baseline at y 1420, max 2 lines,
  max 26 characters per line. The spoken keyword sits in a solid blue box (`#37BDF8`, ink text, 10px radius,
  slightly rotated -1 to +1 degrees like a marker swipe).

## The signature pieces

1. **Paper collage plates.** Every beat is a collage: one cut-out subject (photo with a 6px white outline
   and a soft drop shadow), one blue shape (`#37BDF8`) behind it, one line of type. Cut-outs are real photos,
   archive images or the brand's own product shots, halftoned or desaturated to 30%.
2. **Fraunces statement type.** Fraunces 900 (or 300 for the quiet line) at 96-140px for headlines,
   max 3 words per line, left-aligned at x 90. Small metadata (dates, sources) in Manrope 600, 28px,
   uppercase, tracked +8%.
3. **Stop-motion feel.** Everything animates on twos (15fps stepped) with a back-out snap on entrance
   (0.25s). Camera on the collage drifts 2-4% over the beat with a stepped ease so it feels shot on a rostrum.
4. **Highlighter and arrows.** The key word in a headline gets a marker swipe (scaleX 0 to 1 over 0.3s,
   stepped). Hand-drawn arrows (Caveat-style, 6px stroke) point from a label to the thing it names, drawing
   on in 0.4s.
5. **Numbers get their own card.** Every statistic is a tier 1 stat card from library 01
   (`t1.stat.circle`, `t1.stat.giant-left`, `t1.stat.receipt`, `t1.stat.versus`, `t1.stat.isotype`) held
   for 2-3s. Cite the source in the card's source slot; no source, no stat.
6. **Section markers.** Each new chapter of the argument opens with a `t1.section.*` card (stacked,
   markerbox, numeral, indexcard) for 1.2-1.8s with a stepped slide transition.

## Allowed with restraint

- Mask / marker wipe transitions between chapters (one per chapter, 0.4s).
- Warm film-stock grade on archive footage only.
- A "correction" beat (`t1.section.correction`) once per video to flip a common belief.
- Editorial red `#e23b2e` for the single word that is wrong, bad, or crossed out.

## Never

- Smooth glossy motion, glow, glass or blur effects (that is a different style).
- Slow symmetric fades.
- More than one blue shape per frame.
- Stats without a source, invented charts, or charts that don't match the spoken number.
- Stock footage of people pointing at screens.
- Full captions in all caps.

## Rhythm (pace 7 of 10, density heavy)

- 0-2s: the question or the surprising fact as a stacked headline (`t1.section.stacked`), voice already
  talking on frame 0. Open a loop: "and the reason why is not what you think".
- A new collage element every 1.5-2.5s; a full new plate every 4-6s.
- Pattern interrupt every 8-10s: a stat card, a section marker, or the narrator popping in full frame.
- Build, don't replace: within a chapter, elements add onto the same plate so the viewer watches the idea
  assemble, then the whole plate wipes for the next chapter.
- The answer to the opening question lands in the final 20%, then one line of takeaway.

## Sound

- Music: minimal lo-fi or light orchestral hybrid (pizzicato, soft piano), 80-100 BPM, -24 LUFS under
  voice.
- SFX: paper rustle on cut-out entrances (-28 dB), marker squeak on highlights, a typewriter tick on number
  count-ups, a soft stamp thud on section markers. Silence for half a second before the big reveal.
- Voice up front, warm and close, -14 LUFS.

## End tag

A final paper plate: the takeaway in Fraunces 900, the brand logo on a torn-paper strip at y 1300, and the
@HANDLE in Manrope 600 under it, 2s hold. The blue shape scales in last behind the logo.

## Card library

Library 01 cards (the paper collage set). Card ids are written without the style prefix: look up library
number `01` in `style-library/registry.json` and prepend its style id. Library cards are 1920x1080; in 9:16
mount them as a 1080x608 panel centered in y 520-1128 on the paper background, or rebuild the layout at
1080x1920 keeping the same tokens. Favorites: `t1.section.stacked`, `t1.section.markerbox`,
`t1.section.numeral`, `t1.section.correction`, `t1.stat.circle`, `t1.stat.giant-left`, `t1.stat.receipt`,
`t1.stat.versus`, `t1.stat.isotype`, `t1.overview.stepper`, `t1.overview.index-cards`,
`t2.label.margin-note`, `t2.label.underline`, `t2.label.pin`, `t2.lower-third.marker`.
