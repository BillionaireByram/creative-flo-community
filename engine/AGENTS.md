# Creative Flo engine guide

The engine turns source footage into reviewed video edits: style interview → precise cut → motion graphics
(HyperFrames + GSAP) → sound → verification. Claude Code reads `.claude/skills/`; Codex reads the generated
`.agents/skills/`. Edit `.claude/skills/`, then run `npm run sync:skills`.

## First run

If `creative-flo.config.json` is missing or has no `activeStyle`, run the `style-interview` skill before editing.
Use `styles/clients/example-ember-coffee/` as a safe example; generic house styles live under `styles/house/`.

Start each video request with the `creative-flo` skill, then load the lane-specific skill it recommends. Read
`MOTION_PHILOSOPHY.md` and the active style's `DESIGN.md` before creative work. The active client style overrides
library defaults.

## Editing rules

- Use ElevenLabs Scribe v2 when configured for cuts, captions, and the final speech check.
- Cut on measured silence, frame accurately; never mix raw and edited timestamps.
- Keep text clear of faces and inside phone-safe margins.
- Anchor scenes and sound effects to spoken words.
- Prefer real proof and supplied media; never invent results, metrics, or logos.
- Upload or publish a finished video only when the user authorizes it.

`npm run new-video -- <slug>` creates an ignored project under `video-projects/`. Run preflight, relevant
validators, and HyperFrames lint before rendering. Watch the full encoded result, inspect edit boundaries, and
listen to audio joins. Record verification evidence in the project's `VERIFY.md`.

For review-driven revisions, follow `../flo/skills/creative-flo/SKILL.md`. The agent polls the app, claims a
feedback run, applies timecoded comments, uploads a new version, and replies to and resolves handled comments.
