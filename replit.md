# MentorMatch - Mentor Booking Platform

## Overview

MentorMatch is a professional mentor discovery and booking platform that connects mentees with expert mentors across various fields. The application enables users to browse mentor profiles, view their expertise and credentials, and book mentorship sessions through integrated scheduling. The platform features a clean, professional interface inspired by LinkedIn's profile presentation, Calendly's booking experience, and specialized mentorship platforms like ADPList.

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
- Home: Mentor discovery with grid layout of mentor cards
- Mentor Profile: Detailed mentor view with embedded Calendly scheduling widget
- Analytics: Dashboard with session metrics and reporting
- 404: Custom not-found page

### Backend Architecture

**Framework**: Express.js with TypeScript running on Node.js

**API Design**: RESTful endpoints under `/api` namespace
- `GET /api/mentors` - List all mentors
- `GET /api/mentors/:id` - Get single mentor details
- `GET /api/sessions` - List all booked sessions
- `POST /api/sessions` - Create new session booking
- `POST /api/webhooks/calendly` - Calendly webhook for automatic session tracking

**Data Validation**: Zod schemas shared between client and server via `@shared` directory for type safety

**Development Features**:
- Request/response logging middleware with duration tracking
- Vite middleware integration for HMR in development
- Custom error handling with JSON response capture

### Data Storage Solutions

**ORM**: Drizzle ORM configured for PostgreSQL

**Database Schema**:
- `mentors` table: Stores mentor profiles with id, name, title, bio, expertise array, calendlyUrl, avatarUrl
- `sessions` table: Tracks booked sessions with id, mentorId, menteeName, menteeEmail, bookedAt timestamp

**Current Implementation**: In-memory storage with seeded mentor data for development
- MemStorage class implements IStorage interface
- Includes pre-populated mentor profiles with diverse expertise areas
- Prepared for PostgreSQL migration with Drizzle schema definitions

**Migration Strategy**: 
- Drizzle Kit configured for schema migrations (`drizzle.config.ts`)
- Schema definitions in `shared/schema.ts` using Drizzle's pg-core
- Database URL expected via `DATABASE_URL` environment variable

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

## Calendly Webhook Integration

### Overview

MentorMatch uses Calendly webhooks to automatically track session bookings. When a mentee books a session with a mentor through Calendly, the platform automatically creates a session record in the database without manual intervention.

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