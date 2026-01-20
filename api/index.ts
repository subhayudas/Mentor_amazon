import type { VercelRequest, VercelResponse } from '@vercel/node';
import serverless from 'serverless-http';
import express from 'express';
import path from 'path';
import session from 'express-session';
import { registerRoutes } from '../server/routes';
import { serveStatic } from '../server/vite';

// Create Express app
const app = express();

// CORS configuration
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:4000', 'http://localhost:5000', 'http://localhost:5173'];
  
  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

app.use("/attached_assets", express.static(path.resolve(process.cwd(), "attached_assets")));

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

// Use memory store for sessions on Vercel (stateless)
// For production, consider using a database-backed session store
app.use(session({
  secret: process.env.SESSION_SECRET || 'mentor-connect-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax',
    path: '/',
  },
  name: 'mentor.sid',
}));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      console.log(logLine);
    }
  });

  next();
});

// Initialize routes and serve static files
let appInitialized = false;
let initPromise: Promise<void> | null = null;
let serverlessHandler: ReturnType<typeof serverless> | null = null;

async function initializeApp() {
  if (appInitialized) return;
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    await registerRoutes(app);
    
    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
    });

    serveStatic(app);
    
    // Wrap Express app with serverless-http for proper serverless compatibility
    serverlessHandler = serverless(app, {
      binary: ['image/*', 'application/pdf', 'application/octet-stream'],
    });
    
    appInitialized = true;
  })();
  
  return initPromise;
}

// Vercel serverless function handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  await initializeApp();
  
  if (!serverlessHandler) {
    throw new Error('Serverless handler not initialized');
  }
  
  // Use serverless-http to properly handle the Express app in serverless environment
  return serverlessHandler(req, res);
}

