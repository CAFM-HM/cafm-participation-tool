# CAFM Participation Tool

A custom school management tool for Chesterton Academy of the Florida Martyrs.

## Features

- **Daily Tracker** — Score students on 4 virtues (Discipline, Attention, Charity, Inquiry) per class per day
- **Narrative Builder** — Generate quarterly participation narratives with sentence selection and live preview
- **Admin Dashboard** — Cross-teacher view with stats, class averages, student overview, and CSV export
- **House Points** — Leaderboard for Augustine, Athanasius, Chrysostom, and Ambrose houses
- **Conduct Log** — Track merits, demerits, detentions, and commendations per student

## Tech Stack

- React 18
- Firebase (Auth, Firestore)
- GitHub Pages (hosting)
- GitHub Actions (auto-deploy)

## Deployment

This project auto-deploys via GitHub Actions. Every push to `main` triggers a build and deploy to GitHub Pages.

No local setup required — just edit files on GitHub and push.

### If you want to run locally:

1. Install [Node.js](https://nodejs.org) (v18+)
2. Run `npm install`
3. Run `npm start`
