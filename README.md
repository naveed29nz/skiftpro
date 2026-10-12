# SkiftPro

SkiftPro is a shift, staffing, and payroll app exported from [Base44](https://base44.com). This repository is the unmodified export (React 18 + Vite, `@base44/sdk`). A later migration to Supabase (EU) and Vercel is planned; the Base44 client and backend code are still in place.

## Run locally

Requires Node.js 18 or newer.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env.local` file in the project root (it is gitignored) and set your Base44 app values:

   ```bash
   VITE_BASE44_APP_ID=your_app_id
   VITE_BASE44_APP_BASE_URL=your_backend_url
   ```

3. Start the dev server:

   ```bash
   npm run dev
   ```

Other scripts: `npm run build`, `npm run preview`, `npm run lint`.
