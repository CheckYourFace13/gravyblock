/**
 * Strategic outreach calendar for GravyBlock cold acquisition.
 *
 * Logic:
 * - Unique city+industry slots — no combo repeats within the list, so a
 *   specific city+vertical only gets emailed again once the full cycle wraps.
 * - The 4 daily weekday windows (worker/index.ts) each read an even fraction
 *   of the list apart, so on any given day all 4 windows hit different
 *   targets, and across a full cycle every window eventually covers every
 *   slot.
 * - Indexed by a monotonic day counter (days since epoch), NOT day-of-month —
 *   day-of-month resets every ~30 days and caps at 31, which silently limited
 *   every window to the same ~31-slot band forever no matter how long this
 *   array was. See getOutreachTargetForOffset().
 *
 * Deliberately concentrated (2026-09-04) to 6 verticals — HVAC, plumber,
 * roofing, dentist, attorney, med-spa — the highest-value local-service
 * categories where one paying customer clearly justifies GravyBlock's cost,
 * per the owner's economic reasoning. This is NOT yet backed by response-
 * rate data: the Aug25-Sep4 restart window produced too few clean sends
 * (24 total, most blocked by an unrelated bounce-rate/circuit-breaker bug —
 * see the Sep 4 funnel report) to rank verticals against each other with any
 * confidence. Re-rank from real report-unlock/reply data once volume
 * resumes at the ramp's target rate. Previously covered 11 verticals across
 * 36 metros; restaurant/salon/chiropractor/electrician/auto-repair/real-
 * estate-agent are dropped from this primary weekday rotation (restaurant
 * stays in WEEKEND_RESTAURANT_TARGETS below, a separate, deliberately
 * weekend-hours track).
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
  { city: "Atlanta",        state: "GA", industry: "attorney",          industryLabel: "law firm",           daySlot: 9 },
  { city: "Atlanta",        state: "GA", industry: "plumber",           industryLabel: "plumber",            daySlot: 10 },
  { city: "Charlotte",      state: "NC", industry: "roofing",           industryLabel: "roofing contractor", daySlot: 11 },
  { city: "Charlotte",      state: "NC", industry: "hvac",              industryLabel: "HVAC contractor",    daySlot: 12 },
  { city: "Miami",          state: "FL", industry: "dentist",           industryLabel: "dentist",            daySlot: 13 },
  { city: "Las Vegas",      state: "NV", industry: "med-spa",           industryLabel: "med spa",            daySlot: 14 },
  { city: "Las Vegas",      state: "NV", industry: "dentist",           industryLabel: "dentist",            daySlot: 15 },
  { city: "Denver",         state: "CO", industry: "attorney",          industryLabel: "law firm",           daySlot: 16 },
  { city: "Denver",         state: "CO", industry: "hvac",              industryLabel: "HVAC contractor",    daySlot: 17 },
  { city: "Austin",         state: "TX", industry: "plumber",           industryLabel: "plumber",            daySlot: 18 },
  { city: "Columbus",       state: "OH", industry: "hvac",              industryLabel: "HVAC contractor",    daySlot: 19 },
  { city: "Columbus",       state: "OH", industry: "dentist",           industryLabel: "dentist",            daySlot: 20 },
  { city: "Columbus",       state: "OH", industry: "attorney",          industryLabel: "law firm",           daySlot: 21 },
  { city: "Indianapolis",   state: "IN", industry: "dentist",           industryLabel: "dentist",            daySlot: 22 },
  { city: "Indianapolis",   state: "IN", industry: "roofing",           industryLabel: "roofing contractor", daySlot: 23 },
  { city: "Jacksonville",   state: "FL", industry: "plumber",           industryLabel: "plumber",            daySlot: 24 },
  { city: "Jacksonville",   state: "FL", industry: "med-spa",           industryLabel: "med spa",            daySlot: 25 },
  { city: "Chicago",        state: "IL", industry: "attorney",          industryLabel: "law firm",           daySlot: 26 },
  { city: "Chicago",        state: "IL", industry: "hvac",              industryLabel: "HVAC contractor",    daySlot: 27 },
  { city: "Orlando",        state: "FL", industry: "med-spa",           industryLabel: "med spa",            daySlot: 28 },
  { city: "Orlando",        state: "FL", industry: "roofing",           industryLabel: "roofing contractor", daySlot: 29 },
  { city: "Fort Worth",     state: "TX", industry: "roofing",           industryLabel: "roofing contractor", daySlot: 30 },
  { city: "Fort Worth",     state: "TX", industry: "dentist",           industryLabel: "dentist",            daySlot: 31 },
  { city: "Seattle",        state: "WA", industry: "hvac",              industryLabel: "HVAC contractor",    daySlot: 32 },
  { city: "Seattle",        state: "WA", industry: "attorney",          industryLabel: "law firm",           daySlot: 33 },
  { city: "San Diego",      state: "CA", industry: "dentist",           industryLabel: "dentist",            daySlot: 34 },
  { city: "Kansas City",    state: "MO", industry: "attorney",          industryLabel: "law firm",           daySlot: 35 },
  { city: "Kansas City",    state: "MO", industry: "hvac",              industryLabel: "HVAC contractor",    daySlot: 36 },
  { city: "Dallas",         state: "TX", industry: "med-spa",           industryLabel: "med spa",            daySlot: 37 },
  { city: "Dallas",         state: "TX", industry: "plumber",           industryLabel: "plumber",            daySlot: 38 },
  { city: "Dallas",         state: "TX", industry: "hvac",              industryLabel: "HVAC contractor",    daySlot: 39 },
  { city: "Raleigh",        state: "NC", industry: "plumber",           industryLabel: "plumber",            daySlot: 40 },
  { city: "Raleigh",        state: "NC", industry: "dentist",           industryLabel: "dentist",            daySlot: 41 },
  { city: "Minneapolis",    state: "MN", industry: "hvac",              industryLabel: "HVAC contractor",    daySlot: 42 },
  { city: "Pittsburgh",     state: "PA", industry: "plumber",           industryLabel: "plumber",            daySlot: 43 },
  { city: "Pittsburgh",     state: "PA", industry: "med-spa",           industryLabel: "med spa",            daySlot: 44 },
  { city: "Los Angeles",    state: "CA", industry: "roofing",           industryLabel: "roofing contractor", daySlot: 45 },
  { city: "Los Angeles",    state: "CA", industry: "med-spa",           industryLabel: "med spa",            daySlot: 46 },
  { city: "Philadelphia",   state: "PA", industry: "attorney",          industryLabel: "law firm",           daySlot: 47 },
  { city: "Philadelphia",   state: "PA", industry: "dentist",           industryLabel: "dentist",            daySlot: 48 },
  { city: "San Jose",       state: "CA", industry: "attorney",          industryLabel: "law firm",           daySlot: 49 },
  { city: "Sacramento",     state: "CA", industry: "hvac",              industryLabel: "HVAC contractor",    daySlot: 50 },
  { city: "Oklahoma City",  state: "OK", industry: "roofing",           industryLabel: "roofing contractor", daySlot: 51 },
  { city: "Oklahoma City",  state: "OK", industry: "plumber",           industryLabel: "plumber",            daySlot: 52 },
  { city: "Louisville",     state: "KY", industry: "dentist",           industryLabel: "dentist",            daySlot: 53 },
  { city: "Louisville",     state: "KY", industry: "attorney",          industryLabel: "law firm",           daySlot: 54 },
  { city: "Baltimore",      state: "MD", industry: "roofing",           industryLabel: "roofing contractor", daySlot: 55 },
  { city: "Milwaukee",      state: "WI", industry: "hvac",              industryLabel: "HVAC contractor",    daySlot: 56 },
  { city: "Tucson",         state: "AZ", industry: "med-spa",           industryLabel: "med spa",            daySlot: 57 },
  { city: "Tucson",         state: "AZ", industry: "plumber",           industryLabel: "plumber",            daySlot: 58 },
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
