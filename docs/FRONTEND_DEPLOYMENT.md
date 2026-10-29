# Frontend deployment

Production URL: https://ozorco.com

Vercel project: `amin-lakhanis-projects/itemhive-vercel-deploy-20261027-1743`.

Connect `syedfaiqali/itemHive` in the project's Git settings and set the
production branch to `main`. Pushes and merges into `main` then run the Vercel
pipeline automatically: install with `npm ci`, build with `npm run build`,
and publish `dist` to the production domains. A failed build must finish
successfully before it replaces the production deployment.

The repository root is the frontend root. `backend/` is deployed separately
to Render. Frontend deployment settings and SPA route fallback live in
`vercel.json`; `.vercelignore` excludes backend and local artifacts from uploads.

Set `VITE_API_URL` in Vercel to `https://itemhive-8552.onrender.com/api`.
All Vite variables are public browser configuration; never put backend secrets
in a `VITE_` variable.

After a deployment, check that Vercel reports Ready, open https://ozorco.com,
and reload a frontend route such as `/login` to verify the SPA fallback.
