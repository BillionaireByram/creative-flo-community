# Cinematic Story — Sample Creator's storytelling style

B, 2026-10-07: "I really want to incorporate this storytelling feel or a more cinematic feel to all these videos ...
Everything needs to be like it's shot on damn near a Red camera." A second style next to Creative Flo Blue (which stays
the default). Built from the Adrian Per study (`docs/creative-flo/STORYTELLING-PLAYBOOK.md`): one real take becomes a
short film with many perspectives. Real camera for the truth, AI camera angles and reenactment shots for the range.

## The idea in one line

Every line of the story gets its own picture. The video should feel like a short film B directed, not a talking head
with graphics on top.

## Who it's for

Same audience as Creative Flo Blue: aspiring entrepreneurs and service business owners. Best for story-led videos:
a lesson from a book, a client story, a turning point, faith and purpose, behind the scenes.

## Format defaults

- Vertical 1080x1920. Delivered at 30 fps but every shot is conformed to a 24 fps film cadence first.
- Never letterbox bars (B: "the video is vertical").
- Phone-safe text zone: x 90–990, y 200–1600. Subtitles sit at y ≈ 1330–1420.

## The camera (what makes it look like a cinema camera)

1. **One grade over everything.** Every clip, real or AI, goes through the same film grade before it is placed
   (`grade-cine`, ffmpeg recipe below), so generated shots and the real camera read as one camera package:
   soft highlight roll-off, slightly lifted blacks, warm skin, cool shadows, saturation pulled back, gentle halation
   on highlights, fine moving grain, light vignette.
2. **Real first.** B: "use as many of the real ones of myself as possible, so it's still looking real." The real
   camera (wide plus punch-ins at 1.15x to 1.3x) carries at least 60% of the runtime and every hard truth.
3. **Two AI jobs, two models.** Kling 3.0 Omni (`transformation`) re-angles B's real take while he talks (side close-up,
   3/4 profile, high wide); it keeps his mouth and gestures on his voice. Seedance 2.5 makes B-roll where B isn't
   talking (hands praying, light through clouds, someone stuck at a laptop). Kling `reference-to-video` makes the
   reenactments of B from his photos (reading, filming, walking the city). Never the AI low angle looking up (B: the
   mouth looked wrong). AI shots carry 2–2.5 s beats and cut on a phrase change, never mid-word.
4. **Slow camera moves.** Speaker: 1.00 → 1.05 push over a beat; AI shots: slow push or slow drift, never a fast zoom.
   Punch-ins are a straight cut to a tighter crop (+18% to +30%), not an animated zoom.

## Skin

| | |
|---|---|
| Base | warm ink `#0B0A08` |
| Paper | cream `#F2EADB` (paper cards, framed photos), grid lines `rgba(11,10,8,.08)` |
| Story gold | `#F5C542`: word cards and the one phrase that matters |
| Text | film white `#F7F3EA` |
| Captions | Kinetic captions (`cap-kinetic`, `pipeline/kinetic.py`, `theme="italic"`): light Inter Italic small words, Inter ExtraBold Italic hero word (solid gold or white), one script accent word, soft shadowed edges, no dark oval |
| Labels | Roboto Mono 400, wide tracking, uppercase, small (chapter numbers, "No. 1") |
| End tag | Creative Flo logo · "Find your Flo." · REVIEW.EXAMPLE.COM in film white on ink |

## The signature pieces

1. **Kinetic captions** (B, 2026-10-08: "Yes!! thats the one!"). Every word lands on its spoken word. A compact
   block on the chest, about half the frame wide, so the video stays the main thing. Mostly bold: small words in
   Inter Bold fade up out of a soft blur; one hero word per phrase in Inter Black wipes in left to right, white or a
   gold gradient; one script accent word (Mr Dafoe) writes on with a slight tilt. Some phrases sit faded and light up
   word by word. A soft dark halo keeps white text readable on light clothing. No full-screen text cards. Write
   `build/kinetic.txt` by hand at natural phrases (start from `Kinetic.auto()`), then
   `Kinetic(...).build(spec, hide=K.FULL)`.
2. **The hero word is the word card.** No separate gold word cards on top of kinetic captions: the gold hero word in
   the caption block does that job. At most one script word and one hero line per phrase.
3. **Paper cards.** For titles, book names and quotes: a cream paper card (with a faint grid) held in frame with a soft
   drop shadow, the real or AI shot behind it. Typewriter-free, nothing handwritten.
4. **Framed footage.** When B references something (a book, a post, a client), the clip sits inside a white-bordered
   print on paper with a slight tilt, like Adrian's polaroids.
5. **Chapter marks.** Long videos break into chapters: mono `No. 1` label + one gold word, full frame on ink, 1 s.
6. **Reenactment beats.** Story lines are acted out in AI shots generated from B's reference photos (reading, writing,
   at the laptop, walking the city at dusk), each held 1.5–2.5 s.
7. **End tag** on ink with the Creative Flo logo, "Find your Flo.", REVIEW.EXAMPLE.COM.

## Motion

- Hard cuts on phrase changes are the main transition. One soft light leak on emotional beats. No zoom-blur, no
  glitch, no iris or mask reveals, no growing shapes around B's face.
- Word cards land on their spoken word (Scribe v2 timing) and leave on the next cut.
- Grain and halation are part of the grade, not overlays that pulse.

## Rhythm

- Hook in the first 3 s with a picture change by 2.3 s.
- A new picture every 2–3 s (B: "not that many cuts ... every two to three seconds would be ideal"); the real camera may
  hold up to 3.6 s on the key line.
- Insert shot (hands, object) every 3–4 s on long stretches.
- Script structure (Kallaway loop): stakes, big question, head fake, re-hook.

## Sound

- Music: the same chill-hop beds as Creative Flo Blue (chill-a default), mixed lower under story lines (−22 LUFS bed
  under −14 LUFS voice), with a short drop to silence before the key line.
- Room tone stays in; no swoosh on hard cuts. One soft riser into a chapter mark at most.
- Mix: two-pass loudnorm to −14 LUFS, peak ≤ −1 dBFS.

## grade-cine (ffmpeg recipe, applied to every clip before placement)

Kept in `grade.txt` (one line, an ffmpeg `-filter_complex` chain). v2 after B's review: skin matched to Creative Flo
Blue (B: "I like the way my skin looks in the Creative Flo one, but a little bit of cinematic"), so: 24 fps conform;
contrast 1.04, saturation 1.04, gamma 1.06; neon greens down 22%; a gentle S-curve; cool shadows; light halation (7%);
soft vignette; grain at 3 (v1 was 8, B: "bring the graininess down").

## Never

- AI low angle looking up at B (mouth reads wrong). AI shots on long talking lines.
- Italic serifs, Unbounded, Instrument Serif. Letterbox bars. Iris or mask reveals. Glitch or static sounds.
- Fake proof: no invented screenshots, results or client numbers. AI reenactments show B living the story, never a
  fabricated result.
- More than one gold phrase on screen at once. Fonts beyond Inter and the one script. Kinetic text above the chin.

## Learning log

- 2026-10-08 caption look: B prefers the italic look from the reference-matched cut ("I like these way better") at the
  compact v3 size, with soft shadowed edges and no dark oval ("I can see the whole oval"). Captions are hand-written
  per video; `Kinetic.auto()` is only a draft. B prefers the Barett Street script (needs a commercial license from Cat.B).

- 2026-10-08 kinetic captions (B: "Yes!! thats the one!"). Three rounds on CF-0027: v1 mixed six fonts and moves
  (too busy), v2 matched B's first reference (Inter italic, side placement, white and black cards; B: fonts way too
  big), v3 matched the MotionText Pro reference: half size on the chest, mostly bold plus one script, gold gradient
  hero, no cards. The pack's Barett Street is personal-use only, so the engine ships Mr Dafoe (OFL) in its place.

- 2026-10-07 v2 (B's review of the test cut): lighter grain, Creative Flo skin, Archivo instead of the serif, softer
  bolder type edges, cuts every 2–3 s, real camera first, Kling for angles and Seedance for B-roll.
- 2026-10-07: style created from the Adrian Per study and the first AI angle test (Kling 3.0 Omni transformation
  kept likeness and gestures; low angle rejected by B).
