# Game

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
