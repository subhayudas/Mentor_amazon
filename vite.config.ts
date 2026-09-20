import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    // `api/` are Vercel serverless functions (Amazon SSO, callbacks). Vite cannot run
    // them, so in dev the SSO entry returns to /login with a clear reason and every
    // other /api path answers 503 instead of the SPA's not-found page.
    {
      name: "mentorconnect-local-api-notice",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url ?? "";
          if (!url.startsWith("/api/")) return next();
          if (url.startsWith("/api/auth/login/amazon")) {
            res.statusCode = 302;
            res.setHeader("Location", "/login?error=sso_unavailable_local");
            res.end();
            return;
          }
          res.statusCode = 503;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "api_unavailable_in_vite_dev", hint: "Vercel serverless routes run with `vercel dev` or on the deployment." }));
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
