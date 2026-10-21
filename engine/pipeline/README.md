# Editing pipeline

The pipeline contains local, provider-independent tools for ingest, precise cutting, captions, motion graphics,
audio mixing, rendering, and verification. Create an ignored workspace with `npm run new-video -- <slug>`, load
the active style, and follow the lane-specific skill under `.claude/skills/`.

For a review revision, preserve the original asset, translate each timecoded comment into an explicit edit,
render and inspect the complete result, then upload it as a new version. The app-side claim/reply/resolve protocol
is described in `../../flo/skills/creative-flo/SKILL.md`.

Common checks:

```sh
npm run preflight -- video-projects/<slug>
npm run scribe-gate -- video-projects/<slug>/final.mp4
npm test
```

Structural checks do not replace watching the encoded video and listening to every audio join.
