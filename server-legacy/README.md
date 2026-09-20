# server-legacy — NOT DEPLOYED

This directory is the original Express + Passport + Resend backend from the
Replit era. It is **not part of the production deployment** and is kept only
for reference while its remaining ideas (email notifications, Cal.com
webhooks) are re-implemented as Vercel serverless functions under `api/`.

Do not extend it. Do not add environment variables for it. It is excluded
from `npm run check` (see `tsconfig.json`) and from the Vite build.

Known issues that are the reason it is quarantined rather than shipped:

- `express-session` falls back to a hardcoded secret when `SESSION_SECRET`
  is unset
- no CSRF protection, no rate limiting
- its own copy of the data model (`storage.ts`) that has drifted from
  `shared/schema.ts`

The production app is the static SPA in `client/` (Vite build) plus the
serverless functions in `api/`, deployed on Vercel.
