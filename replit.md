# MentorConnect - White-Labeled Mentor Booking Platform for Amazon UAE

## Overview

MentorConnect is a white-labeled professional mentor discovery and booking platform designed for Amazon UAE. It connects mentees with expert mentors, allowing them to browse profiles, view credentials, and book sessions. The platform incorporates Amazon UAE branding (navy and orange), features a clean, professional interface, and includes an Amazon UAE office illustration in the hero section.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend

-   **Framework**: React 18+ with TypeScript and Vite.
-   **UI**: shadcn/ui (Radix UI) with "new-york" preset, Tailwind CSS for styling.
-   **Design System**: Inter font, Tailwind-based spacing, HSL color variables, responsive grid (mobile-first, max-width: 7xl), professional minimalism.
-   **State Management**: TanStack Query for server state, React Hook Form with Zod for form state.
-   **Routing**: Wouter.
-   **Key Pages**: Home (mentor discovery, search, filtering, FAQ), Mentor Profile (details, session duration, Cal.com embed, favorite), Mentor Onboarding (multi-step form), Analytics (dashboard, metrics), My Bookings (history), Mentor Portal (email-based access, dashboard, booking requests, sessions, task manager, availability, earnings).
-   **Bilingual Support**: English/Arabic with RTL support, including Arabic translations for mentor profiles.

### Backend

-   **Framework**: Express.js with TypeScript on Node.js.
-   **API Design**: RESTful endpoints under `/api` for mentors, sessions, mentees, and webhooks.
-   **Data Validation**: Zod schemas shared between client and server.
-   **Development**: Logging middleware, Vite HMR integration, custom error handling.

### Data Storage

-   **ORM**: Drizzle ORM for PostgreSQL.
-   **Database Schema**: `mentors`, `sessions`, `mentees`, `notifications`, `favorites`, `bookings` tables. Includes pre-populated mentor profiles.
-   **Booking Workflow**: Staged request-driven flow:
    1.  **Request Submission**: Mentee submits request (status: `pending`).
    2.  **Mentor Review**: Mentor accepts/rejects via portal (status: `accepted` or `rejected`). Accepted requests trigger Cal.com scheduling link.
    3.  **Session Scheduling**: Mentee schedules via Cal.com (status: `confirmed`). Cal.com webhook updates status.
    4.  **Session Completion**: Session marked as `completed` or `canceled`.
-   **Booking Statuses**: `pending`, `accepted`, `rejected`, `confirmed`, `completed`, `canceled`.

## External Dependencies

### Third-Party Services

-   **Cal.com**: Embedded scheduling widget for session booking and webhooks for session tracking.
-   **DiceBear API**: Avatar generation for mentor profile images.

### UI Libraries

-   **Radix UI**: Accessible component primitives.
-   **Embla Carousel**: Carousel/slider functionality.
-   **Lucide React**: Icon system.

### Form & Validation

-   **React Hook Form**: Form state management.
-   **Zod**: Schema validation and type inference.
-   **@hookform/resolvers**: Integration with Zod.

### Utilities

-   **date-fns**: Date formatting.
-   **class-variance-authority**: Component variant styling.
-   **clsx + tailwind-merge**: Conditional className composition.
-   **cmdk**: Command palette component.

### Database

-   **@neondatabase/serverless**: PostgreSQL driver (configured).
-   **connect-pg-simple**: PostgreSQL-backed session storage (prepared for future authentication).