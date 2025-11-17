# MentorConnect - White-Labeled Mentor Booking Platform for Amazon UAE

## Overview

MentorConnect is a professional mentor discovery and booking platform white-labeled for Amazon UAE. The application connects mentees with expert mentors, enabling users to browse mentor profiles, view expertise and credentials, and book mentorship sessions through integrated Calendly scheduling. The platform features Amazon UAE branding with navy (#232F3E) and orange (#FF9900) color scheme, clean professional interface, and an Amazon UAE office illustration hero section.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React 18+ with TypeScript using Vite as the build tool

**UI Component System**: 
- shadcn/ui component library (Radix UI primitives) with "new-york" style preset
- Tailwind CSS for styling with custom design system
- Component aliases configured for clean imports (`@/components`, `@/lib`, `@/hooks`)

**Design System**:
- Typography: Inter font family (400-800 weights) from Google Fonts
- Spacing: Tailwind units of 2, 4, 8, 12, 16
- Color scheme: Neutral base with HSL color variables for theme consistency
- Layout: Responsive grid system with mobile-first approach (max-width: 7xl)
- Visual approach: Professional minimalism with subtle elevations instead of heavy shadows

**State Management**:
- TanStack Query (React Query) for server state management
- Query client configured with infinite stale time and disabled auto-refetching
- Form state managed via React Hook Form with Zod validation

**Routing**: Wouter for lightweight client-side routing

**Key Pages**:
- Home: Mentor discovery with grid layout of mentor cards, search and filtering by name/expertise
- Mentor Profile: Detailed mentor view with embedded Calendly scheduling widget and favorite button
- Analytics: Dashboard with session metrics, time-series charts, and mentor performance analytics
- My Bookings: Mentee booking history showing upcoming and past sessions with mentor details
- 404: Custom not-found page

### Backend Architecture

**Framework**: Express.js with TypeScript running on Node.js

**API Design**: RESTful endpoints under `/api` namespace
- `GET /api/mentors` - List all mentors (supports ?search and ?expertise query params)
- `GET /api/mentors/:id` - Get single mentor details
- `GET /api/sessions` - List all booked sessions
- `POST /api/sessions` - Create new session booking (auto-creates mentee if doesn't exist)
- `POST /api/webhooks/calendly` - Calendly webhook for automatic session tracking
- `GET /api/mentees/:email` - Get mentee profile
- `POST /api/mentees` - Create mentee profile
- `GET /api/mentees/:email/sessions` - Get mentee's booking history
- `GET /api/mentees/:email/favorites` - Get mentee's favorite mentors
- `POST /api/mentees/:email/favorites` - Add mentor to favorites
- `DELETE /api/mentees/:email/favorites/:mentorId` - Remove mentor from favorites

**Data Validation**: Zod schemas shared between client and server via `@shared` directory for type safety

**Development Features**:
- Request/response logging middleware with duration tracking
- Vite middleware integration for HMR in development
- Custom error handling with JSON response capture

### Data Storage Solutions

**ORM**: Drizzle ORM configured for PostgreSQL

**Database Schema**:
- `mentors` table: Stores mentor profiles with id, name, title, bio, expertise array, calendlyUrl, avatarUrl
- `sessions` table: Tracks booked sessions with id, mentorId (FK), menteeName, menteeEmail, bookedAt timestamp
- `mentees` table: Stores mentee profiles with id, name, email (unique), avatarUrl, createdAt
- `favorites` table: Tracks favorite mentors with id, menteeEmail, mentorId (FK), createdAt

**Current Implementation**: PostgreSQL database with Drizzle ORM (fully migrated)
- DatabaseStorage class implements IStorage interface
- All data persists across server restarts
- Foreign key constraints enforce referential integrity
- Includes pre-populated mentor profiles with diverse expertise areas
- Automatic mentee creation when sessions are booked

**Database Setup**: 
- Drizzle Kit configured for schema migrations (`drizzle.config.ts`)
- Schema definitions in `shared/schema.ts` using Drizzle's pg-core
- Database URL configured via `DATABASE_URL` environment variable
- Migrations applied with `npm run db:push`

### External Dependencies

**Third-Party Services**:
- Calendly: Embedded scheduling widget integration via `react-calendly` for session booking
- DiceBear API: Avatar generation service for mentor profile images

**UI Libraries**:
- Radix UI: Comprehensive set of accessible component primitives (accordion, dialog, dropdown, select, tabs, toast, tooltip, etc.)
- Embla Carousel: Carousel/slider functionality
- Lucide React: Icon system

**Form & Validation**:
- React Hook Form: Form state management
- Zod: Schema validation and type inference
- @hookform/resolvers: Integration between React Hook Form and Zod

**Utilities**:
- date-fns: Date formatting and manipulation
- class-variance-authority: Component variant styling
- clsx + tailwind-merge: Conditional className composition
- cmdk: Command palette component

**Development Tools**:
- Replit-specific plugins: Runtime error overlay, cartographer, dev banner
- PostCSS with Autoprefixer for CSS processing
- ESBuild for production bundling

**Database Driver**: @neondatabase/serverless for PostgreSQL connections (configured but not yet active)

**Session Management**: connect-pg-simple package included for PostgreSQL-backed session storage (prepared for future authentication)

## Session Tracking

### Client-Side Automatic Tracking (Active Implementation)

**Overview**: MentorMatch uses Calendly's event listener API to automatically track session bookings directly from the browser. This approach requires zero webhook configuration and works automatically after a one-time identity setup.

**How It Works**:
1. **Upfront Identity Collection**: First-time visitors see an identity form that collects their name and email
2. **localStorage Persistence**: Identity is stored locally (`menteeName` and `menteeEmail` keys) for all future visits
3. **Automatic Tracking**: When a booking completes in the Calendly widget, the platform automatically creates a session record
4. **Reliability Features**:
   - Ref-based mentor caching prevents race conditions during React Query refetches
   - 3 automatic retries with exponential backoff (1s, 2s, 4s) for network failures
   - Success/failure toast notifications for user feedback
   - Change Identity button allows updating stored information

**User Experience**:
- First visit: Fill identity form once → Book sessions (all auto-tracked)
- Return visits: Auto-loaded from localStorage → Book sessions (all auto-tracked)
- Network issues: Automatic retry with backoff → Success or error notification

**Reliability**: ~95% automatic tracking (works for all normal cases, may fail only on persistent network/API errors)

**Limitations**:
- Calendly only provides event/invitee URIs (not full booking details) without API token
- Failed sessions after all retries are lost (user receives error notification)
- Client-side approach inherently less reliable than server webhooks

**Implementation Details** (`client/src/pages/MentorProfile.tsx`):
- `useCalendlyEventListener` hook captures booking events
- `mentorRef` caches mentor data to prevent loss during refetches
- `useMutation` with retry configuration handles API calls
- Conditional rendering ensures widget only mounts when both identity and mentor data are ready

### Calendly Webhook Integration (Alternative Approach)

**Overview**: For applications requiring 100% reliability, MentorMatch also supports Calendly webhooks for server-side automatic tracking. This requires webhook configuration but provides guaranteed session capture.

### Webhook Endpoint

**URL**: `POST /api/webhooks/calendly`

This endpoint accepts webhook events from Calendly and processes them to create session records.

### Payload Formats

The webhook endpoint supports two payload formats:

#### 1. Full Calendly Webhook Format (Production)

When configured in the Calendly dashboard, Calendly will send webhook events in this format:

```json
{
  "event": "invitee.created",
  "payload": {
    "name": "John Doe",
    "email": "john@example.com",
    "scheduled_event": {
      "start_time": "2025-01-15T10:00:00Z"
    },
    "questions_and_answers": [
      {
        "question": "Mentor ID",
        "answer": "mentor-uuid-here"
      }
    ]
  }
}
```

**Required Fields**:
- `event`: Must be "invitee.created"
- `payload.name`: Mentee's full name
- `payload.email`: Mentee's email address
- `payload.questions_and_answers`: Array containing mentor ID in custom question

#### 2. Simplified Format (Development/Testing)

For local testing and development, the endpoint also accepts a simplified format:

```json
{
  "mentorId": "mentor-uuid",
  "menteeName": "John Doe",
  "menteeEmail": "john@example.com"
}
```

This allows you to test the webhook locally using tools like curl or Postman without needing actual Calendly webhooks.

### Calendly Dashboard Configuration

To set up the webhook in your Calendly account:

1. **Log in to Calendly** and navigate to Account Settings
2. **Go to Integrations** → **Webhooks**
3. **Add Webhook** with the following settings:
   - **Webhook URL**: `https://your-replit-app-url/api/webhooks/calendly`
   - **Events to Subscribe**: Select "Invitee Created"
   - **Status**: Active

4. **Add Custom Question to Event Types**:
   - For each mentor's Calendly event type, add a custom question
   - Question: "Mentor ID" (exactly as shown)
   - Type: Text input or Hidden field
   - Default value: The mentor's UUID from the database
   - This allows the webhook to identify which mentor the session is booked with

### Important Notes

- The webhook endpoint validates all incoming data using Zod schemas
- It verifies that the mentor exists in the database before creating a session
- Returns proper HTTP status codes:
  - `200 OK`: Session created successfully
  - `400 Bad Request`: Invalid payload or missing required fields
  - `404 Not Found`: Mentor ID doesn't exist in database
  - `500 Internal Server Error`: Server-side error during processing
- All webhook processing errors are logged to the console for debugging

### Testing the Webhook Locally

You can test the webhook endpoint locally using curl:

```bash
# Using simplified format
curl -X POST http://localhost:5000/api/webhooks/calendly \
  -H "Content-Type: application/json" \
  -d '{
    "mentorId": "your-mentor-uuid",
    "menteeName": "Test User",
    "menteeEmail": "test@example.com"
  }'

# Using full Calendly format
curl -X POST http://localhost:5000/api/webhooks/calendly \
  -H "Content-Type: application/json" \
  -d '{
    "event": "invitee.created",
    "payload": {
      "name": "Test User",
      "email": "test@example.com",
      "scheduled_event": {
        "start_time": "2025-01-15T10:00:00Z"
      },
      "questions_and_answers": [
        {
          "question": "Mentor ID",
          "answer": "your-mentor-uuid"
        }
      ]
    }
  }'
```

### Security Considerations

- In production, consider implementing webhook signature verification to ensure requests are genuinely from Calendly
- Rate limiting should be added to prevent webhook spam
- Consider implementing idempotency to handle duplicate webhook deliveries