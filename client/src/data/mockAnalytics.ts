/**
 * Demo dataset for the analytics page.
 *
 * Shown ONLY while fewer than MOCK_DATA_THRESHOLD real bookings exist, and
 * always behind the "demo data" banner. The entities below are typed exactly
 * like the real rows so the page runs one pipeline (filters, charts, drill-down,
 * CSV export) in both modes, and every demo number reconciles with every other.
 *
 * Generation is seeded, so the dataset is stable within a day; dates are
 * relative to "now" so the date-range filters have something to show.
 */

import type { Booking, Mentee, Mentor } from "@/lib/database";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date();
const TODAY_START = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());

/** Tiny deterministic PRNG (mulberry32) so the demo does not reshuffle on every render. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = seeded(20260919);
const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const chance = (probability: number): boolean => random() < probability;
/** `days` days before today at the given local hour, so "1 day ago at 14:00" is always in the past. */
const daysAgo = (days: number, hour = 9): string =>
  new Date(TODAY_START.getTime() - days * DAY_MS + hour * 60 * 60 * 1000).toISOString();

const MENTOR_SEED: Array<[name: string, nameAr: string, country: string, expertise: string, languages: string[]]> = [
  ["Ahmed Hassan", "أحمد حسن", "United Arab Emirates", "Product Management", ["English", "Arabic"]],
  ["Layla Mahmoud", "ليلى محمود", "United Arab Emirates", "Engineering Leadership", ["English", "Arabic"]],
  ["Karim Nasser", "كريم ناصر", "Egypt", "Machine Learning", ["English", "Arabic"]],
  ["Fatima Al-Rashid", "فاطمة الراشد", "Saudi Arabia", "Digital Marketing", ["English", "Arabic"]],
  ["Omar Khalil", "عمر خليل", "United Kingdom", "UX Design", ["English"]],
  ["Nour Ibrahim", "نور إبراهيم", "United Kingdom", "Operations Management", ["English", "Arabic"]],
  ["Youssef Fahmy", "يوسف فهمي", "Egypt", "Business Analysis", ["English", "Arabic", "French"]],
  ["Sarah Mitchell", "سارة ميتشل", "United Kingdom", "Cloud Computing", ["English"]],
  ["Priya Raman", "بريا رامان", "India", "Data Science", ["English"]],
  ["Daniel Weber", "دانيال فيبر", "Germany", "Supply Chain", ["English", "German"]],
  ["Hana Saleh", "هنا صالح", "Jordan", "Product Management", ["English", "Arabic"]],
  ["Marcus Lee", "ماركوس لي", "United States", "Engineering Leadership", ["English"]],
];

export const MOCK_MENTORS: Mentor[] = MENTOR_SEED.map(([name, nameAr, country, expertise, languages], index) => ({
  id: `demo-mentor-${index + 1}`,
  name,
  name_ar: nameAr,
  email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
  company: "Amazon",
  position: expertise,
  timezone: "Asia/Dubai",
  country,
  bio: "Demo mentor profile.",
  cal_link: "https://cal.com/demo",
  expertise: [expertise],
  industries: ["Technology"],
  languages_spoken: languages,
  comms_owner: "exec",
  is_available: true,
  created_at: daysAgo(200),
  updated_at: daysAgo(200),
}));

const MENTEE_FIRST = ["Sara", "Khaled", "Amira", "Yousef", "Mariam", "Omar", "Layla", "Fatima", "Rania", "Tariq", "Huda", "Zain", "Dana", "Samir", "Lina", "Adam", "Noor", "Bilal", "Maya", "Faris"];
const MENTEE_LAST = ["Mohamed", "Ali", "Hassan", "Ibrahim", "Farah", "Khalil", "Nasser", "Zayed", "Haddad", "Saleh"];
const ORGANIZATIONS = ["Hope Foundation", "Bright Futures NGO", "Green Gulf Initiative", "Youth Forward", "Emirates Literacy Trust", "Desert Bloom Collective", "Open Doors Charity", "Nile Community Network"];
const MENTEE_COUNTRIES = ["United Arab Emirates", "United Arab Emirates", "United Arab Emirates", "Saudi Arabia", "Egypt", "Jordan", "United Kingdom", "India", "Lebanon", "Kuwait"];

export const MOCK_MENTEES: Mentee[] = Array.from({ length: 40 }, (_, index) => {
  const isOrganization = index % 3 === 0;
  const name = `${MENTEE_FIRST[index % MENTEE_FIRST.length]} ${MENTEE_LAST[index % MENTEE_LAST.length]}`;
  return {
    id: `demo-mentee-${index + 1}`,
    name,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}${index + 1}@example.org`,
    user_type: isOrganization ? "organization" : "individual",
    organization_name: isOrganization ? ORGANIZATIONS[index % ORGANIZATIONS.length] : undefined,
    verification_status: isOrganization ? (index % 6 === 0 ? "pending" : "verified") : "unverified",
    country: pick(MENTEE_COUNTRIES),
    timezone: "Asia/Dubai",
    languages_spoken: chance(0.6) ? ["English", "Arabic"] : ["English"],
    areas_exploring: ["Career Development"],
    created_at: daysAgo(150),
  };
});

const DURATIONS = [30, 30, 45, 45, 60, 60, 60, 90, 15];

function buildBookings(count: number): Booking[] {
  const bookings: Booking[] = [];
  for (let index = 0; index < count; index += 1) {
    const mentor = pick(MOCK_MENTORS);
    const mentee = pick(MOCK_MENTEES);
    const clickedDaysAgo = Math.floor(random() * 119) + 2;
    const roll = random();
    const status: Booking["status"] =
      roll < 0.55 ? "completed"
      : roll < 0.70 ? "confirmed"
      : roll < 0.80 ? "pending"
      : roll < 0.85 ? "accepted"
      : roll < 0.93 ? "canceled"
      : "rejected";

    const booking: Booking = {
      id: `demo-booking-${index + 1}`,
      mentor_id: mentor.id,
      mentee_id: mentee.id,
      status,
      goal: "Career guidance",
      clicked_at: daysAgo(clickedDaysAgo, 9),
      created_at: daysAgo(clickedDaysAgo, 9),
    };

    if (status === "completed") {
      const scheduledDaysAgo = Math.max(1, clickedDaysAgo - Math.floor(random() * 7) - 1);
      booking.scheduled_at = daysAgo(scheduledDaysAgo, 14);
      booking.completed_at = daysAgo(scheduledDaysAgo, 15);
      booking.responded_at = booking.clicked_at;
      // Roughly one in ten completed sessions has no recorded duration: the
      // tile reports these explicitly instead of silently counting them as 0.
      if (!chance(0.1)) booking.session_duration_minutes = pick(DURATIONS);
      if (chance(0.65)) {
        booking.mentee_rating = pick([4, 5, 5, 5, 3]);
        booking.mentor_rating = pick([4, 5, 5, 4]);
      }
    } else if (status === "confirmed" || status === "accepted") {
      booking.scheduled_at = new Date(NOW.getTime() + (Math.floor(random() * 14) + 1) * DAY_MS).toISOString();
      booking.responded_at = booking.clicked_at;
    } else if (status === "canceled") {
      booking.scheduled_at = daysAgo(Math.max(1, clickedDaysAgo - 3), 14);
      booking.canceled_at = daysAgo(Math.max(1, clickedDaysAgo - 2), 10);
    } else if (status === "rejected") {
      booking.responded_at = daysAgo(Math.max(1, clickedDaysAgo - 1), 10);
    }

    // A minority of sessions are attributed to the mentee's country instead of
    // the mentor's (e.g. an in-person visit), exercising the booking.country path.
    if (chance(0.2) && mentee.country) booking.country = mentee.country;

    bookings.push(booking);
  }
  return bookings.sort((a, b) => new Date(b.clicked_at!).getTime() - new Date(a.clicked_at!).getTime());
}

export const MOCK_BOOKINGS: Booking[] = buildBookings(160);
