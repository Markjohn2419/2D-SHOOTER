# Game

## Full-Stack (Leaderboard)

This project includes a backend API + database leaderboard:

- Backend: Vercel Serverless Function at `/api/leaderboard`
- Database: Supabase (Postgres)

### 1) Create the Supabase table

In Supabase SQL Editor, run:

```sql
create table if not exists public.leaderboard (
	id bigint generated always as identity primary key,
	created_at timestamptz not null default now(),
	name text not null,
	score int not null,
	wave int not null,
	mode text not null
);
```

### 2) Configure Vercel Environment Variables

In Vercel Project Settings → Environment Variables, add:

- `SUPABASE_URL` = your Supabase project URL (example: `https://xxxx.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY` = your Supabase **service role** key (keep secret)

Redeploy after setting env vars.

### 3) Verify it works

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
