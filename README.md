# Game

## Full-Stack (Leaderboard)

This project includes a backend API + database leaderboard:

- Backend: Vercel Serverless Function at `/api/leaderboard`
- Storage (local dev): JSON file (`data/leaderboard.json`)

### How it works

- `GET /api/leaderboard?limit=8` returns top scores
- `POST /api/leaderboard` accepts `{ name, score, wave, mode }`

In local dev (`npm start`), the dev server routes `/api/leaderboard` to the Node handler in `api/leaderboard.js` and persists data in:

- `data/leaderboard.json`

### Deploy note (Vercel)

On Vercel, the serverless filesystem is ephemeral; the default storage path is `/tmp/leaderboard.json`, so scores are not guaranteed to persist long-term.

If you want a persistent deployed leaderboard, run this on a Node server with a real disk and set:

- `LEADERBOARD_DB_PATH` to a writable persistent path

### Verify it works

After deploying, open:

- `https://YOUR-APP.vercel.app/api/leaderboard?limit=5`

On Game Over / Win, the game will submit your run and show “Top Scores”.

## Deploy (Vercel)

This project serves files from `public/`. Vercel will only deploy static files from the configured output directory, so `assets/` is copied into `public/assets/` during the build.

- Build Command: `npm run build`
- Output Directory: `public`

## Run (npm)

```powershell
Set-Location "c:\Users\nhojk\OneDrive\Desktop\Game"
npm install
npm start
```

Then open:
- http://localhost:5173

## Run (no npm)

Double-click `index.html`.
