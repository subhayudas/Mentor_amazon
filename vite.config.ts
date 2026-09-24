import { existsSync, readFileSync } from "fs";
import type { IncomingMessage, ServerResponse } from "http";
import path from "path";
import { Readable } from "stream";
import { defineConfig, type Connect, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const API_ROOT = path.resolve(import.meta.dirname, "api");

// Dev only. With MC_LOCAL_API=1 the Vercel functions below run inside the dev server
// (scripts/e2e/env.sh provides their env). The SSO routes additionally need
// AMAZON_OIDC_ISSUER (the local mock IdP, scripts/e2e/mock-idp.ts); without it the SSO
// entry keeps sending people back to /login with a clear reason.
const LOCAL_API_ROUTES: Record<string, string> = {
  "/api/requests": "requests.ts",
  "/api/webhooks/cal": "webhooks/cal.ts",
  "/api/cron/reminders": "cron/reminders.ts",
};
const LOCAL_SSO_ROUTES: Record<string, string> = {
  "/api/auth/login/amazon": "auth/login/amazon.ts",
  "/api/auth/callback/amazon": "auth/callback/amazon.ts",
  "/api/auth/logout": "auth/logout.ts",
  "/api/auth/debug-claims": "auth/debug-claims.ts",
};

function localApiFile(pathname: string): string | undefined {
  if (process.env.MC_LOCAL_API !== "1") return undefined;
  const file = LOCAL_API_ROUTES[pathname] ?? (process.env.AMAZON_OIDC_ISSUER ? LOCAL_SSO_ROUTES[pathname] : undefined);
  return file ? path.join(API_ROOT, file) : undefined;
}

/**
 * Calls a Vercel Node handler the way the platform does: `req` is a readable stream that
 * still carries the raw body (the Cal.com webhook verifies its signature over those bytes)
 * plus the parsed `body` and `query` helpers; `res` is the Node response.
 */
async function runVercelHandler(server: ViteDevServer, file: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    const raw = Buffer.concat(chunks);
    const headers: IncomingMessage["headers"] = { ...req.headers };
    // Each E2E spec gets its own rate-limit bucket (dev server only).
    const e2eIp = headers["x-e2e-client-ip"];
    if (typeof e2eIp === "string" && e2eIp) headers["x-forwarded-for"] = e2eIp;
    else if (!headers["x-forwarded-for"]) headers["x-forwarded-for"] = req.socket.remoteAddress ?? "127.0.0.1";
    let body: unknown;
    if (raw.length > 0 && String(headers["content-type"] ?? "").includes("application/json")) {
      try {
        body = JSON.parse(raw.toString("utf8"));
      } catch {
        body = undefined;
      }
    }
    const query = Object.fromEntries(new URL(req.url ?? "/", "http://localhost").searchParams);
    const vercelReq = Object.assign(Readable.from(raw.length > 0 ? [raw] : []), {
      method: req.method,
      url: req.url,
      headers,
      body,
      query,
      socket: req.socket,
    });
    const mod = (await server.ssrLoadModule(file)) as { default: (rq: unknown, rs: ServerResponse) => Promise<void> };
    await mod.default(vercelReq, res);
  } catch (err) {
    server.config.logger.error(`[local-api] ${path.relative(API_ROOT, file)} failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "server_error" }));
    }
  }
}

/**
 * `vite preview` with MC_APPLY_VERCEL_HEADERS=1 serves the production build behind the
 * headers from vercel.json (CSP and friends), so E2E sees the same policy as production.
 * The hosted Supabase origins in the CSP are swapped for the local stack's origin, and
 * `upgrade-insecure-requests` is dropped because the local stack is plain http.
 */
function vercelHeaders(): Array<[string, string]> {
  const config = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "vercel.json"), "utf8")) as {
    headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  };
  const global = config.headers?.find((h) => h.source === "/(.*)")?.headers ?? [];
  const supabase = new URL(process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321");
  return global.map(({ key, value }) => {
    if (key.toLowerCase() !== "content-security-policy") return [key, value];
    const csp = value
      .replace(/https:\/\/\*\.supabase\.co/g, supabase.origin)
      .replace(/wss:\/\/\*\.supabase\.co/g, `ws://${supabase.host}`)
      .replace(/;\s*upgrade-insecure-requests/g, "");
    return [key, csp];
  });
}

export default defineConfig({
  plugins: [
    // `api/` are Vercel serverless functions (Amazon SSO, requests, webhooks, cron). Plain
    // Vite cannot run them: without MC_LOCAL_API the SSO entry returns to /login with a
    // clear reason and every other /api path answers 503 instead of the SPA's not-found page.
    {
      name: "mentorconnect-local-api",
      configureServer(server) {
        server.middlewares.use((req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
          const url = req.url ?? "";
          if (!url.startsWith("/api/")) return next();
          const pathname = new URL(url, "http://localhost").pathname.replace(/\/+$/, "");
          const file = localApiFile(pathname);
          if (file && existsSync(file)) {
            void runVercelHandler(server, file, req, res);
            return;
          }
          if (url.startsWith("/api/auth/login/amazon")) {
            res.statusCode = 302;
            res.setHeader("Location", "/login?error=sso_unavailable_local");
            res.end();
            return;
          }
          res.statusCode = 503;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "api_unavailable_in_vite_dev", hint: "Run with MC_LOCAL_API=1 (source scripts/e2e/env.sh), `vercel dev`, or use the deployment." }));
        });
      },
      configurePreviewServer(server) {
        if (process.env.MC_APPLY_VERCEL_HEADERS !== "1") return;
        const headers = vercelHeaders();
        server.middlewares.use((_req, res, next) => {
          for (const [key, value] of headers) res.setHeader(key, value);
          next();
        });
      },
    },
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: app code changes far more often than these,
        // so returning visitors only re-download what actually changed. Pages
        // are code-split in App.tsx, which is what keeps recharts inside the
        // Analytics chunk. Do not add a manual "recharts" chunk: Rollup folds a
        // manual chunk's transitive deps (clsx, react-is, ...) into it, which
        // makes the entry chunk depend on the recharts chunk.
        manualChunks(id) {
          // Rollup's CommonJS interop helper is needed by react/react-dom; keep it
          // with them so no other vendor chunk becomes a dependency of the entry.
          if (id.includes("commonjsHelpers")) return "vendor-react";
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules\/(react|react-dom|scheduler|wouter|regexparam|mitt|use-sync-external-store|@tanstack\/(react-query|query-core))\//.test(id)) {
            return "vendor-react";
          }
          if (id.includes("node_modules/@supabase/")) return "vendor-supabase";
          if (/node_modules\/(i18next|react-i18next|i18next-browser-languagedetector|html-parse-stringify|void-elements)\//.test(id)) {
            return "vendor-i18n";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    fs: {
      strict: false,
      allow: [".."],
    },
  },
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
});
