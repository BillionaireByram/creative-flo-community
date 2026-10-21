# Story Explainer — B's approved storytelling look

B, 2026-10-08, on CF-0027 ("yes thats it !", then posted on every platform the same day). A talking-head story that
stays real, with explainer animations that show the idea while B says it. Built from three rounds of notes:
"use as many of the real ones of myself as possible", the Kling side angle "looks too ai", "I still want to have some
visual imagery of storytelling ... the Vox style or the explaining video style ... a little of what we use on Creative Flo",
and the kinetic captions from the reference-matched cut ("I like these way better, mixed with the visual animations").

## The idea in one line

The real camera tells the story; every big idea gets one picture that explains it.

## Picture

- Real camera for about 60% or more of the runtime: wide plus straight-cut punch-ins (1.15x to 1.28x), a new picture
  every 2 to 3 s.
- AI only for B-roll where the speaker is off screen (Seedance 2.5): hands, stairs, a person at a laptop, light.
  **Never** an AI angle or reenactment of the speaker's face (B: "it looks too ai").
- One grade over everything (`grade.txt`, same as Cinematic Story v2): Creative Flo skin with a light film touch, grain 3.
- No end tag. The video ends right after the last spoken word (B: "just end the video after i talk").

## Captions

Kinetic captions, `pipeline/kinetic.py` with `theme="italic"`, written by hand per video
(`pipeline/stages/examples/kinetic-cf0027.txt` is the approved reference; `Kinetic.auto()` is only a draft):
light Inter Italic small words, one Inter ExtraBold Italic hero word per phrase (white or solid gold), soft shadowed
edges, no dark oval, blocks alternating left, right and centre beside the speaker, a few ghost lines that light up
word by word, one-word beats for fast runs. No script font. Hidden under explainer scenes (`hide=K.FULL`).

## Explainer scenes (`pipeline/explainkit.py`)

About a third of the runtime, one per big idea, each anchored to its spoken words
(`pipeline/stages/examples/story-explainer-cf0027.py` is the approved reference):

| When B says | Scene |
|---|---|
| a book title | `book`: Vox paper desk, the cover drops in, the title gets a gold highlighter stroke |
| a quote he reads | `quote`: a paper page, each word highlighter-swept as he says it |
| a stuck feeling (hesitating, overthinking) | `loop`: a light circles a drawn ring, then an arrow breaks out to the next step |
| A leads to B | `flow`: Creative Flo glass node cards in gold, a drawn path, a light travelling along it, a script label |
| a list (skills, steps) | `checklist`: glass rows that pop and tick on their words, the active row glows |
| "not X, but Y" | `flow` with a muted direct line crossed out, then the real path through the middle node |

Paper scenes use cream `#EFE7D8`, ink `#14110C`, gold highlighter. Glass scenes use warm ink, a faint gold grid,
Inter Black labels, gold line drawings with a soft glow, at most one Mr Dafoe script label per scene.

## Sound

Voice to −14 LUFS (peak ≤ −1 dBFS), chill-a bed low under it, faded out on the last word. Scribe v2 gate on the
final render.

## Posting

The same day through Creative Flo: a video package for Instagram, TikTok, YouTube, Facebook and X (the X caption is
one line, no line breaks), then the series (carousel +2 h, X +3 h, thread +4 h) written by Flo from the video's
own lines.

## Never

- AI angles or reenactments of the speaker. Logo or URL end cards. Dark ovals behind captions. Script fonts in the
  captions. Italic serifs, Unbounded, Instrument Serif. Letterbox bars. Glitch sounds. Text over the face.
- Explainer scenes back to back for more than one idea, or more than about a third of the runtime.
- Invented proof, numbers or results inside a diagram.

## Learning log

- 2026-10-08 created from CF-0027 (posted the same day): kinetic italic captions + Vox paper + Creative Flo glass
  diagrams, real camera ~62%, AI ~8% (B-roll only), no end tag.
