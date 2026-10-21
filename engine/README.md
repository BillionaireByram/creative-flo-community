# Creative Flo edit engine

This is the local video-editing engine used by Creative Flo. It combines frame-accurate cutting, optional
ElevenLabs Scribe transcription, HTML/GSAP motion graphics through HyperFrames, style packages, and verification
tools. Raw footage, transcripts, and renders are ignored by git.

## Local setup

Requirements: Node.js 22+, Python 3.10+, FFmpeg/ffprobe, and Chrome or Chromium.

```sh
npm ci
npm run setup
npm test
cp .env.example .env
```

Add `ELEVENLABS_API_KEY` only if you want Scribe transcription. Run `npm run style-lab -- example-client` for
the style interview and `npm run new-video -- first-edit` for an edit workspace. The complete self-hosted app
setup is in `../docs/SETUP-NOTES.md`; review-driven agent work is documented in
`../flo/skills/creative-flo/SKILL.md`.

Useful directories:

- `pipeline/` — cutting, captions, audio, and verification tools.
- `.claude/skills/` and `.agents/skills/` — editing workflows.
- `styles/house/` — generic house references.
- `styles/clients/example-ember-coffee/` — fictional client example.
- `style-library/` and `style-templates/` — reusable motion components.

## License and credits

The original engine kit is MIT-licensed by Nate Herk; see `LICENSE`. HyperFrames is Apache-2.0 and GSAP uses
its standard license. Additional notices are in `THIRD_PARTY_NOTICES.md` and `licenses/`.
