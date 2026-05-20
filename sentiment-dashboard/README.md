# sentiment-dashboard

Vite + React 19 frontend for the [Real-Time Sentiment Dashboard](../README.md). See the root README for architecture, deployment (AWS SAM), and the full pipeline.

## Run locally

```bash
npm install
echo "VITE_API_URL=https://<api-id>.execute-api.<region>.amazonaws.com/prod/sentiment" > .env.local
npm run dev
```

Open http://localhost:3000. Vite only reads env files at startup — restart `npm run dev` after editing `.env.local`.

If the API isn't reachable, the dashboard offers a **▶ SIMULATE (DEMO MODE)** button that runs against generated mock data with the same DynamoDB schema.

## Scripts

| Command          | What it does                                  |
| ---------------- | --------------------------------------------- |
| `npm run dev`    | Vite dev server on :3000                      |
| `npm run build`  | Production build to `build/`                  |
| `npm run preview`| Serve the production build locally            |
| `npm test`       | Run Vitest once (passes with no test files)   |
| `npm run test:watch` | Vitest in watch mode                      |
