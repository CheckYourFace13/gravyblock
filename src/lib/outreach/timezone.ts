/**
 * Recipient-local business-hours gate for cold outreach send timing.
 *
 * The worker's cold-outreach windows fire at fixed UTC hours (13/15/17/19),
 * documented as landing in US business hours "9am ET / 6am PT" etc. — but
 * the outreach calendar rotates through 36 metros across every US timezone
 * (Phoenix, Denver, Seattle, Tucson...), so a fixed-UTC window that's a
 * sensible 9-11am for an Eastern-time target can land as early as 6am for a
 * Pacific-time one on a different day. This checks the ACTUAL target's local
 * time before sending, using Intl's timezone database (handles DST
 * correctly) rather than a hardcoded offset.
 */
const STATE_TIMEZONE: Record<string, string> = {
  // Eastern
  NY: "America/New_York", PA: "America/New_York", GA: "America/New_York", NC: "America/New_York",
  FL: "America/New_York", OH: "America/New_York", IN: "America/Indiana/Indianapolis", MD: "America/New_York",
  // Central
  TX: "America/Chicago", IL: "America/Chicago", TN: "America/Chicago", MO: "America/Chicago",
  MN: "America/Chicago", WI: "America/Chicago", OK: "America/Chicago", LA: "America/Chicago",
  KY: "America/New_York", // Louisville is Eastern despite being in KY
  // Mountain
  CO: "America/Denver", AZ: "America/Phoenix", // Arizona doesn't observe DST
  // Pacific
  WA: "America/Los_Angeles", OR: "America/Los_Angeles", CA: "America/Los_Angeles", NV: "America/Los_Angeles",
};

const DEFAULT_TIMEZONE = "America/Chicago"; // safest fallback if a state isn't mapped — never guess earlier/later

/** Current local hour (0-23) in the given US state's timezone, DST-aware. */
export function localHourForState(state: string): number {
  const tz = STATE_TIMEZONE[state.toUpperCase()] ?? DEFAULT_TIMEZONE;
  const hourStr = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(new Date());
  // "24" at midnight in some locales/environments — normalize to 0.
  const hour = parseInt(hourStr, 10);
  return hour === 24 ? 0 : hour;
}

/** True if it's currently a sensible weekday cold-outreach hour (9am-2pm local) for this state. */
export function isReasonableLocalSendHour(state: string, minHour = 9, maxHour = 14): boolean {
  const hour = localHourForState(state);
  return hour >= minHour && hour <= maxHour;
}
