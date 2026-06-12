/**
 * Strategic outreach calendar for GravyBlock cold acquisition.
 *
 * Logic:
 * - 30 slots (one per day-of-month, cycling).
 * - Prioritises high-LTV industries: HVAC, plumber, dentist, lawyer, roofing,
 *   med-spa, chiropractor — each appears 2-3× per month.
 * - Rotates across 10 high-density metros.
 * - Worker fires Mon–Fri at 9am UTC, so weekends naturally skip.
 */

export type OutreachTarget = {
  city: string;
  state: string;
  industry: string;
  industryLabel: string;
  daySlot: number; // 1-30
};

/** 30-day calendar — index 0 = day 1 of month.
 *  25 metros — each city appears at most 2× per month so the prospect pool
 *  stays fresh (Places returns ~60 raw results per query; revisiting the
 *  same city+industry too often exhausts the dedup pool). */
export const OUTREACH_CALENDAR: OutreachTarget[] = [
  { city: "Houston",      state: "TX", industry: "hvac",             industryLabel: "HVAC contractor",     daySlot: 1  },
  { city: "San Antonio",  state: "TX", industry: "plumber",          industryLabel: "plumber",             daySlot: 2  },
  { city: "Phoenix",      state: "AZ", industry: "dentist",          industryLabel: "dentist",             daySlot: 3  },
  { city: "Atlanta",      state: "GA", industry: "attorney",         industryLabel: "law firm",            daySlot: 4  },
  { city: "Charlotte",    state: "NC", industry: "roofing",          industryLabel: "roofing contractor",  daySlot: 5  },
  { city: "Miami",        state: "FL", industry: "chiropractor",     industryLabel: "chiropractor",        daySlot: 6  },
  { city: "Las Vegas",    state: "NV", industry: "med-spa",          industryLabel: "med spa",             daySlot: 7  },
  { city: "Denver",       state: "CO", industry: "auto-repair",      industryLabel: "auto repair shop",    daySlot: 8  },
  { city: "Tampa",        state: "FL", industry: "electrician",      industryLabel: "electrician",         daySlot: 9  },
  { city: "Nashville",    state: "TN", industry: "salon",            industryLabel: "salon",               daySlot: 10 },
  { city: "Austin",       state: "TX", industry: "plumber",          industryLabel: "plumber",             daySlot: 11 },
  { city: "Columbus",     state: "OH", industry: "hvac",             industryLabel: "HVAC contractor",     daySlot: 12 },
  { city: "Indianapolis", state: "IN", industry: "dentist",          industryLabel: "dentist",             daySlot: 13 },
  { city: "Jacksonville", state: "FL", industry: "chiropractor",     industryLabel: "chiropractor",        daySlot: 14 },
  { city: "Chicago",      state: "IL", industry: "restaurant",       industryLabel: "restaurant",          daySlot: 15 },
  { city: "Orlando",      state: "FL", industry: "real-estate-agent",industryLabel: "real estate agent",   daySlot: 16 },
  { city: "Fort Worth",   state: "TX", industry: "roofing",          industryLabel: "roofing contractor",  daySlot: 17 },
  { city: "Seattle",      state: "WA", industry: "hvac",             industryLabel: "HVAC contractor",     daySlot: 18 },
  { city: "San Diego",    state: "CA", industry: "dentist",          industryLabel: "dentist",             daySlot: 19 },
  { city: "Kansas City",  state: "MO", industry: "attorney",         industryLabel: "law firm",            daySlot: 20 },
  { city: "Houston",      state: "TX", industry: "roofing",          industryLabel: "roofing contractor",  daySlot: 21 },
  { city: "Dallas",       state: "TX", industry: "med-spa",          industryLabel: "med spa",             daySlot: 22 },
  { city: "Raleigh",      state: "NC", industry: "plumber",          industryLabel: "plumber",             daySlot: 23 },
  { city: "Minneapolis",  state: "MN", industry: "hvac",             industryLabel: "HVAC contractor",     daySlot: 24 },
  { city: "Pittsburgh",   state: "PA", industry: "plumber",          industryLabel: "plumber",             daySlot: 25 },
  { city: "Miami",        state: "FL", industry: "dentist",          industryLabel: "dentist",             daySlot: 26 },
  { city: "Los Angeles",  state: "CA", industry: "roofing",          industryLabel: "roofing contractor",  daySlot: 27 },
  { city: "Denver",       state: "CO", industry: "attorney",         industryLabel: "law firm",            daySlot: 28 },
  { city: "Tampa",        state: "FL", industry: "restaurant",       industryLabel: "restaurant",          daySlot: 29 },
  { city: "Nashville",    state: "TN", industry: "electrician",      industryLabel: "electrician",         daySlot: 30 },
];

/** Returns today's outreach target based on the day-of-month (cycles every 30 days). */
export function getTodaysOutreachTarget(): OutreachTarget {
  const dayOfMonth = new Date().getUTCDate(); // 1-31
  const slot = ((dayOfMonth - 1) % 30); // 0-29
  return OUTREACH_CALENDAR[slot]!;
}

/** Returns the full calendar for display in the admin dashboard. */
export function getCalendarPreview(): OutreachTarget[] {
  return OUTREACH_CALENDAR;
}
