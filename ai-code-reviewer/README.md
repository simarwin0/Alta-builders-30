# ALTA AI Code Reviewer

An AI-assisted code review platform for detecting bugs, security risks, and maintainability issues, with suggested fixes and review history.

## Current implementation status

- [x] System architecture and flowchart
- [x] Isolated development branch and project directory
- [x] TypeScript Express API scaffold
- [x] OpenAI Responses API integration with strict JSON Schema output
- [x] Senior reviewer prompt and runtime Zod validation
- [x] Pasted-code input and public GitHub file URL resolver
- [x] Helmet, CORS, request size cap and API rate limiting
- [x] Track A-compatible JWT cookie/session validation
- [x] MongoDB review persistence and user-scoped history endpoint
- [x] React/Vite responsive reviewer dashboard
- [x] Initial input validation and report-schema tests authored\n- [x] Track A sign-in screen and saved history loading\n- [x] Production review routes mounted in the shared Track A API\n- [x] Ten baseline review fixtures authored (live model verification still pending)
- [x] Fifteen adversarial evaluation fixtures authored (live scoring still pending)
- [x] User-scoped review detail and deletion APIs
- [x] Short-lived per-user result cache and token usage logging
- [ ] Confirm the latest CI run is green for all three packages
- [ ] Run live OpenAI tests and verify 10 prompt fixtures
- [ ] Complete 15-case evaluation and publish results
- [ ] Connect production MongoDB and configure deployment secrets
- [ ] Deploy and verify Render + Vercel production URLs

> A checked implementation item means source files have been added; it does not imply a live API call or production deployment has been verified.

## Stack
- React + Vite + TypeScript
- Node.js + Express + TypeScript
- OpenAI Responses API with schema-constrained JSON output
- MongoDB Atlas + Mongoose
- Track A-compatible JWT cookie authentication
- Render (API) + Vercel (web)

## Repository layout
```
ai-code-reviewer/
  ARCHITECTURE.md
  architecture.mmd
  render.yaml
  backend/
    src/
      input/
      middleware/
      models/
      reviewer/
      __tests__/
  frontend/
    src/
```

## Local setup

### Backend
1. Install Node.js 20 or newer.
2. Open the existing Track A `backend/` directory at the repository root.
3. Run `npm install`.
4. Copy `backend/.env.example` to `backend/.env`.
5. Keep the existing Track A `MONGODB_URI` and `JWT_SECRET`; add `OPENAI_API_KEY` and optionally `OPENAI_MODEL=gpt-6-luna`.
6. Set `CLIENT_ORIGIN=http://localhost:5173`.
7. Run `npm run dev` (API on port 4000).

Check `GET /health`, then use the authenticated `POST /api/reviews/test-llm` to verify OpenAI connectivity.

### Frontend
1. Open `ai-code-reviewer/frontend`.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set `VITE_API_BASE_URL=http://localhost:4000`.
5. Run `npm run dev` and sign in with your existing Track A username/password.

## API
- `GET /health` — service health.
- `POST /api/test-llm` — server-side OpenAI connectivity check.
- `POST /api/reviews/analyze` — authenticated code or public GitHub file review.
- `GET /api/reviews/history?page=1&limit=20` — authenticated, user-scoped history.

Analyze request examples:
```json
{ "code": "const answer = 42;", "language": "javascript", "filename": "example.js" }
```
```json
{ "githubUrl": "https://github.com/owner/repo/blob/main/src/index.ts" }
```

The analysis/history routes use the existing Track A session cookie and JWT issuer/audience contract. In production, configure the same `JWT_SECRET` and use HTTPS so the `__Host-chat_session` cookie can be sent to the API with credentials.

## Security
- Submitted code is treated as untrusted data and is never executed.
- GitHub URL fetching is restricted to HTTPS GitHub hosts, disables redirects, and caps file size/time.
- OpenAI keys and MongoDB credentials stay on the server.
- Analysis requires a valid Track A session; review history is scoped to the authenticated user.
- API findings are advisory and must be verified by a human reviewer.

## Deployment

### Render
Deploy the existing Track A API using the repository-root `render.yaml` blueprint. The AI review endpoints are mounted inside that same API process so the host-only Track A JWT cookie works. Add `OPENAI_API_KEY` in Render's environment settings and keep it server-side. The existing `MONGODB_URI` and `JWT_SECRET` are reused; do not create a second user database or a second JWT secret for production.

### Vercel
Import this repository and set the project root to `ai-code-reviewer/frontend`. Set `VITE_API_BASE_URL` to the exact same Render API origin used by Track A login. Set the Render `CLIENT_ORIGIN` to the Vercel deployment origin. The standalone `ai-code-reviewer/backend` is for local isolated development only; do not deploy it as a separate production hostname while relying on the host-only Track A cookie.

## Evaluation
Do not mark model accuracy tests as passed until they have been run with a configured API key. The 10 prompt fixtures and 15 adversarial evaluation cases will be added with measured outcomes.
