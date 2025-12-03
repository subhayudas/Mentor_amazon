# Design Guidelines: MentorConnect for Amazon UAE

## Brand Identity

**Platform Name**: MentorConnect
**Client**: Amazon UAE
**Design Philosophy**: Professional, trustworthy, and accessible mentor-student booking platform that reflects Amazon's brand values

## Amazon Brand Guidelines

### Color Palette

**Primary Colors**:
- **Amazon Navy**: #232F3E (Primary background, headers, dark text)
- **Amazon Orange**: #FF9900 (CTAs, links, active states, accent)

**Supporting Colors**:
- **Background**: #FFFFFF (White, primary background)
- **Text Primary**: #0F1111 (Nearly black, body text)
- **Text Secondary**: #565959 (Gray, metadata, labels)
- **Borders**: #D5D9D9 (Light gray, dividers, card borders)
- **Success**: #067D62 (Green, confirmations)
- **Error**: #C40000 (Red, errors, warnings)

### Typography System

**Font Families** (Amazon Ember with fallbacks):
- **Primary**: Amazon Ember Regular (body text, inputs)
- **Bold**: Amazon Ember Bold (headings, buttons)
- **Fallback**: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif

**Hierarchy**:
- Hero Headlines: 3xl to 5xl, font-weight-700 (Amazon Ember Bold)
- Section Headers: 2xl to 3xl, font-weight-700
- Card Titles: lg to xl, font-weight-600
- Body Text: base, font-weight-400
- Metadata/Labels: sm, font-weight-500

**Logo Usage**:
- Place Amazon logo in top-left corner of navigation
- Minimum clear space: 1.5x the height of the smile arrow
- Never distort, recolor, or modify the logo
- Use SVG format for scalability

## Layout System

**Spacing Primitives**: Use Tailwind units of **2, 4, 6, 8, 12, 16**

**Grid System**:
- Max container width: `max-w-7xl mx-auto px-4 md:px-8`
- Mentor cards: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`
- Analytics cards: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4`

**Responsive Breakpoints**:
- Mobile: < 768px (1 column)
- Tablet: 768px - 1024px (2 columns)
- Desktop: > 1024px (3 columns)

## Component Library

### Navigation
- Fixed top navigation with Amazon logo left, navigation center
- Height: h-16
- Background: Amazon Navy (#232F3E)
- Text color: White
- Border bottom: subtle 1px border
- Mobile: Drawer/sidebar on mobile

### Buttons

**Primary Button** (CTAs, main actions):
- Background: Amazon Orange (#FF9900)
- Text: White
- Padding: px-6 py-3
- Border radius: rounded-md
- Hover: Slightly darker orange
- Font: font-semibold

**Secondary Button** (alternative actions):
- Background: White
- Text: Amazon Navy (#232F3E)
- Border: 1px solid Amazon Navy
- Padding: px-6 py-3
- Border radius: rounded-md
- Hover: Light gray background

### Mentor Cards
- Clean card with border (1px, #D5D9D9)
- Border radius: rounded-lg
- Padding: p-6
- Background: White
- Card structure:
  - Mentor photo (circular, 96x96px or 120x120px)
  - Name (text-xl font-bold, Amazon Navy)
  - Position @ Company (text-base, Text Secondary)
  - Timezone (text-sm, with icon)
  - Industry badges (2-3 max, small pills)
  - Expertise badges (3-4 max, smaller pills)
  - Rating (stars + average + count)
  - Languages (flags + text)
  - "Book a Meeting" button (Primary button style)
- Hover state: Subtle elevation (shadow-md), no transform

### Forms

**Input Fields**:
- Border: 1px solid #D5D9D9
- Border radius: rounded-md
- Padding: px-4 py-3
- Focus: 2px Amazon Orange border
- Font size: text-base
- Background: White

**Labels**:
- Font size: text-sm
- Font weight: font-medium
- Color: #0F1111
- Margin bottom: mb-2

**Validation**:
- Error messages in red (#C40000) below fields
- Success indicators in green (#067D62)
- Inline validation on blur

### Badges/Tags

**Industry Badges**:
- Background: Light gray (#F3F3F3)
- Text: Amazon Navy
- Border radius: rounded-full
- Padding: px-3 py-1
- Font size: text-xs
- Font weight: font-medium

**Expertise Tags**:
- Background: Very light orange (#FFF5E6)
- Text: Dark orange (#CC7A00)
- Border radius: rounded-md
- Padding: px-2 py-1
- Font size: text-xs

## Page Structure

### Mentor Discovery Page (Home)
1. **Hero Section**:
   - Background: Light gradient (white to very light gray)
   - Headline: "Connect with Expert Mentors at Amazon"
   - Subtext: Brief value proposition
   - Search bar (prominent, full width on mobile)

2. **Filter Sidebar** (Desktop) / Filter Drawer (Mobile):
   - Specialization (multi-select dropdown)
   - Industry (multi-select)
   - Languages (multi-select with flags)
   - Timezone (grouped dropdown)

3. **Mentor Grid**:
   - 3 columns on desktop, 2 on tablet, 1 on mobile
   - Cards show all mentor info per spec
   - Gap: gap-6

### Mentor Profile Page
- Two-column layout:
  - **Left Column** (40%): Mentor details, bio, expertise, ratings
  - **Right Column** (60%): Cal.com embed
- Mobile: Stack vertically (details first, then Cal.com)

### Analytics Dashboard
1. **Filter Row**:
   - Date range picker
   - Mentor dropdown
   - Mentee type filter
   - Language filter
   - Specialization filter

2. **KPI Cards** (4 across):
   - Large number (text-4xl font-bold, Amazon Navy)
   - Label (text-sm, Text Secondary)
   - Icon (Amazon Orange)
   - Background: White with border

3. **Charts**:
   - Bookings over time (line chart)
   - Top mentors (horizontal bar chart)
   - Specialization distribution (pie chart)
   - Ratings table (sortable)

4. **Detailed Table**:
   - Striped rows
   - Sortable columns
   - Pagination (50 per page)
   - Export to CSV button (secondary style)

### Onboarding Forms

**Mentor Onboarding**:
- Single-page form with sections
- Progress indicator at top
- Clear section headers
- All inputs follow Amazon form guidelines
- Communication preference radio buttons
- Photo upload with preview
- Cal.com link validation
- Submit button: Primary (Amazon Orange)

**Mentee Registration**:
- Shorter form (less fields)
- User type toggle (Individual/Organization)
- Conditional organization name field
- Photo upload optional
- Areas exploring multi-select
- Submit button: Primary (Amazon Orange)

## Accessibility (WCAG 2.1 AA)
- All images have `alt` text
- Form labels properly associated
- Focus indicators: 2px Amazon Orange outline
- Color contrast ratios meet 4.5:1 minimum
- Keyboard navigation for all interactive elements
- ARIA labels for icon-only buttons

## Images

**Mentor Avatars**:
- Circular format (rounded-full)
- Consistent sizing (96x96px cards, 120x120px profile)
- Professional headshots
- Fallback: Gradient with initials if no photo

**Amazon Logo**:
- Use official Amazon logo SVG
- Place in top-left of navigation
- Clear space around logo (1.5x smile height)
- Never modify or recolor

## Animations

**Minimal and purposeful**:
- Button hover: Subtle background color change
- Card hover: shadow-md (no transform)
- Page transitions: None
- Loading states: Amazon-style spinner (orange)
- Form validation: Fade in error messages

## Mobile Responsiveness

**Breakpoint Strategy**:
- Mobile-first approach
- Filters in drawer/modal on mobile
- Mentor grid: 1 column mobile, 2 tablet, 3 desktop
- Navigation: Hamburger menu on mobile
- Cal.com widget: Full-screen modal on mobile
- Analytics: Stack KPI cards, horizontal scroll for tables

## Internationalization (Future)

**Arabic Support** (add before full rollout):
- RTL layout support
- Arabic font (Amazon Ember Arabic)
- Translated UI strings
- Date/time localization
- Number formatting

**Current MVP**: English-first, Arabic placeholder ready

## Brand Voice

**Tone**: Professional, supportive, accessible
**Writing Style**: Clear, concise, action-oriented
**Example CTAs**:
- "Book a Meeting"
- "Find Your Mentor"
- "Get Started"
- "View Profile"

**Key Design Note**: Maintain Amazon's clean, trustworthy aesthetic. Every element serves a purpose. Professional polish over flashy effects. User trust is paramount.
