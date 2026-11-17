# AI Code Reviewer API integration

These routes are mounted in the existing Track A Express API so they share its database connection, CSRF/CORS policy, and host-only HttpOnly JWT session cookie.

## Routes
- `POST /api/reviews/test-llm` — authenticated OpenAI connectivity check.
- `POST /api/reviews/analyze` — authenticated code or public GitHub file analysis; persists the validated report for the signed-in user.
- `GET /api/reviews/history?page=1&limit=20` — authenticated, user-scoped history; source code is excluded from list responses.

## Request bodies
Pasted code:
```json
{ "code": "const answer = 42;", "language": "javascript", "filename": "example.js" }
```

Public GitHub file:
```json
{ "githubUrl": "https://github.com/owner/repository/blob/main/src/index.ts" }
```

Exactly one of `code` and `githubUrl` is required. Maximum source size defaults to 30,000 characters.

## Environment
Add `OPENAI_API_KEY` and optionally `OPENAI_MODEL` to the existing Render backend service. `MONGODB_URI` and `JWT_SECRET` are reused from Track A. Never add the OpenAI key to frontend environment variables.

## Authentication
The frontend first checks `GET /api/users/me` and signs in through the existing `POST /api/auth/login` endpoint. It then calls review endpoints with `credentials: include`. This is why the production reviewer API must remain on the same Render API origin as Track A.

Submitted code is never executed. AI output is schema-validated before persistence and must be reviewed by a human before changes are applied.
