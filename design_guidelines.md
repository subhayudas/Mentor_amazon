# Design guidelines: MentorConnect (Amazon UAE mentorship)

MentorConnect is a request-first mentor marketplace: a mentee finds an Amazon mentor, sends a request with a goal, the mentor accepts, and the two pick a time on the mentor's calendar link. Every screen is designed around that truth. This file describes the system that ships; the tokens live in `client/src/index.css` and `tailwind.config.ts`, the primitives in `client/src/components/ui/`, and the shared helpers in `client/src/lib/format.ts`, `lib/availability.ts`, `lib/search.ts`, `lib/urlState.ts`.

## Principles

1. Concept first: every screen makes the next decision obvious before it adds polish.
2. Bounded tasks live in dialogs and sheets (booking request, withdraw, decline, complete, filters); pages do not become long branching scrolls.
3. Honest data only: no invented metrics, no slot promises, no "verified" badges without a source. Ratings show only when `total_ratings > 0`; availability windows are labelled self-reported and in the mentor's time zone; analytics say whose rows they show.
4. EN and AR are equal products: every string goes through `t()`, layouts use logical properties, and Arabic is set with its own type compensation.
5. Motion clarifies state; it never decorates.

## Tokens

Colour (HSL triplets consumed through the shadcn contract `hsl(var(--x) / <alpha-value>)`):

| Token | Value | Use |
| --- | --- | --- |
| `--brand-navy` / `--secondary` | #232F3E | headings, navy buttons, active tab underline, focus ring |
| `--brand-orange` / `--primary` | #FF9900 | the single primary action per viewport; text on it is navy (white on orange is 2.14:1 and fails) |
| `--background` | #F8F9FA | app canvas |
| `--card` | #FFFFFF | surfaces, 1px `--border`, no shadow |
| `--foreground` | #0F1111 | body text |
| `--muted-foreground` | #565959 | secondary text (7.07:1 on white) |
| `--border` | #D5D9D9 | structural hairlines (decorative) |
| `--input` | #767B7B | control boundaries (≥ 3:1, WCAG 1.4.11) |
| `--success` / `--warning` / `--info` / `--destructive` | #067D62 / #FFFAEB+#7A4B00 / #E8EEF6+navy / #C40000 | status tones, always with text |
| `--chart-1..5` | navy, #C45500, #137F8B, #5A6169, #B15D00 | chart series (never orange; every fill ≥ 3:1 on white) |

Orange budget: at most one orange fill per viewport (hero search submit on `/`, "Request a session" on a profile, "Send request" in the dialog, the CTA band button). The header has none; `/mentors` has none. Small emphasis (the request rail's done/current stop) is the only other orange.

Radius: `--radius` 8px (controls, cards), 6px medium, 4px small, 12px dialogs/sheets, pill for chips and avatars. Elevation: none on cards; `--shadow-elevated` only for dialogs, popovers and menus.

Typography: Inter 400/500/600 for Latin, Noto Sans Arabic for Arabic (per-glyph fallback), roles as classes: `text-display`, `text-h1`, `text-h2`, `text-h3`, `text-body`, `text-body-sm`, `text-caption` (mobile twins `-sm`). Headings wrap balanced. Arabic gets +1px per role, weight 500 where Latin uses 600, taller leading and zero letter-spacing. Numbers use tabular figures and Latin digits in both languages (`ar-AE-u-nu-latn`).

Spacing: 8px rhythm, `container-page` (max 1200px, 16/24/32px gutters), sections `py-12 md:py-16`.

Focus: a 2px navy outline with 2px offset on `:focus-visible` everywhere; on navy or orange surfaces the ring becomes orange with a white inner ring.

## Motion

Strong ease-out (`cubic-bezier(0.23, 1, 0.32, 1)`), durations 120/160/220 ms (`duration-fast/base/slow`), press feedback `scale(0.97)`. Dialogs fade + scale from 0.98 (180 ms in, 120 ms out); popovers/selects/tooltips scale from 0.97 at their Radix transform origin (140 ms); sheets travel from their logical edge (240/200 ms, drawer curve). Tooltips: 300 ms first delay, instant siblings. No entrance animation on data arrival, no stagger, no animation on chips/tabs/typing. Under `prefers-reduced-motion` travel and scale are removed, opacity/colour cues stay, spinners keep spinning.

## Signature component: the request rail

`components/RequestRail.tsx` draws the three real steps (request sent → mentor replies → pick a time) as a vertical ledger whose stop states map to booking statuses. It is the hero's product artifact, the profile's "what happens next", the booking dialog's explanation, the success state, and the dashboard's "Needs your action" card. It is an `<ol>` with `aria-current="step"`, a check icon for done stops, and needs no RTL mirroring.

## Page patterns

- Landing `/`: type-led hero, search as the primary action, real example chips and trust line computed from `mentors_public`, rail card, six real mentor cards, typographic "what people come with" rows, FAQ, navy CTA band, compact footer. Phones get a separate composition under 2400px.
- Discovery `/mentors`: `PageHeader` + `SearchIntent`, a filter rail (Expertise, Language, Accepting requests; more under a disclosure) or a mobile filter drawer, removable active-filter chips, URL-backed state (`?q&expertise=a|b&language&available=1&near=1&sort`), one `['mentors']` query filtered client-side in both languages, skeletons with final geometry, explicit zero/error states.
- Mentor card: avatar · name · status badge, credential line, two-line "helps with", ≤ 3 expertise chips + "+n" popover, two caption meta lines, one outline "View profile" anchor that makes the whole card a single tab stop.
- Profile `/mentor/:id`: header with trust cues, "What I can help with" → About → Session style; sticky request card (status, rail, time-zone note, one orange button, self-reported availability); mobile bottom bar. Not-accepting mentors show text and "Find similar mentors" instead of a disabled button.
- Booking: one-step `ResponsiveDialog` (fullscreen on phones), zod messages through `t()`, specific copy for rate-limit and not-accepting errors, in-dialog success with honest next steps for anonymous and signed-in requesters, discard guard when the goal is dirty, sent-request memory in `localStorage`.
- Dashboards: `PageHeader` + tab row (icon + ≤ 2 words, sticky on phones), next session first, "Needs your action", pending with withdraw, past table including declined/cancelled; every status through `StatusBadge` (text + colour).
- Analytics: scope line (all programme sessions vs your sessions), period control, comparison toggle, summary sentence, four tiles with definitions, weekly bars with a table toggle, stacked outcomes bar, country bars with an exact-value table, ranked mentor table, CSV export; demo data only after a successful fetch below the threshold.

## RTL and localization rules

Logical properties only (`ps- pe- ms- me- start- end- text-start`), `rtl:-scale-x-100` on directional icons only, Radix `DirectionProvider` at the root, `<bdi>`/`bidi()` around names, emails and codes, `dir="auto"` on free text, `dir="ltr"` on emails and numeric runs, all dates/times/numbers through `lib/format.ts`, charts LTR inside an RTL page with mirrored horizontal bars.

## Accessibility bar

One `h1` per page via `PageHeader`, landmarks and a skip link, visible focus everywhere, 44px primary controls on phones, no hover-only content, disabled controls carry a reason (`aria-disabled` + helper) unless in flight, form errors wired with `aria-describedby` and focused, dialogs trap and restore focus, live regions for result counts, `alt` on images, contrast checked for every token pair listed above.
