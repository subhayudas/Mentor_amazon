# Environment for the local dev server, Playwright and the E2E scripts.
#   source scripts/e2e/env.sh && npx vite --port "$E2E_PORT" --strictPort
# Values already set in the shell win, so a single variable can be overridden per run.
# The Supabase keys are the standard, public local-development demo keys (not secrets);
# the Turnstile keys are Cloudflare's documented test keys.

# Dev server port. GoTrue only allows http://localhost:5173 as an e-mail redirect, so the
# e-mail-link flows need 5173; other runs may use another port (tracks use 5174 / 5175).
export E2E_PORT="${E2E_PORT:-5173}"

# Local Supabase (supabase start / the shared stack)
export VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-http://127.0.0.1:54321}"
export VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0}"
export SUPABASE_URL="${SUPABASE_URL:-$VITE_SUPABASE_URL}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU}"
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
export MAILPIT_URL="${MAILPIT_URL:-http://127.0.0.1:54324}"

# Serverless routes served by the Vite dev server (vite.config.ts) and their env
export MC_LOCAL_API="${MC_LOCAL_API:-1}"
export APP_ORIGIN="${APP_ORIGIN:-http://localhost:${E2E_PORT}}"
export CRON_SECRET="${CRON_SECRET:-e2e-cron-secret-0123456789abcdef}"

# Cloudflare Turnstile test keys (sitekey 1x…AA always passes and yields the token
# XXXX.DUMMY.TOKEN.XXXX; secret 1x…AA accepts it). E2E_TURNSTILE=off runs without Turnstile.
if [ "${E2E_TURNSTILE:-on}" = "on" ]; then
  export VITE_TURNSTILE_SITE_KEY="${VITE_TURNSTILE_SITE_KEY:-1x00000000000000000000AA}"
  export TURNSTILE_SECRET_KEY="${TURNSTILE_SECRET_KEY:-1x0000000000000000000000000000000AA}"
else
  unset VITE_TURNSTILE_SITE_KEY TURNSTILE_SECRET_KEY
fi

# Amazon SSO against the local mock IdP (scripts/e2e/mock-idp.ts)
export E2E_MOCK_IDP_PORT="${E2E_MOCK_IDP_PORT:-54399}"
export E2E_MOCK_IDP_CONTROL_PORT="${E2E_MOCK_IDP_CONTROL_PORT:-54398}"
export AMAZON_OIDC_ISSUER="${AMAZON_OIDC_ISSUER:-http://127.0.0.1:${E2E_MOCK_IDP_PORT}}"
export AMAZON_OIDC_CLIENT_ID="${AMAZON_OIDC_CLIENT_ID:-mentorconnect-e2e}"
export AMAZON_OIDC_CLIENT_SECRET="${AMAZON_OIDC_CLIENT_SECRET:-e2e-mock-idp-client-secret-not-a-real-one}"
export AMAZON_OIDC_REDIRECT_URI="${AMAZON_OIDC_REDIRECT_URI:-http://localhost:${E2E_PORT}/api/auth/callback/amazon}"
