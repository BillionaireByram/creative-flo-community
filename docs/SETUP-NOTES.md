# Verified setup notes

These are the shortest commands verified for this community snapshot.

## Review app

```sh
cp .env.example .env
docker compose -f docker-compose.dev.yml config
docker compose -f docker-compose.dev.yml up --build
```

Open `http://localhost:3000`; API documentation is at `http://localhost:8000/docs`. The compose configuration
was validated from the repository root. The first account created through setup becomes the instance admin.

Required app settings are `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `FRONTEND_URL`, and the S3/MinIO variables
`S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, and `S3_SECRET_KEY`. Email login also needs either SMTP
(`MAIL_PROVIDER=smtp`, `SMTP_HOST`, optional credentials) or AWS SES credentials. Keep `.env` private.

## Editing agent and engine

Create a dedicated Creative Flo user such as `agent@example.com`, add it to the project, and set:

```env
CF_AGENT_EMAILS=agent@example.com
CREATIVE_FLO_URL=https://review.example.com
CREATIVE_FLO_AGENT_EMAIL=agent@example.com
CREATIVE_FLO_AGENT_PASSWORD=replace-with-a-strong-password
CREATIVE_FLO_BRAND=your-brand-slug
ELEVENLABS_API_KEY=
```

`CF_AGENT_EMAILS` belongs to the API environment. The `CREATIVE_FLO_*` variables belong only in the Claude Code
environment running `flo/skills/creative-flo/SKILL.md`. `ELEVENLABS_API_KEY` is optional and enables Scribe
transcription; never commit any of these values.

Install and check the engine:

```sh
cd engine
npm ci
npm run setup
npm test
npm run check
```

The agent polls the API for due feedback; it does not require SSH, an outbound webhook, or a social-posting
service. The owner queues work with **Have Flo check now** in a video or **Review all now** in the Review folder.

## Verification commands

```sh
# API (requires a reachable PostgreSQL test database as configured by apps/api/tests/conftest.py)
python3 -m pytest apps/api/tests/ -q

# Web
corepack pnpm install
corepack pnpm --filter web test
corepack pnpm --filter web exec tsc --noEmit
corepack pnpm --filter web build

# Engine Python checks
uv run --with numpy --with pillow python engine/tests/cut_joins_test.py
uv run --with numpy --with pillow python engine/tests/style_frames_test.py
```

The web install depends on `pnpm-workspace.yaml`; keep it with the repository. Production compose syntax was
also validated with `docker compose --env-file .env.example -f docker-compose.prod.yml config`.
