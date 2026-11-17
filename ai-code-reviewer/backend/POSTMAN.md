# API test collection guide

Set `baseUrl` to `http://localhost:4001`.

## 1. Health
- Method: GET
- URL: `{{baseUrl}}/health`
- Expected: HTTP 200 with `status: ok`.

## 2. OpenAI connectivity
- Method: POST
- URL: `{{baseUrl}}/api/test-llm`
- Body: none
- Expected: HTTP 200, `success: true`, model name and short message.
- Requires a valid server-side `OPENAI_API_KEY`.

## 3. Analyze pasted code
- Method: POST
- URL: `{{baseUrl}}/api/reviews/analyze`
- Headers: `Content-Type: application/json`
- Body:
```json
{
  "code": "function divide(a, b) { return a / b; }",
  "language": "javascript",
  "filename": "example.js"
}
```
- Requires the Track A `chat_session` cookie locally or `__Host-chat_session` cookie in production.
- Expected: validated `report`, model, usage and saved `reviewId`.

## 4. Analyze a public GitHub file
- Same endpoint and authentication.
- Body:
```json
{
  "githubUrl": "https://github.com/owner/repository/blob/main/src/index.ts"
}
```

## 5. Review history
- Method: GET
- URL: `{{baseUrl}}/api/reviews/history?page=1&limit=20`
- Requires the Track A session cookie.
- Expected: only the signed-in user's saved reviews. Code snapshots are omitted from history responses.

## Negative cases
- Empty code: HTTP 400.
- Both `code` and `githubUrl`: HTTP 400.
- Invalid or non-GitHub URL: HTTP 400.
- Oversized code: HTTP 400/413.
- Missing/invalid session: HTTP 401.
- Missing OpenAI key: HTTP 503 from the test endpoint.
