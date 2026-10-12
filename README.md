# SkiftPro

Shift, staffing, and payroll app for multiple organizations. The UI is the Base44 export (React 18 + Vite). Data, auth, files, and backend jobs run on Supabase, and the static build is ready for Vercel.

See [MIGRATION.md](MIGRATION.md) for applying migrations, deploying Edge Functions, environment variables, and moving data out of Base44. The hosted database is not modified just by cloning this repo.

## Run locally

Node.js 18 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local` needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Sign-in is `/login`.

`npm run build` produces `dist/` for Vercel. `vercel.json` rewrites client routes to `index.html`.
