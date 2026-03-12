# AI Chatbot Backend

AI chat powered by Groq (Llama). Requires login (JWT from auth-service). Fetches units from auth-service for "find units near my location" queries.

## Setup

1. Copy `.env.example` to `.env` and set:
   - `GROQ_API_KEY` - Get from [Groq Console](https://console.groq.com/keys)
   - `AUTH_SERVICE_URL` - Auth service URL (default: http://localhost:3001)

2. Install and run:
   ```bash
   npm install
   npm run dev
   ```

## Docker

```bash
docker compose up --build
```

Runs on port 3003. Set `AUTH_SERVICE_URL=http://host.docker.internal:3001` when auth-service runs on host.

## API

- `GET /health` - Health check
- `POST /api/chat` - Send message (Bearer token required)

Request body:
```json
{
  "message": "Find units near my location",
  "history": [{"role": "user", "content": "..."}, {"role": "model", "content": "..."}],
  "latitude": 14.5995,
  "longitude": 120.9842
}
```

Pass `latitude` and `longitude` for "near me" queries - units are sorted by distance.

## Main Frontend

Add to `.env.local`:
```
AI_CHATBOT_URL=http://localhost:3003
```

Chat is available via the floating widget (when logged in) or `/chat` page.
