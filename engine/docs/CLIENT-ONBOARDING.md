# Client onboarding: from install to their first edit

Every Creative Flo client goes through this once, before their first video. It's what makes every client's edits
look like *them* instead of like everyone else's.

## 1. Install
From the repository's `engine/` directory:
```sh
npm ci
npm run setup
npm test
```
Put the operator's ElevenLabs key in `.env` when Scribe transcription is wanted.

## 2. Style Lab (client, ~10 min)
`npm run style-lab -- <slug>` → send `http://localhost:4747/?client=<slug>` (tunnel it if they're remote, or publish
`onboarding/style-lab/index.html` as a private share page and have them send back the downloaded JSON).
They:
- answer the brand interview (what they sell, audience, feeling, 3 words IS/NEVER, colors, logo, pace, formats, music, CTA)
- rate 49 live samples Love / Maybe / No: 10 looks, 14 type pairings, 8 caption styles, 8 transitions, 6 grades, 3 densities
- leave notes on anything that's close
- press **I'm done**

## 3. Build + sample (agent, ~15 min)
`npm run build-style -- <slug>`, then the `style-interview` skill: finish `DESIGN.md`, render the 10 s sample,
self-check frames, send the sample to the client with what was chosen and why.

## 4. Approve + lock (client + agent)
Apply notes, re-render, and when they say yes write `creative-flo.config.json`
(`{"activeStyle": "clients/<slug>", ...}`). From now on every edit loads that style.

## 5. First edit
"edit my video at <path>". The pipeline runs Scribe v2 cuts, the stutter gate, gaze map, captions and visuals in their
style, sound, and the final gates. Every note they give after that goes into their style's learning log.

## Checklist (operator)
- [ ] `npm test` passes on the box; `npx hyperframes doctor` OK; ≥2 GB free disk
- [ ] ElevenLabs Scribe v2 works (`node scripts/transcribe-elevenlabs.mjs examples/...` or a 10 s clip)
- [ ] Style Lab answers saved in `styles/clients/<slug>/style-answers.json` + logo in `assets/`
- [ ] Sample rendered, client approved, `creative-flo.config.json` written
- [ ] First edit delivered with `VERIFY.md` and a passing Scribe v2 gate on the final render
