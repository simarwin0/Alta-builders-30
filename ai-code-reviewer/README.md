# ALTA AI Code Reviewer

An AI-assisted code review platform for detecting bugs, security risks, and maintainability issues, with suggested fixes and review history.

> Project status: Phase 1 architecture committed. Backend implementation is next.

## Stack
- React + Vite + TypeScript
- Node.js + Express + TypeScript
- OpenAI Responses API with schema-constrained JSON output
- MongoDB Atlas + Mongoose
- JWT authentication
- Render (API) + Vercel (web)

## Repository layout
```
ai-code-reviewer/
  ARCHITECTURE.md
  README.md
  architecture.mmd
  backend/
  frontend/
```

## Planned capabilities
- Paste code or submit a public GitHub file URL.
- Review bugs, style/maintainability, and security.
- Severity levels: Low, Medium, High.
- Validated structured JSON reports with suggested fixes.
- Authenticated, user-scoped review history.
- Rate limiting, input caps, request timeouts, and usage logging.

## Local setup
Backend and frontend instructions will be added as their packages are implemented. Copy `.env.example` to `.env` and keep real secrets out of Git.

## Security
Submitted code is treated as untrusted data and is never executed. Never expose the OpenAI API key in browser code. AI findings are advisory and should be verified by a human reviewer.

## Architecture
See [ARCHITECTURE.md](./ARCHITECTURE.md) and [architecture.mmd](./architecture.mmd).
