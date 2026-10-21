# Screen Tutorial (template: screen-tutorial)

Starter template. The brand's own answers outrank anything here; its Nos become hard rules.

## The idea in one line

Show, don't tell: the screen recording leads, the camera zooms to wherever the cursor is working, numbered
step cards keep the viewer oriented, and a small face bubble keeps it human.

## Who it's for

Software and app founders, tool educators, spreadsheet and design teachers, automation builders, support
and onboarding teams, and anyone teaching a process on a computer or phone. Best for 30-90 second
"how to do X in N steps" videos and product walkthroughs.

## Format defaults

- Vertical 1080x1920, 30fps (also export 16:9 for long-form when asked). Mostly visuals with the narrator's
  voice.
- Layout: the screen recording in a 1080x1080 panel centered at y 420-1500 (a 16:9 recording is cropped and
  zoomed to the working area, never shown tiny), a face bubble 300x300 circle (or rounded square, radius
  48px) at bottom-left x 90-390, y 1520-1820 only when the bottom is free of app UI, otherwise top-right
  x 690-990, y 220-520. Phone screen recordings fill the panel at full height with a device frame.
- Background behind the panel: brand navy `#1F2A44` with a 4% grid.
- Text safe zone: x 90-960, y 220-1500.
- Captions: boxed highlight, Montserrat 700, 50px, sentence case, white, max 2 lines of 28 characters,
  centered at y 1400 over the bottom edge of the panel; the action word ("click", "paste", "drag") and the
  name of the button sit in a yellow box (`#FFE14D`, black text, radius 10px).

## The signature pieces

1. **Zoom to cursor.** Every action zooms the recording to 160-220% centered on the cursor 0.3s before the
   click, holds through the action, then eases back out (0.5s, power2.inOut). Never more than 250% (text
   gets soft). Typing gets a zoom on the field.
2. **Step cards.** Each step opens with a card in the top band (y 240-400): the step number in Bebas Neue
   120px blue `#2F6BFF` on a white rounded tag, and the step name in Bebas Neue 72px white. Slides in from
   the left 0.3s, stays pinned small (40% scale, top-left) for the rest of the step so the viewer always
   knows where they are.
3. **Cursor emphasis.** A soft yellow halo (64px, 35% opacity) follows the cursor; every click shows a ring
   ripple (0.4s). Hide the real cursor jitter: smooth the cursor path.
4. **Callouts.** A rounded rectangle outline (4px, `#FFE14D`) draws around the button or field being
   named, with an arrow if it's small. Dim the rest of the screen to 60% for 1s on critical clicks.
5. **Cut the waiting.** Remove loading, scrolling hunts and typing beyond the first 3 characters (speed
   ramp to 4-8x with a small "fast-forward" chip, or cut). No moment over 1.5s where nothing happens.
6. **Grade: clean natural.** Screen recordings untouched (no tint on UI colors), face bubble lightly
   corrected to match brightness.

## Allowed with restraint

- A "before / after" split for the result (2s) at the start or end.
- Full-frame face for the hook and the closing line (2-3s each).
- Hard cuts between steps; a quick zoom blur (0.3s) only when jumping between apps.
- Keyboard shortcut keycaps (Montserrat 700 on white keys) when a shortcut is used.

## Never

- Showing a full desktop at 100% where text is unreadable on a phone.
- Exposing private data: blur emails, API keys, phone numbers, customer names and tabs (always check the
  whole frame, not just the zoom area).
- Zoom moves that don't follow the action, or zooming in and out on every second.
- Decorative transitions (glitch, light leak, whip), meme inserts, emoji spam.
- Narrating a step that isn't on screen.
- Fake UI or results that the real tool didn't produce.

## Rhythm (pace 6 of 10, density balanced)

- 0-2s: show the end result first (the finished thing working), with the hook line: "here's how to build
  this in 3 steps." That promise is the open loop.
- Steps of 8-20s each; a visual change (zoom, callout, cut, step card) every 2-3s.
- Pattern interrupt every 10-15s: a new step card, a full-frame face line, or the result preview.
- Recap the steps as a checklist card (3-5 rows, 2s) before the CTA.

## Sound

- Music: minimal lo-fi or light upbeat pop instrumental, 90-110 BPM, -26 LUFS under voice.
- SFX: soft mouse click on every visible click (-28 dB), keyboard ticks under typing, a light pop on
  step cards, a gentle chime when the final result appears. No whooshes on zooms.
- Voice clear and close, -14 LUFS.

## End tag

The finished result on screen for 1.5s with a "Done" check, then a navy card: logo centered at y 820,
the CTA ("Comment TEMPLATE for the file" or the brand's CTA) in Bebas Neue 80px yellow, and the @HANDLE in
Montserrat 600, 32px, at y 1100. Hold 2s.
