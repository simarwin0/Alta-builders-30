# Alta Standalone AI Code Reviewer

This is a separate Node.js service. It does not use the Alta chat backend, its MongoDB database, its JWT cookie, or its authentication routes.

## Features

- Password-protected browser interface with an HttpOnly, Secure (production), SameSite=Strict session cookie.
- Analyze pasted code or a public GitHub file URL.
- OpenAI Responses API with strict JSON-schema output validation.
- Reviews for bugs, security concerns, and maintainability.
- Submitted source is treated as untrusted text and is never executed.
- Request size limits, per-minute review rate limiting, login rate limiting, Helmet security headers, and same-origin checks.
- No source code is written to a database.

## Render service setup

Create a separate Render Web Service from this repository:

- Branch: `feature/standalone-ai-code-reviewer`
- Root Directory: leave blank
- Runtime: Node
- Build Command: `cd ai-code-reviewer && npm install --no-audit --no-fund`
- Start Command: `cd ai-code-reviewer && npm start`
- Health Check Path: `/health`
- Region: Singapore (or the closest region you prefer)

## Required Render environment variables

Set these in the NEW AI reviewer service only:

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `OPENAI_API_KEY` | Your OpenAI API key |
| `REVIEWER_ACCESS_PASSWORD` | Output of `openssl rand -hex 32` |

Optional:

| Key | Value |
| --- | --- |
| `OPENAI_MODEL` | `gpt-4.1-mini` (default) |
| `MAX_REVIEW_CODE_CHARS` | `30000` (default) |

Do not set the OpenAI key in any browser/frontend environment variable. Do not reuse the chat app's JWT secret or MongoDB URI here.

## Routes

- `GET /` — reviewer web interface.
- `GET /health` — health and configuration status (never returns secret values).
- `POST /api/login` — starts a protected browser session.
- `GET /api/session` — checks the current session.
- `POST /api/analyze` — review pasted code or a public GitHub file; requires a session.
- `POST /api/logout` — clears the session cookie.

## Local development

```bash
cd ai-code-reviewer
npm install
OPENAI_API_KEY=your_key REVIEWER_ACCESS_PASSWORD="$(openssl rand -hex 32)" npm start
```

Then open http://localhost:10000.

## Limits and safety notes

- Public GitHub file URLs only; private repositories are not fetched.
- Default maximum source size is 30,000 characters.
- The service does not execute submitted source code.
- AI findings are suggestions and must be verified by a human.
- Review requests are rate-limited to five per minute per service instance.
- This service does not store review history; deploys and restarts do not retain submitted source.
