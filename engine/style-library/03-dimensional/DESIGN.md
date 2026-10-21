# Dimensional — design spec

## The feeling

Objects in space. Vox is printed, Kallaway glows, this one has **depth**: things
recede, metal catches a light, and thin instrument linework sits over a near-black
void with a faint RGB fringe as if it were all shot through a real lens.

Use it when the subject should feel engineered and expensive. Do not use it for
warm, friendly, or educational-explainer work — it will read as cold, which is
the point and also the limitation.

## Where it came from

Studied from short-form motion work circulating in early October 2026, the
compound.mov promo reels in particular. Three ideas were worth taking:

1. A chrome display word turning inside a tunnel built from the creator's own
   screens.
2. An instrument-style ring readout with tick marks and a tangled light trace.
3. The creator's own posts floating in 3D wearing view-count pills, as proof.

The cards here are built from those ideas, not from their assets. No imagery,
code, type or timing was copied.

## Palette

| Token | Value | Use |
|---|---|---|
| `--canvas` | `#050507` | main field, very slightly cool |
| `--canvas-deep` | `#000000` | tunnel throat, vignette floor |
| `--text` | `#FFFFFF` | primary |
| `--chrome-ramp` | gradient | all display type |
| `--fringe-warm` / `--fringe-cool` | `#FF3B30` / `#0A84FF` | lens fringe, always as a pair |
| `--accent` | `#79C8FF` | live readouts only, sparingly |

Colour is almost absent on purpose. The chrome and the fringe **are** the
palette. If a card starts needing a fifth colour, the card is wrong.

### The chrome rule

Chrome is a gradient ramp, not a colour: light at the top, a **hard** break at
the midline, light again at the base. Soften that break and the metal turns to
plastic instantly. The ramp lives in `--chrome-ramp`; never hand-roll one.

Depth on type is a stack of 1px text-shadows stepping down and away, then one
large contact shadow. It is a cheap extrusion and it holds at 1080p because the
word is always large. It will not survive a close push-in, so do not do one.

### The fringe rule

The warm and cool offsets are applied **as a pair**, in opposite directions, at
low opacity, with `mix-blend-mode: screen`. One alone reads as a rendering
mistake rather than a lens.

## Typography

- Display: **Archivo 900**, uppercase, tracking `-0.045em`. Set it big or not at all.
- Body: **Inter 500**, for captions under a stat.
- Mono: **Space Mono 700**, uppercase, tracking `0.24em`, for instrument labels
  and view counts.

## Motion

Heavy things move slowly and settle. Entrances are `expo.out` over 1.2–1.8s.
**Nothing in this style snaps.**

- Arrive from **depth** (`z`), not from an edge. This style has a camera; use it.
- Idle drift is `sine.inOut` with mismatched periods per element, so floats never
  bob in unison. Unison is what makes a float look mechanical.
- Rotations are slow and linear, and different elements turn at different rates
  so they shear against each other. That shear is what sells the depth.

## What not to do

- Do not add a fifth colour. Reach for the fringe or the chrome instead.
- Do not soften the chrome midline break.
- Do not use a single-sided fringe.
- Do not snap anything. If it needs to be fast, this is the wrong style.
- Do not push the camera close on chrome type; the stepped extrusion will show.
- Do not place a tier2 element in the face guard (x 660–1260, y 300–1080).
- Do not describe `signalfield` as audio-reactive. It is a fixed path that is
  built to look like an instrument. Claiming otherwise to a client is a lie we
  would eventually get caught in.

## Cards

| id | tier | purpose | use it for |
|---|---|---|---|
| `dimensional.t1.section.chrometunnel` | tier1 | section | chapter break; one-word subject |
| `dimensional.t1.stat.signalfield` | tier1 | stat | a single number that deserves a takeover |
| `dimensional.t2.proof.postfloat` | tier2 | proof | the social-proof beat, speaker stays on screen |

## Status

Draft. Cards lint and preview; preview MP4s and posters are not rendered yet.
