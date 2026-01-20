# Vercel Deployment Fix

## Problem
After deploying to Vercel, the website was showing minified server-side JavaScript code instead of the React application. This happened because Vercel was serving the bundled server code as a static file instead of executing it as a serverless function.

## Solution
The application has been configured to work with Vercel's serverless function architecture:

1. **Created `api/index.ts`** - A Vercel serverless function handler that wraps the Express app
2. **Created `vercel.json`** - Configuration file that routes all requests to the serverless function
3. **Fixed `server/vite.ts`** - Updated the `serveStatic` function to correctly find the built static files in Vercel's environment
4. **Added `@vercel/node` dependency** - Required for Vercel serverless functions

## Files Changed
- `api/index.ts` (new) - Vercel serverless function handler
- `vercel.json` (new) - Vercel configuration
- `server/vite.ts` - Fixed static file path resolution
- `package.json` - Added `@vercel/node` dependency
- `.vercelignore` (new) - Files to ignore during deployment

## Deployment Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the application:**
   ```bash
   npm run build
   ```
   This will:
   - Build the React frontend to `dist/public`
   - Bundle the server code to `dist/index.js`

3. **Deploy to Vercel:**
   - Push your code to GitHub/GitLab/Bitbucket
   - Connect your repository to Vercel
   - Vercel will automatically detect the `vercel.json` configuration
   - Or use the Vercel CLI: `vercel --prod`

4. **Set Environment Variables in Vercel:**
   Make sure to add all required environment variables in Vercel's dashboard:
   - `DATABASE_URL`
   - `SESSION_SECRET`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (if used)
   - `RESEND_API_KEY`
   - `ALLOWED_ORIGINS` (comma-separated list of allowed origins)
   - `NODE_ENV=production`

## Important Notes

1. **Sessions**: The current setup uses in-memory sessions, which won't persist across serverless function invocations. For production, consider:
   - Using a database-backed session store (PostgreSQL with `connect-pg-simple`)
   - Or using JWT tokens instead of sessions

2. **File Uploads**: The current file upload system uses local filesystem storage, which won't work on Vercel's serverless functions. You'll need to:
   - Use cloud storage (AWS S3, Google Cloud Storage, etc.)
   - Update the upload handler in `server/routes.ts`

3. **Static Assets**: The `attached_assets` folder is served by Express. For better performance, consider:
   - Moving assets to a CDN
   - Or using Vercel's static file serving

4. **Build Output**: Make sure `dist/public` contains the built React app before deploying.

## Testing Locally

To test the Vercel setup locally:
```bash
npm install -g vercel
vercel dev
```

This will run the application in a Vercel-like environment locally.

## Troubleshooting

If you still see server code instead of the React app:
1. Check that `npm run build` completed successfully
2. Verify that `dist/public` contains `index.html` and other built files
3. Check Vercel's build logs for any errors
4. Ensure all environment variables are set in Vercel's dashboard

