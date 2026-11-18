# Alta Standalone AI Code Reviewer

This is a separate Node.js service. It does not use the Alta chat backend, its MongoDB database, its JWT cookie, or its authentication routes.

## Features

- Google sign-in using OpenID Connect. Users enter their Google password only on Google's own sign-in page; this application never receives or stores Gmail passwords.
- An owner access-password fallback for administration.
- Optional email allowlist so only approved Google accounts can access the reviewer.
- HttpOnly, Secure (production), SameSite=Lax session cookie.
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

Set these in the AI reviewer service only:

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `OPENAI_API_KEY` | Your OpenAI API key |
| `REVIEWER_ACCESS_PASSWORD` | Output of `openssl rand -hex 32`; used for session signing and owner fallback login |
| `GOOGLE_CLIENT_ID` | OAuth Client ID from Google Cloud |
| `GOOGLE_CLIENT_SECRET` | OAuth Client Secret from Google Cloud |
| `GOOGLE_ALLOWED_EMAILS` | Comma-separated list of approved Google email addresses |

Optional:

| Key | Value |
| --- | --- |
| `GOOGLE_CALLBACK_URL` | `https://alta-ai-code-reviewer.onrender.com/auth/google/callback` |
| `OPENAI_MODEL` | `gpt-4.1-mini` (default) |
| `MAX_REVIEW_CODE_CHARS` | `30000` (default) |

Never put OAuth client secrets or the OpenAI key in browser code, GitHub, or frontend environment variables. Do not reuse the chat app's JWT secret or MongoDB URI here.

## Configure Google OAuth

1. Open the Google Cloud Console and select or create a project.
2. Configure the Google Auth Platform consent screen. Add the email addresses you intend to test as test users while the app is in testing mode.
3. Create an OAuth client with application type **Web application**.
4. Add this exact Authorized redirect URI:
   `https://alta-ai-code-reviewer.onrender.com/auth/google/callback`
5. Copy the OAuth Client ID and Client Secret into the Render environment variables above.
6. Add each permitted Google account to `GOOGLE_ALLOWED_EMAILS`, separated by commas.
7. Save the Render variables and wait for the deploy to finish. Visit `/health`; `googleAuthConfigured` and `googleAccessConfigured` should both be `true`.

The redirect URI must exactly match the URI registered in Google Cloud. Do not ask users to type their Gmail passwords into this application.

## Routes

- `GET /` — reviewer web interface.
- `GET /health` — service and configuration booleans (never returns secret values).
- `GET /auth/google` — begins Google sign-in.
- `GET /auth/google/callback` — verifies Google's response and creates an approved user's session.
- `POST /api/login` — owner access-password fallback.
- `GET /api/session` — checks the current session and returns its email when it is a Google session.
- `POST /api/analyze` — review pasted code or a public GitHub file; requires a session.
- `POST /api/logout` — clears the session cookie.

## Local development

```bash
cd ai-code-reviewer
npm install
OPENAI_API_KEY=your_key REVIEWER_ACCESS_PASSWORD="$(openssl rand -hex 32)" npm start
```

For local Google OAuth, register a localhost callback URL in your Google OAuth client and set `GOOGLE_CALLBACK_URL` to that exact URL.

Then open http://localhost:10000.

## Limits and safety notes

- Only approved, Google-verified email accounts can use Google sign-in.
- Public GitHub file URLs only; private repositories are not fetched.
- Default maximum source size is 30,000 characters.
- The service does not execute submitted source code.
- AI findings are suggestions and must be verified by a human.
- Review requests are rate-limited to five per minute per service instance.
- This service does not store review history; deploys and restarts do not retain submitted source.
