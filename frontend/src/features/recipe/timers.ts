// Deliberately strict: only a number or range directly followed by a time unit, so
// "220°C" and "3 tbsp" can't pass themselves off as durations.
const TIMER_RE =
  /\b\d+(?:[–-]\d+)?\s?(?:seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/i;

/** The cooking time named in a step ("18–20 minutes"), for the Method panel's chip. */
export function stepTimer(step: string): string | null {
  const m = step.match(TIMER_RE);
  return m ? m[0].replace(/\s+/g, " ") : null;
}
