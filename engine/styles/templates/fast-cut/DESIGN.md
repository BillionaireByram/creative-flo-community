# Fast Cut Talking Head (template: fast-cut)

Starter template. Built on card library 02 (the dark glow set: near-black canvas, blue glow, glass pills,
smooth glide-and-bloom motion). The brand's own answers outrank anything here; its Nos become hard rules.

## The idea in one line

Zero dead air. Every breath and filler word is gone, the frame changes every 1-2 seconds, and clean glowing
cards slide in beside the face to prove each point, so the viewer never finds a place to swipe.

## Who it's for

Creators, marketers, consultants and tech/business educators who talk straight to camera from one fixed
setup and want high-retention reels without heavy production. Works best for tips, frameworks, hot takes and
"3 things" videos between 20 and 60 seconds.

## Format defaults

- Vertical 1080x1920, 30fps. One locked-off talking-head take, face the whole time.
- Speaker framing: eyes on the upper third line (y ~640), head and shoulders, face never above y 260.
- Text safe zone: x 90-960, y 220-1500. Nothing below y 1500 except the progress bar (app UI lives there);
  nothing right of x 960 below y 900 (action rail).
- Captions: centered block, baseline at y 1240, max 2 lines, max 22 characters per line.

## The signature pieces

1. **Jump cuts on every pause.** Cut every silence over 0.15s and every filler ("um", "so", "like",
   restarts). Leave 2-3 frames of air before the next word so it doesn't sound clipped. Average shot length
   1.2-2.0s.
2. **Alternating framing.** Every jump cut changes scale: wide 100% to tight 115% to wide 100%, never two
   identical scales back to back. Tight shots re-center on the eyes. Every 3rd-4th cut, a hard punch-in to
   130% for 0.4-0.8s on the word that matters.
3. **Captions: karaoke glow.** Montserrat 800, uppercase, 68px, white at 55% opacity for the line, the
   spoken word lights to full white with a soft yellow glow (#F5D82A text-shadow 0 0 24px). 2-4 words per
   line, line changes on phrase boundaries, no orphan single words. Reading speed target: 3-4 words per
   second on screen.
4. **Glow cards beside the face (tier 2 first).** Glass pills and chips from library 02 slide in at
   y 260-560 (top band, above the head) on the exact word they prove: `t2.label.keyword`,
   `t2.label.chipstat`, `t2.label.checkmark`, `t2.label.toast`, `t2.label.step`, `t2.lower-third.pill`.
   Enter with a 0.35s glide (power4.out) and blur-in, hold 1.2-2.5s, exit on the next idea.
5. **One takeover per video, max two.** For the single biggest number or the list overview, a tier 1 card
   (`t1.stat.mega`, `t1.stat.bigpercent`, `t1.overview.numlist`, `t1.overview.checklist`). Library cards are
   1920x1080: mount as a full-frame plate scaled to cover with the content centered in y 520-1400, for
   1.5-2.5s.
6. **Grade: clean natural.** True-to-life skin, +8 contrast, slight clarity, no tint. The glow comes from the
   graphics, not the grade.

## Allowed with restraint

- Punch-in + white flash (2 frames, 60% opacity) on the hook line and the payoff line only.
- Zoom blur into a B-roll insert (max 1 insert per 10s, 0.8-1.5s long, screen recordings or real photos).
- Emoji: one per video max, inside a glass chip, never floating loose.
- Progress bar: 6px accent line at y 1880, filling over the video length.

## Never

- Holding a single framing longer than 3s.
- Slow fades, cross dissolves, or stepped/choppy card motion (the glow set glides, it never snaps).
- Cards covering the mouth or eyes.
- More than one saturated glow color per beat.
- Captions in the top band where the cards live, or caption blocks over 2 lines.
- Background music louder than -22 LUFS under speech.

## Rhythm (pace 9 of 10, density heavy)

- 0.0-1.0s: hook line with a 130% punch-in on frame 1 and the first caption already on screen at frame 0.
  No logo, no intro, no "hey guys".
- 1-3s: open a loop ("the third one is the one nobody does") so the viewer waits for the payoff.
- Body: a visual change (cut, scale change, card, or B-roll) at least every 2s. Count them: a 30s video has
  15-22 cuts.
- Pattern interrupt every 6-8s: a takeover card, a B-roll insert, or a whoosh-led reframe.
- Payoff lands in the final 15% with the second punch-in; CTA in the last 2s.

## Sound

- Music: upbeat pop / indie or synthwave / electronic instrumental, 100-125 BPM, ducked to -24 LUFS under
  speech, rising to -18 LUFS on wordless gaps.
- SFX: soft whoosh on every card entrance (-26 dB), pop/click on chip entrances, low boom under the
  takeover card, a riser into the payoff. No SFX on plain jump cuts. Never louder than the voice.
- Voice: noise-reduced, compressed, -14 LUFS integrated.

## End tag

Last 1.5s: the speaker's final line stays on camera (no cut to black), a glass pill slides up at y 1180 with
the CTA ("Comment GUIDE" or the brand's CTA keyword) and the @HANDLE in Space Mono under it. Logo is optional;
the face is the brand.

## Card library

Library 02 cards (the dark glow set). Card ids are written without the style prefix: look up library number
`02` in `style-library/registry.json` and prepend its style id. Favorites: `t2.label.keyword`,
`t2.label.chipstat`, `t2.label.checkmark`, `t2.label.toast`, `t2.label.step`, `t2.label.deltachip`,
`t2.lower-third.pill`, `t2.lower-third.handlebar`, `t1.stat.mega`, `t1.stat.bigpercent`, `t1.stat.multiplier`,
`t1.overview.numlist`, `t1.overview.checklist`, `t1.overview.beforeafter`.
