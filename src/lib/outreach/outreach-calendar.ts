/**
 * Strategic outreach calendar for GravyBlock cold acquisition.
 *
 * Logic:
 * - 100 unique city+industry slots — no combo repeats within the list, so a
 *   specific city+vertical only gets emailed again once the full cycle wraps.
 * - The 4 daily weekday windows (worker/index.ts) each read 25 slots apart,
 *   so on any given day all 4 windows hit different targets, and across a
 *   full cycle every window eventually covers every slot.
 * - Indexed by a monotonic day counter (days since epoch), NOT day-of-month —
 *   day-of-month resets every ~30 days and caps at 31, which silently limited
 *   every window to the same ~31-slot band forever no matter how long this
 *   array was. See getOutreachTargetForOffset().
 * - Rotates across 36 metros, weighted toward high-LTV industries (HVAC,
 *   plumber, dentist, lawyer, roofing, med-spa, chiropractor) without
 *   repeating the same city+industry pair — that repetition (up to 4x/month
 *   under the old 30-slot/day-of-month scheme) was exhausting the small pool
 *   of non-chain, has-a-website, not-yet-contacted businesses in thinner
 *   verticals like dentist/attorney/chiropractor, causing near-100% skip
 *   rates on repeat passes (confirmed via /admin/outreach batch history).
 */

export type OutreachTarget = {
  city: string;
  state: string;
  industry: string;
  industryLabel: string;
  daySlot: number; // 1-based position, for display only
};

export const OUTREACH_CALENDAR: OutreachTarget[] = [
  { city: "Houston",        state: "TX", industry: "hvac",              industryLabel: "HVAC contractor",    daySlot: 1 },
  { city: "Houston",        state: "TX", industry: "plumber",           industryLabel: "plumber",            daySlot: 2 },
  { city: "Houston",        state: "TX", industry: "roofing",           industryLabel: "roofing contractor", daySlot: 3 },
  { city: "San Antonio",    state: "TX", industry: "plumber",           industryLabel: "plumber",            daySlot: 4 },
  { city: "San Antonio",    state: "TX", industry: "dentist",           industryLabel: "dentist",            daySlot: 5 },
  { city: "San Antonio",    state: "TX", industry: "roofing",           industryLabel: "roofing contractor", daySlot: 6 },
  { city: "Phoenix",        state: "AZ", industry: "dentist",           industryLabel: "dentist",            daySlot: 7 },
  { city: "Phoenix",        state: "AZ", industry: "hvac",              industryLabel: "HVAC contractor",    daySlot: 8 },
  { city: "Phoenix",        state: "AZ", industry: "electrician",       industryLabel: "electrician",        daySlot: 9 },
  { city: "Atlanta",        state: "GA", industry: "attorney",          industryLabel: "law firm",           daySlot: 10 },
  { city: "Atlanta",        state: "GA", industry: "plumber",           industryLabel: "plumber",            daySlot: 11 },
  { city: "Atlanta",        state: "GA", industry: "salon",             industryLabel: "salon",              daySlot: 12 },
  { city: "Charlotte",      state: "NC", industry: "roofing",           industryLabel: "roofing contractor", daySlot: 13 },
  { city: "Charlotte",      state: "NC", industry: "salon",             industryLabel: "salon",              daySlot: 14 },
  { city: "Charlotte",      state: "NC", industry: "hvac",              industryLabel: "HVAC contractor",    daySlot: 15 },
  { city: "Miami",          state: "FL", industry: "chiropractor",      industryLabel: "chiropractor",       daySlot: 16 },
  { city: "Miami",          state: "FL", industry: "dentist",           industryLabel: "dentist",            daySlot: 17 },
  { city: "Miami",          state: "FL", industry: "restaurant",        industryLabel: "restaurant",         daySlot: 18 },
  { city: "Las Vegas",      state: "NV", industry: "med-spa",           industryLabel: "med spa",            daySlot: 19 },
  { city: "Las Vegas",      state: "NV", industry: "auto-repair",       industryLabel: "auto repair shop",   daySlot: 20 },
  { city: "Las Vegas",      state: "NV", industry: "dentist",           industryLabel: "dentist",            daySlot: 21 },
  { city: "Denver",         state: "CO", industry: "auto-repair",       industryLabel: "auto repair shop",   daySlot: 22 },
  { city: "Denver",         state: "CO", industry: "attorney",          industryLabel: "law firm",           daySlot: 23 },
  { city: "Denver",         state: "CO", industry: "hvac",              industryLabel: "HVAC contractor",    daySlot: 24 },
  { city: "Tampa",          state: "FL", industry: "electrician",       industryLabel: "electrician",        daySlot: 25 },
  { city: "Tampa",          state: "FL", industry: "restaurant",        industryLabel: "restaurant",         daySlot: 26 },
  { city: "Tampa",          state: "FL", industry: "chiropractor",      industryLabel: "chiropractor",       daySlot: 27 },
  { city: "Nashville",      state: "TN", industry: "salon",             industryLabel: "salon",              daySlot: 28 },
  { city: "Nashville",      state: "TN", industry: "electrician",       industryLabel: "electrician",        daySlot: 29 },
  { city: "Nashville",      state: "TN", industry: "real-estate-agent", industryLabel: "real estate agent",  daySlot: 30 },
  { city: "Austin",         state: "TX", industry: "plumber",           industryLabel: "plumber",            daySlot: 31 },
  { city: "Austin",         state: "TX", industry: "real-estate-agent", industryLabel: "real estate agent",  daySlot: 32 },
  { city: "Austin",         state: "TX", industry: "chiropractor",      industryLabel: "chiropractor",       daySlot: 33 },
  { city: "Columbus",       state: "OH", industry: "hvac",              industryLabel: "HVAC contractor",    daySlot: 34 },
  { city: "Columbus",       state: "OH", industry: "dentist",           industryLabel: "dentist",            daySlot: 35 },
  { city: "Columbus",       state: "OH", industry: "attorney",          industryLabel: "law firm",           daySlot: 36 },
  { city: "Indianapolis",   state: "IN", industry: "dentist",           industryLabel: "dentist",            daySlot: 37 },
  { city: "Indianapolis",   state: "IN", industry: "roofing",           industryLabel: "roofing contractor", daySlot: 38 },
  { city: "Indianapolis",   state: "IN", industry: "electrician",       industryLabel: "electrician",        daySlot: 39 },
  { city: "Jacksonville",   state: "FL", industry: "chiropractor",      industryLabel: "chiropractor",       daySlot: 40 },
  { city: "Jacksonville",   state: "FL", industry: "plumber",           industryLabel: "plumber",            daySlot: 41 },
  { city: "Jacksonville",   state: "FL", industry: "med-spa",           industryLabel: "med spa",            daySlot: 42 },
  { city: "Chicago",        state: "IL", industry: "restaurant",        industryLabel: "restaurant",         daySlot: 43 },
  { city: "Chicago",        state: "IL", industry: "attorney",          industryLabel: "law firm",           daySlot: 44 },
  { city: "Chicago",        state: "IL", industry: "hvac",              industryLabel: "HVAC contractor",    daySlot: 45 },
  { city: "Orlando",        state: "FL", industry: "real-estate-agent", industryLabel: "real estate agent",  daySlot: 46 },
  { city: "Orlando",        state: "FL", industry: "med-spa",           industryLabel: "med spa",            daySlot: 47 },
  { city: "Orlando",        state: "FL", industry: "roofing",           industryLabel: "roofing contractor", daySlot: 48 },
  { city: "Fort Worth",     state: "TX", industry: "roofing",           industryLabel: "roofing contractor", daySlot: 49 },
  { city: "Fort Worth",     state: "TX", industry: "auto-repair",       industryLabel: "auto repair shop",   daySlot: 50 },
  { city: "Fort Worth",     state: "TX", industry: "dentist",           industryLabel: "dentist",            daySlot: 51 },
  { city: "Seattle",        state: "WA", industry: "hvac",              industryLabel: "HVAC contractor",    daySlot: 52 },
  { city: "Seattle",        state: "WA", industry: "salon",             industryLabel: "salon",              daySlot: 53 },
  { city: "Seattle",        state: "WA", industry: "attorney",          industryLabel: "law firm",           daySlot: 54 },
  { city: "San Diego",      state: "CA", industry: "dentist",           industryLabel: "dentist",            daySlot: 55 },
  { city: "San Diego",      state: "CA", industry: "real-estate-agent", industryLabel: "real estate agent",  daySlot: 56 },
  { city: "San Diego",      state: "CA", industry: "chiropractor",      industryLabel: "chiropractor",       daySlot: 57 },
  { city: "Kansas City",    state: "MO", industry: "attorney",          industryLabel: "law firm",           daySlot: 58 },
  { city: "Kansas City",    state: "MO", industry: "electrician",       industryLabel: "electrician",        daySlot: 59 },
  { city: "Kansas City",    state: "MO", industry: "hvac",              industryLabel: "HVAC contractor",    daySlot: 60 },
  { city: "Dallas",         state: "TX", industry: "med-spa",           industryLabel: "med spa",            daySlot: 61 },
  { city: "Dallas",         state: "TX", industry: "plumber",           industryLabel: "plumber",            daySlot: 62 },
  { city: "Dallas",         state: "TX", industry: "hvac",              industryLabel: "HVAC contractor",    daySlot: 63 },
  { city: "Raleigh",        state: "NC", industry: "plumber",           industryLabel: "plumber",            daySlot: 64 },
  { city: "Raleigh",        state: "NC", industry: "dentist",           industryLabel: "dentist",            daySlot: 65 },
  { city: "Raleigh",        state: "NC", industry: "auto-repair",       industryLabel: "auto repair shop",   daySlot: 66 },
  { city: "Minneapolis",    state: "MN", industry: "hvac",              industryLabel: "HVAC contractor",    daySlot: 67 },
  { city: "Minneapolis",    state: "MN", industry: "chiropractor",      industryLabel: "chiropractor",       daySlot: 68 },
  { city: "Minneapolis",    state: "MN", industry: "restaurant",        industryLabel: "restaurant",         daySlot: 69 },
  { city: "Pittsburgh",     state: "PA", industry: "plumber",           industryLabel: "plumber",            daySlot: 70 },
  { city: "Pittsburgh",     state: "PA", industry: "auto-repair",       industryLabel: "auto repair shop",   daySlot: 71 },
  { city: "Pittsburgh",     state: "PA", industry: "med-spa",           industryLabel: "med spa",            daySlot: 72 },
  { city: "Los Angeles",    state: "CA", industry: "roofing",           industryLabel: "roofing contractor", daySlot: 73 },
  { city: "Los Angeles",    state: "CA", industry: "real-estate-agent", industryLabel: "real estate agent",  daySlot: 74 },
  { city: "Los Angeles",    state: "CA", industry: "med-spa",           industryLabel: "med spa",            daySlot: 75 },
  { city: "Philadelphia",   state: "PA", industry: "attorney",          industryLabel: "law firm",           daySlot: 76 },
  { city: "Philadelphia",   state: "PA", industry: "dentist",           industryLabel: "dentist",            daySlot: 77 },
  { city: "Philadelphia",   state: "PA", industry: "electrician",       industryLabel: "electrician",        daySlot: 78 },
  { city: "San Jose",       state: "CA", industry: "real-estate-agent", industryLabel: "real estate agent",  daySlot: 79 },
  { city: "San Jose",       state: "CA", industry: "salon",             industryLabel: "salon",              daySlot: 80 },
  { city: "San Jose",       state: "CA", industry: "attorney",          industryLabel: "law firm",           daySlot: 81 },
  { city: "Sacramento",     state: "CA", industry: "hvac",              industryLabel: "HVAC contractor",    daySlot: 82 },
  { city: "Sacramento",     state: "CA", industry: "restaurant",        industryLabel: "restaurant",         daySlot: 83 },
  { city: "Sacramento",     state: "CA", industry: "electrician",       industryLabel: "electrician",        daySlot: 84 },
  { city: "Portland",       state: "OR", industry: "salon",             industryLabel: "salon",              daySlot: 85 },
  { city: "Portland",       state: "OR", industry: "chiropractor",      industryLabel: "chiropractor",       daySlot: 86 },
  { city: "Oklahoma City",  state: "OK", industry: "roofing",           industryLabel: "roofing contractor", daySlot: 87 },
  { city: "Oklahoma City",  state: "OK", industry: "plumber",           industryLabel: "plumber",            daySlot: 88 },
  { city: "Memphis",        state: "TN", industry: "restaurant",        industryLabel: "restaurant",         daySlot: 89 },
  { city: "Memphis",        state: "TN", industry: "electrician",       industryLabel: "electrician",        daySlot: 90 },
  { city: "Louisville",     state: "KY", industry: "dentist",           industryLabel: "dentist",            daySlot: 91 },
  { city: "Louisville",     state: "KY", industry: "attorney",          industryLabel: "law firm",           daySlot: 92 },
  { city: "Baltimore",      state: "MD", industry: "chiropractor",      industryLabel: "chiropractor",       daySlot: 93 },
  { city: "Baltimore",      state: "MD", industry: "roofing",           industryLabel: "roofing contractor", daySlot: 94 },
  { city: "Milwaukee",      state: "WI", industry: "hvac",              industryLabel: "HVAC contractor",    daySlot: 95 },
  { city: "Milwaukee",      state: "WI", industry: "auto-repair",       industryLabel: "auto repair shop",   daySlot: 96 },
  { city: "Tucson",         state: "AZ", industry: "med-spa",           industryLabel: "med spa",            daySlot: 97 },
  { city: "Tucson",         state: "AZ", industry: "plumber",           industryLabel: "plumber",            daySlot: 98 },
  { city: "New Orleans",    state: "LA", industry: "restaurant",        industryLabel: "restaurant",         daySlot: 99 },
  { city: "New Orleans",    state: "LA", industry: "salon",             industryLabel: "salon",              daySlot: 100 },
];

/** Spacing between the 4 daily weekday windows — keep them evenly spread across the full list. */
export const OUTREACH_WINDOW_OFFSETS = {
  morning: 0,
  midday: Math.round(OUTREACH_CALENDAR.length / 4),
  afternoon: Math.round((OUTREACH_CALENDAR.length / 4) * 2),
  evening: Math.round((OUTREACH_CALENDAR.length / 4) * 3),
} as const;

/**
 * Monotonic day counter (days since Unix epoch) — unlike day-of-month, this
 * never resets, so a slot index derived from it actually advances through
 * the FULL calendar length before repeating, no matter how long the array
 * is. Day-of-month caps at 31 and loops monthly, which is what silently
 * limited every window to the same ~31-slot band regardless of array size.
 */
export function daysSinceEpoch(): number {
  return Math.floor(Date.now() / 86_400_000);
}

/** Target for a given window offset — used by the worker for each of the 4 daily windows. */
export function getOutreachTargetForOffset(offset: number): OutreachTarget {
  const slot = (daysSinceEpoch() + offset) % OUTREACH_CALENDAR.length;
  return OUTREACH_CALENDAR[slot]!;
}

/** Returns today's outreach target (the "morning" / zero-offset slot). */
export function getTodaysOutreachTarget(): OutreachTarget {
  return getOutreachTargetForOffset(OUTREACH_WINDOW_OFFSETS.morning);
}

/** Returns the full calendar for display in the admin dashboard. */
export function getCalendarPreview(): OutreachTarget[] {
  return OUTREACH_CALENDAR;
}
