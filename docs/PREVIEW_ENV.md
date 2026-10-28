# Eget Supabase-prosjekt for Vercel Preview

Produksjon og forhåndsvisning skal ikke dele database. Denne filen oppretter ikke prosjektet. Det gjør du i Supabase-dashbordet.

## 1. Nytt prosjekt

1. Supabase → New project. Tomt prosjekt, samme region som prod (eu-central-1) er praktisk.
2. Ikke kopier produksjonsdata inn.
3. Authentication → URL configuration: legg inn preview-domenet fra Vercel (`https://<branch>.vercel.app`) og `http://localhost:5173` hvis du tester lokalt.
4. Slå av offentlig registrering hvis prod har det av.

## 2. Kjør migreringene

Fra maskinen din, mot det **nye** prosjektet. Session pooler, port **5432**:

```bash
export DATABASE_URL='postgresql://postgres.<ny-ref>:[PASSORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'
bash scripts/apply-migrations.sh
```

Scriptet nekter hvis URLen inneholder produksjonsprosjektet `iobsolszrmigdmdydfbe`. Det finnes ingen bryter du trenger for et nytt prosjekt.

To filer deler tidsstempelet `20261025160000`. Scriptet kjører `org_signup_details` før `monthly_ekstrahjelp`.

Etterpå: deploy edge functions til det nye prosjektet (`supabase link` mot den nye ref-en, deretter `supabase functions deploy`). Hemmeligheter (Stripe, e-post, Posten) settes i det nye prosjektet, ikke i Vite.

## 3. Vercel

Project → Settings → Environment Variables.

| Variabel | Production | Preview |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://iobsolszrmigdmdydfbe.supabase.co` | `https://<ny-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | publishable-nøkkelen til prod | publishable-nøkkelen til det nye prosjektet |

Ikke kryss av for at Preview skal arve Production på disse to. Development kan peke på prod eller på det nye prosjektet. `.env.local` brukes bare på din maskin.

Bygg på nytt etter at variablene er lagret. Vite baker dem inn ved build.

## 4. Varsel i appen

Hvis en Preview-build likevel peker på prod-refen, skriver nettleserkonsollen en advarsel. Det skjer fordi `vite.config.js` sender `VERCEL_ENV` inn som `import.meta.env.VITE_VERCEL_ENV`.
