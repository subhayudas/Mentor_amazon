# Design Guidelines: Mentor Matching Platform

## Design Approach

**Reference-Based Approach** drawing from professional networking and booking platforms:
- **LinkedIn**: Professional profile presentation and trust-building elements
- **Calendly**: Clean booking interface and scheduling UX patterns
- **ADPList/MentorCruise**: Mentor discovery and matching interfaces

**Core Principle**: Visually impressive through clean execution, strong hierarchy, and professional polish—not through complexity or excessive ornamentation.

## Typography System

**Font Families** (via Google Fonts):
- **Primary**: Inter (400, 500, 600, 700) - for UI, body text, and data
- **Accent**: Cabinet Grotesk or similar geometric sans (700, 800) - for hero headlines only

**Hierarchy**:
- Hero Headlines: 3xl to 5xl, font-weight-800
- Section Headers: 2xl to 3xl, font-weight-700
- Card Titles: lg to xl, font-weight-600
- Body Text: base, font-weight-400
- Metadata/Labels: sm, font-weight-500, uppercase tracking

## Layout System

**Spacing Primitives**: Use Tailwind units of **2, 4, 8, 12, 16** (as in p-4, gap-8, space-y-12, mb-16)

**Grid System**:
- Max container width: `max-w-7xl mx-auto px-4 md:px-8`
- Mentor cards: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8`
- Analytics cards: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4`

**Section Padding**: py-12 (mobile) to py-20 (desktop)

## Component Library

### Navigation
- Fixed top navigation with logo left, navigation center, user profile/CTA right
- Clean, minimal nav with subtle border bottom
- Mobile: Hamburger menu with slide-out drawer

### Hero Section
- 70vh height with strong typographic headline
- Two-column layout: Left (headline + subtext + CTA), Right (hero image)
- CTA: Primary button with backdrop-blur on image backgrounds
- Include trust indicator: "Trusted by 500+ mentees" or similar

### Mentor Cards
- Clean card with subtle border, no heavy shadows
- Card structure: Mentor photo (top, square or circular), Name, Title/Expertise, Bio snippet (2 lines), Specialties (3-4 tags), "Book Session" CTA
- Hover state: Subtle lift (translate-y-1) and border emphasis
- Photo: Use circular avatars (w-20 h-20 or w-24 h-24) positioned top-center or top-left

### Mentor Profile Page
- Two-column layout: Left (sticky) - Mentor details, expertise, bio; Right - Calendly widget embed
- Full mentor bio with expertise tags, experience, and ratings/reviews if applicable
- Calendly widget in clean iframe with proper spacing (min-h-[700px])

### Analytics Dashboard
- Four-column metric cards showing: Total Sessions, Active Mentors, Sessions This Month, Avg. Rating
- Each card: Large number (text-4xl font-bold), Label below (text-sm), Icon accent
- Recent sessions table: Clean, striped rows, columns for Mentor, Mentee, Date, Status
- Use simple bar chart for "Sessions per Mentor" using div-based bars, not canvas

### Form Elements
- Consistent input styling: border, rounded-lg, px-4 py-3
- Focus states: ring-2 with accent ring
- Labels: text-sm font-medium mb-2
- Buttons: rounded-lg px-6 py-3, font-semibold

## Images

**Hero Section**: 
- Large hero image on right side showing professional mentorship scene (modern office, video call, or professional collaboration)
- Image should convey trust, professionalism, and connection
- Dimensions: Approximately 600x500px, high quality

**Mentor Avatars**:
- Professional headshots, circular format
- Consistent sizing across all cards (96x96px or 128x128px)
- Placeholder: Use gradient circles with initials if no photo

**No additional decorative images needed** - keep focus on mentor profiles and functionality

## Animations

**Minimal, purposeful only**:
- Card hover: `transition-transform duration-200 hover:-translate-y-1`
- Button hover: Built-in states only
- Page transitions: None
- Loading states: Simple spinner for Calendly widget loading

## Page Structure

### Browse/Home Page
1. Hero (headline, description, search/filter CTA)
2. Featured Mentors section (3-column grid, 6-9 mentors)
3. Stats/Social Proof (centered, 4-column metrics)
4. How It Works (3 steps with icons)
5. All Mentors grid (filterable)

### Mentor Profile Page
1. Back navigation
2. Two-column: Mentor details + Calendly embed
3. Sessions booked count display

### Analytics Dashboard (Admin/User)
1. Metrics overview (4 cards)
2. Recent sessions table
3. Sessions per mentor chart

**Key Design Note**: Maintain generous whitespace, avoid clutter. Every element should have clear purpose. Professional, trustworthy aesthetic prioritized over flashy effects.