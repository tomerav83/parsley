// Pull a cooking duration out of a step ("Roast 18–20 minutes…") so the Method
// panel can surface it as a timer chip. Conservative on purpose: only a number
// (or a range) directly followed by a time unit counts, so stray digits like
// "220°C" or "3 tbsp" never masquerade as timers.
const TIMER_RE =
  /\b\d+(?:[–-]\d+)?\s?(?:seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/i;

export function stepTimer(step: string): string | null {
  const m = step.match(TIMER_RE);
  return m ? m[0].replace(/\s+/g, " ") : null;
}
