# Pulsefolio — Personal Stock Tracker

A Vercel-ready Next.js stock portfolio tracker.

## Features
- Portfolio positions with shares and average cost
- Live-ish market quotes through a server-side Yahoo Finance chart endpoint
- Watchlist
- Price alerts
- P&L and allocation dashboard
- 90-day mini charts
- Local browser persistence via localStorage
- Responsive dark interface

## Run locally
```bash
npm install
npm run dev
```

Open http://localhost:3000

## Deploy to Vercel
Upload this project to GitHub, import the repository in Vercel, and deploy. No environment variable is required for the included market-data endpoint.

## Notes
Market data can be delayed, unavailable, or rate-limited. This project is for tracking/education and is not financial advice.