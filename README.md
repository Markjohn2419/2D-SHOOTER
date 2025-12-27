# 2D Shooter

## Story
You are a lone pilot caught in the hollowed ruins of a once-thriving city. Waves of abandoned defense drones, mutated strafe bots, and sentinel bosses surge from the fractured skyline. Each wave grows more aggressive, but so does your craft through practice rounds and scavenged power-ups. The goal is simply to survive as long as possible, earn your name on the leaderboard, and keep pushing the frontier while the city’s remaining AI hopes your arrival signals the dawn.

## Development stack
- **Frontend:** Vanilla HTML/CSS/JavaScript served from `public/`, with a canvas-based renderer and manual game loop layout.
- **Backend:** Vercel Serverless Function at `api/leaderboard.js` for secure leaderboard submissions, using a JSON file in `data/` during local dev.
- **Tooling:** Built with Node.js (npm scripts), Vercel CLI for deployments, and in-built dev server utilities (see `tools/`).
- **Assets:** SVG sprites and canvas-generated effects stored under `public/assets/`, with simple audio cues for hits, waves, and power-ups.

## Installation & local dev guide
1. Clone the repository and enter the folder:
   ```bash
   git clone https://github.com/Markjohn2419/2D-SHOOTER.git
   cd 2D-SHOOTER
   ```
2. Install Node dependencies:
   ```bash
   npm install
   ```
3. Start the dev server (routes API requests to `api/leaderboard.js`):
   ```bash
   npm start
   ```
4. Open the game in your browser at `http://localhost:5173`.
5. Run the smoke leaderboard tool when you want to seed or test leaderboard submissions:
   ```bash
   node tools/smoke_leaderboard.js
   ```

## Deployment notes
- The static site deploys from the `public/` directory. Assets are copied into `public/assets/` via the build step.
- `npm run build` prepares the production output, while `npm start` is enough for local iteration.
- Vercel deploys automatically from `main`, but remember serverless storage is ephemeral—set `LEADERBOARD_DB_PATH` on a persistent host for reliable leaderboard history.# Game

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
