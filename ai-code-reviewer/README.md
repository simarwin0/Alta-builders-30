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
- [x] Initial input validation tests authored
- [ ] Install dependencies and run TypeScript build/tests
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
2. Open `ai-code-reviewer/backend`.
3. Run `npm install`.
4. Copy `.env.example` to `.env`.
5. Set `OPENAI_API_KEY`, `MONGODB_URI`, and the same `JWT_SECRET` used by Track A.
6. Set `FRONTEND_ORIGIN=http://localhost:5173`.
7. Run `npm run dev`.

The API listens on port 4001 by default. Check `GET /health`. Use `POST /api/test-llm` to verify OpenAI connectivity.

### Frontend
1. Open `ai-code-reviewer/frontend`.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set `VITE_API_BASE_URL=http://localhost:4001`.
5. Run `npm run dev`.

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
Use the repository's `ai-code-reviewer/render.yaml` blueprint. Set `OPENAI_API_KEY`, `MONGODB_URI`, `JWT_SECRET` (same secret as Track A), and `FRONTEND_ORIGIN` in Render's environment settings.

### Vercel
Import this repository and set the project root to `ai-code-reviewer/frontend`. Set `VITE_API_BASE_URL` to the deployed Render API URL. The frontend must use the deployed Track A-compatible auth cookie/session.

## Evaluation
Do not mark model accuracy tests as passed until they have been run with a configured API key. The 10 prompt fixtures and 15 adversarial evaluation cases will be added with measured outcomes.
