/**
 * Amazon Federate SSO callback endpoint (OIDC, authorization code + PKCE).
 *
 * Registered with Amazon's identity team as an exact-match redirect URI:
 *   https://mentor-amazon.vercel.app/api/auth/callback/amazon
 * Do NOT move or rename this route without a Federate re-registration.
 *
 * This is a placeholder: it exists so the registered URI resolves to an
 * intentional page rather than a 404 while the token-exchange handler is
 * built. It deliberately does nothing with query parameters — no code or
 * state handling happens here yet.
 */
export default function handler(req, res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MentorConnect &middot; Amazon Sign-In</title>
  <style>
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
           font-family: Inter, -apple-system, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; }
    .card { max-width: 26rem; padding: 2.5rem; background: #fff; border: 1px solid #e2e8f0;
            border-radius: 0.75rem; text-align: center; }
    h1 { font-size: 1.15rem; margin: 0 0 0.75rem; }
    p { font-size: 0.9rem; color: #475569; line-height: 1.55; margin: 0 0 1.25rem; }
    a { color: #0f172a; font-weight: 600; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Amazon Sign-In Endpoint</h1>
    <p>This is the single sign-on endpoint for the MentorConnect mentorship
       platform. It is used automatically when signing in with an Amazon
       account &mdash; there is nothing to do on this page.</p>
    <a href="/">&larr; Go to MentorConnect</a>
  </div>
</body>
</html>
`);
}
