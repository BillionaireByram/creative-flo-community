# Motion MCP background plates

Motion (`motion` MCP server, https://mcp.motion.so/mcp) is an AI producer, not a frame-accurate renderer. Use it for
**text-free animated background plates** under our HTML panels. The words, diagrams and timing stay in HyperFrames.
First used on IMG_3795 v4 (2026-10-03); B: "much better".

## What it gives you (measured 2026-10-03)
- `create_video` takes a brief and runs Motion's agent in "medium" mode, asynchronously. You get a finished MP4
  (1080x1920, 30 fps, H.264, AAC track) at `output.download_url`, a signed link that expires in about an hour.
- No alpha, no Lottie, no PNG sequence. Length is a bucket (`<10s`, `10-30s`, ...), not exact seconds.
- Aspect ratios: 9:16, 16:9, 1:1, 4:5, 21:9. Brand: `design_md` / `design_system_id` (custom design files are a
  Pro-plan feature; on Flex, put the hex palette in the prompt).
- Cost: 2.5¢ per credit. A ~10 s two-plate job was ~69 credits, a follow-up ~16 credits (~$2 total).
  A job took ~10 min; a follow-up ~9 min. `create_followup` revises a finished job.

## Recipe
1. One job per edit, several plates in it: "~N second 9:16 BACKGROUND plate, hard cuts at exactly 5.0 s, 10.0 s …",
   one section per panel, each section ≥ the panel's scene duration (+0.5 s).
2. Brief: ZERO text, numbers, logos, UI cards, people, captions; no intro/outro/end card; strict palette
   (`#070A12` base, `#00A0FF` light, amber `#FFB869` sparks only); keep the bottom third dark (captions);
   continuous motion; say where our overlay sits ("energy centred where I overlay a hub and six nodes").
3. Download, then QA before mounting:
   - contact sheet `ffmpeg -i raw.mp4 -vf "fps=1,scale=270:-1,tile=6x2" -frames:v 1 sheet.jpg`;
   - motion check: PSNR between frames 0.5 s apart. ~32–35 dB = moving; ≥ 45 dB = near-static, so send a follow-up.
     (IMG_3795: section A came back at 48 dB, and the follow-up got it to 32.)
4. Cut each plate to its scene, strip audio, align the composition to our overlay:
   `ffmpeg -ss <start> -t <dur> -i raw.mp4 -an -vf "crop=1080:1860:0:60,pad=1080:1920:0:0:color=0x070A12" -c:v libx264 -crf 16 -pix_fmt yuv420p -r 30 assets/motion/<scene>.mp4`
   (the crop/pad shifts the plate up 60 px, used when Motion centres at y 960 and our hub sits at y 900).
5. Mount: `cls = K.motion_bg("<scene>", t0, t1)` and use it as the panel class
   (`<div class="{cls}"><div class="grid"></div></div>`). The panel switches to the see-through `panel mvp` grade.
   No asset means the plain living panel, so a build never breaks.
6. Draft render → full-size frames on the scene: titles readable, plate moving, captions clear.

## Where it beats HTML, where it doesn't
- Good: hero idea panels (an operator wired into a team, a flowing pipeline, energy, data). 1–3 per long video.
- Keep HTML: text-led or word-synced panels (staircases, counters, chat messages, before/after gaps).
