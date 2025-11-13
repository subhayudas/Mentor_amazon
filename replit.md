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