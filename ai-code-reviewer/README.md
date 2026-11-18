# Alta Standalone AI Code Reviewer

This is a separate Node.js service. It does not use the Alta chat backend, its MongoDB database, its JWT cookie, or its authentication routes.

## Features

- Google sign-in using Google Identity Services (popup flow) and server-side ID-token verification. Users enter their Google password only on Google's own sign-in page; this application never receives or stores Gmail passwords.
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
| `GOOGLE_ALLOWED_EMAILS` | `*` to allow every Google account with a verified email, or a comma-separated list to restrict access to specific email addresses |

Optional:

| Key | Value |
| --- | --- |
| `OPENAI_MODEL` | `gpt-4.1-mini` (default) |
| `MAX_REVIEW_CODE_CHARS` | `30000` (default) |

Never put OAuth client secrets or the OpenAI key in browser code, GitHub, or frontend environment variables. Do not reuse the chat app's JWT secret or MongoDB URI here.

## Configure Google sign-in

1. Open the Google Cloud Console and select the project used for this reviewer.
2. Configure Google Auth Platform and set the app audience to **External** if people outside your Google Workspace need access. While publishing status is **Testing**, add your Google account under **Test users**; for broad access, publish the app according to Google's requirements.
3. Create an OAuth client with application type **Web application**.
4. Under **Authorized JavaScript origins**, add this exact origin (no trailing slash and no path):
   `https://alta-ai-code-reviewer.onrender.com`
5. Copy the OAuth **Client ID** into the Render environment variable `GOOGLE_CLIENT_ID`. This popup-based sign-in flow does not require a Client Secret or an OAuth callback URL.
6. Set `GOOGLE_ALLOWED_EMAILS=*` to allow all Google accounts with verified email addresses, or enter a comma-separated allowlist for restricted access.
7. Save Render changes and wait for the deploy to finish. Visit `/health`; `googleAuthConfigured` and `googleAccessConfigured` should both be `true`.

**Security:** Using `*` lets any Google account with a verified email pass the app-level sign-in gate. That can allow others to use the reviewer and consume your OpenAI budget. For private access, replace `*` with your own email address or a comma-separated list of approved accounts. Google's own audience, testing, publishing, and account policies still apply. Do not ask users to type Gmail passwords into this app.

## Routes

- `GET /` — reviewer web interface.
- `GET /health` — service and configuration booleans (never returns secret values).
- `GET /api/auth/google/bootstrap` — issues a short-lived nonce and returns the public Google Client ID.
- `POST /api/auth/google/credential` — verifies the Google ID token, nonce, and access policy before creating a session.
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

For local Google sign-in, add `http://localhost:10000` to the OAuth client's Authorized JavaScript origins and use the same `GOOGLE_CLIENT_ID`.

Then open http://localhost:10000.

## Limits and safety notes

- Only approved, Google-verified email accounts can use Google sign-in.
- Public GitHub file URLs only; private repositories are not fetched.
- Default maximum source size is 30,000 characters.
- The service does not execute submitted source code.
- AI findings are suggestions and must be verified by a human.
- Review requests are rate-limited to five per minute per service instance.
- This service does not store review history; deploys and restarts do not retain submitted source.
