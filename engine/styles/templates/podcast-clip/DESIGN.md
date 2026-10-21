# Podcast Clip (template: podcast-clip)

Starter template. The brand's own answers outrank anything here; its Nos become hard rules.

## The idea in one line

Cut the single best 30-60 seconds of a long conversation into a vertical clip that feels like you walked in
on the best part: tight speaker framing, readable lowercase captions, and a quote card that makes the line
screenshot-worthy.

## Who it's for

Podcasters, interview shows, panel and live-stream hosts, coaches who record calls, and brands repurposing
long-form conversations. Best for 30-75 second clips of one strong idea, story or disagreement.

## Format defaults

- Vertical 1080x1920, 30fps, cut from a 16:9 recording. Face the whole time.
- Layouts (pick per moment):
  - **One-shot:** the active speaker cropped to fill 1080x1920, eyes at y ~620.
  - **Stacked two-shot:** host in the top half (y 0-960), guest in the bottom half (y 960-1920), each crop
    centered on the face; a 4px accent line `#FF5A36` separates them. Captions sit on the seam.
- Text safe zone: x 90-960, y 220-1500.
- Captions: lowercase native. Archivo 600, 54px, lowercase, white with a 0 3px 10px rgba(0,0,0,.6)
  shadow, 2-3 words at a time, centered at y 1240 in one-shot or on the seam (y 960) in two-shot. The current
  word is not colored; changes happen per phrase at 3-4 words per second. Speaker changes reset the caption.

## The signature pieces

1. **Follow the speaker.** Cut to whoever is talking within 6 frames of them starting. Reactions (laugh,
   nod, raised eyebrow) get a 0.6-1.2s cut-away. Use the stacked two-shot for back-and-forth exchanges
   faster than 3s per turn.
2. **Hook first, context second.** The clip opens on the most quotable sentence, lifted from inside the
   clip if needed (a 2-4s "flash-forward"), then cuts back to the start of the thought.
3. **Quote card.** The best single line becomes a card once per clip: Instrument Serif italic, 72-84px,
   white on a solid `#111111` card (radius 20px, padding 56px) at y 260-760, with the speaker's name in
   Archivo 600, 28px, accent orange. Slides up 40px and fades in over 0.4s, holds 2.5-3.5s.
4. **Speaker labels.** First time each person is on screen: name and role in a small white pill
   (Archivo 700, 26px, black text) at y 300 (one-shot) or the top of their half (two-shot), 2s.
5. **Waveform bar.** A thin live audio waveform (accent orange, 80px tall, 720px wide) centered at y 1440,
   reacting to the voice. Optional; drop it when the frame is busy.
6. **Grade: warm natural.** Match both cameras first (skin tones equal), then warm +5, contrast +8, slight
   vignette. Studio lights should not look orange.

## Allowed with restraint

- Slow push (1.00 to 1.06 over 5s) on a long single-speaker answer to keep motion alive.
- A B-roll or screenshot insert (max 2 per clip) when the speaker names something specific.
- One text emphasis per clip: a key phrase in the accent color.
- A "full episode" pill (bottom of the safe zone, 1.5s) near the end.

## Never

- Leaving both people in a static 16:9 frame letterboxed in the middle.
- Captions covering faces or the seam split crossing a mouth.
- Heavy SFX, whooshes on cuts, punch-in flashes, memes.
- Cutting mid-word or removing the breath that makes a joke land.
- Changing the meaning of what someone said by cutting around words. Keep the speaker's real point.
- Background music loud enough to compete with a conversation.

## Rhythm (pace 5 of 10, density minimal)

- 0-3s: the most quotable line, captioned, on the speaker's face. No logo, no show intro.
- 3-6s: one line of context (the question asked, or "we were talking about...") as a caption or a
  host cut-in.
- Cuts follow the conversation; remove dead air over 0.4s and all crosstalk that isn't the point.
- Pattern interrupt every 10-15s: the quote card, a layout switch (one-shot to stacked), a reaction shot.
- End on the punchline or the strongest sentence, not on a wind-down.

## Sound

- Music: none by default; if used, minimal lo-fi or soulful / boom bap at -30 LUFS, only under the hook
  and the end tag.
- SFX: none, except a soft click when the quote card lands (-30 dB).
- Dialogue: level-matched speakers, noise reduction, de-ess, -14 LUFS. Remove mic bumps and coughs.

## End tag

Last 2s: the show logo or brand mark small at y 1180 over the final frame dimmed to 50%, "Full episode"
plus the show name in Archivo 600, 32px, and the @HANDLE under it. Cut out on the end of the logo hold.
