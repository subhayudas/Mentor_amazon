# Backend Services Hosting Requirements

This document lists all backend services and infrastructure components that need to be hosted for the MentorConnect application.

## 1. **Express.js Application Server** ⚠️ REQUIRES HOSTING
- **Type**: Node.js/Express API Server
- **Location**: `server/index.ts`
- **Port**: Configured via `PORT` env variable (default: 5000)
- **Requirements**:
  - Node.js runtime (v18+ recommended)
  - Environment variables configured
  - Persistent process (PM2, systemd, or container orchestration)
  - HTTPS/SSL certificate for production
  - Reverse proxy (nginx, Caddy) recommended
- **Hosting Options**:
  - VPS (DigitalOcean, Linode, AWS EC2)
  - Platform-as-a-Service (Railway, Render, Fly.io, Heroku)
  - Container platforms (Docker on VPS, Kubernetes)
  - Serverless (AWS Lambda, Vercel, Netlify Functions) - requires refactoring

## 2. **PostgreSQL Database** ✅ ALREADY HOSTED
- **Type**: Relational Database
- **Provider**: Neon Database (serverless PostgreSQL)
- **Status**: Already configured and hosted
- **Connection**: Via `DATABASE_URL` environment variable
- **Note**: If migrating from Neon, consider:
  - AWS RDS
  - Google Cloud SQL
  - Azure Database for PostgreSQL
  - Self-hosted PostgreSQL on VPS

## 3. **Session Storage** ⚠️ REQUIRES CONFIGURATION
- **Type**: Session management
- **Current**: In-memory sessions (not production-ready)
- **Recommended**: PostgreSQL-backed sessions using `connect-pg-simple`
- **Requirements**:
  - Session table in PostgreSQL database
  - Session cleanup job (optional, for expired sessions)
- **Note**: Already using same database, just needs configuration change

## 4. **File Storage Service** ⚠️ REQUIRES HOSTING
- **Type**: File upload storage
- **Current**: Local filesystem (`uploads/` directory)
- **Issues with current approach**:
  - Not scalable across multiple servers
  - Files lost on server restart/redeploy
  - No CDN for fast delivery
- **Recommended Solutions**:
  - **Cloud Storage** (Recommended):
    - AWS S3 + CloudFront CDN
    - Google Cloud Storage
    - Azure Blob Storage
    - DigitalOcean Spaces
  - **Alternative**: Network-attached storage (NFS) if using multiple servers
- **Files Stored**:
  - User profile images
  - Mentor photos
  - Other uploaded assets
- **Migration Required**: Update `server/routes.ts` upload handler

## 5. **Static Assets Server** ⚠️ REQUIRES HOSTING
- **Type**: Static file serving
- **Location**: `attached_assets/` directory
- **Current**: Served by Express static middleware
- **Requirements**:
  - CDN for global delivery (recommended)
  - Or serve via Express (acceptable for small scale)
- **Recommended Solutions**:
  - AWS S3 + CloudFront
  - Cloudflare CDN
  - Vercel/Netlify for static assets
  - Or keep with Express if using single server

## 6. **Email Service** ✅ EXTERNAL SERVICE
- **Type**: Transactional emails
- **Provider**: Resend API
- **Status**: Already configured via `RESEND_API_KEY`
- **No hosting required**: External SaaS service
- **Usage**:
  - Password reset emails
  - Booking confirmation emails
  - Notification emails

## 7. **Cal.com Integration** ✅ EXTERNAL SERVICE
- **Type**: Calendar/scheduling service
- **Provider**: Cal.com
- **Status**: External service, no hosting required
- **Requirements**:
  - Webhook endpoint must be publicly accessible
  - Endpoint: `/api/webhooks/calcom`
  - Configure webhook URL in Cal.com dashboard

## 8. **Environment Variables** ⚠️ REQUIRES CONFIGURATION
All environment variables must be configured on the hosting platform:
- `PORT` - Server port (default: 5000)
- `SESSION_SECRET` - Session encryption secret (change in production!)
- `DATABASE_URL` - PostgreSQL connection string
- `RESEND_API_KEY` - Email service API key
- `ALLOWED_ORIGINS` - CORS allowed origins (comma-separated)
- `NODE_ENV` - Environment (development/production)

## Hosting Architecture Recommendations

### Option 1: Single Server (Simple)
- **Application**: Express server on VPS
- **Database**: Neon (current) or self-hosted PostgreSQL
- **Storage**: Local filesystem (not recommended) or cloud storage
- **Pros**: Simple, cost-effective
- **Cons**: Single point of failure, limited scalability

### Option 2: Platform-as-a-Service (Recommended for MVP)
- **Application**: Railway, Render, or Fly.io
- **Database**: Neon (current) or PaaS database
- **Storage**: Cloud storage (S3, etc.)
- **Pros**: Easy deployment, auto-scaling, managed infrastructure
- **Cons**: Vendor lock-in, potentially higher cost at scale

### Option 3: Container-Based (Scalable)
- **Application**: Docker container on VPS or Kubernetes
- **Database**: Managed PostgreSQL or containerized
- **Storage**: Cloud storage (S3, etc.)
- **Pros**: Scalable, portable, production-ready
- **Cons**: More complex setup, requires DevOps knowledge

### Option 4: Serverless (Advanced)
- **Application**: AWS Lambda, Vercel, or Netlify Functions
- **Database**: Neon or serverless database
- **Storage**: Cloud storage (S3, etc.)
- **Pros**: Auto-scaling, pay-per-use
- **Cons**: Requires significant refactoring, cold starts

## Priority Checklist

### Critical (Must Have)
- [ ] Express.js application server hosting
- [ ] PostgreSQL database (already have via Neon)
- [ ] Environment variables configuration
- [ ] HTTPS/SSL certificate
- [ ] File storage migration to cloud storage

### Important (Should Have)
- [ ] Session storage migration to PostgreSQL
- [ ] CDN for static assets
- [ ] Monitoring and logging setup
- [ ] Backup strategy for database
- [ ] Domain name and DNS configuration

### Nice to Have
- [ ] Load balancer (if scaling)
- [ ] Auto-scaling configuration
- [ ] CI/CD pipeline
- [ ] Staging environment

## Estimated Monthly Costs (Rough)

- **VPS (DigitalOcean/Railway)**: $5-20/month
- **Neon Database**: Free tier available, $19+/month for production
- **Cloud Storage (S3)**: $0.023/GB storage + transfer costs
- **CDN (Cloudflare)**: Free tier available
- **Email (Resend)**: Free tier (3,000 emails/month), $20+/month for more
- **Domain**: $10-15/year

**Total Estimated**: $25-60/month for small to medium scale

## Next Steps

1. Choose hosting platform
2. Set up Express server deployment
3. Migrate file storage to cloud (S3, etc.)
4. Configure PostgreSQL-backed sessions
5. Set up monitoring and logging
6. Configure domain and SSL
7. Set up backup strategy
8. Test webhook endpoints are publicly accessible

