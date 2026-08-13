/**
 * Pure, framework-free slot-generation helpers.
 *
 * Shared by the Convex backend (materializing the free-spot ledger) and the
 * owner UI (previewing what a rule set will produce). Keep this module free of
 * imports so it can run in any environment.
 */

/** A recurring "service window" rule. `days` are 0 = Sunday … 6 = Saturday. */
export type SlotRuleLike = {
  days: number[];
  /** "HH:mm" — first seating start time. */
  start: string;
  /** "HH:mm" — last accepted seating (inclusive). */
  end: string;
  /** Minutes between seatings. 0 = a fixed single seating at `start`. */
  step: number;
  /** Section ids this window applies to; empty/absent = every section. */
  sections?: string[] | null | undefined;
};

/** "HH:mm" -> minutes since midnight (0–1439). */
export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return ((h % 24) * 60 + (m % 60) + 1440) % 1440;
}

/** Minutes since midnight -> "HH:mm" (24:00 wraps to 00:00). */
export function formatMinutes(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Sort "HH:mm" times by minutes since midnight (handles past-midnight windows). */
export function sortTimes(times: string[]): string[] {
  return [...times].sort((a, b) => minutesOf(a) - minutesOf(b));
}

/**
 * Every start time in [start, end], stepping by `step` minutes, end inclusive.
 * `step <= 0` -> exactly one fixed seating at `start` (use for chef's tables,
 * tasting menus, jazz nights…).
 */
export function timesForWindow(start: string, end: string, step: number): string[] {
  const startM = minutesOf(start);
  const endM = minutesOf(end);
  if (step <= 0) return [formatMinutes(startM)];
  const out: string[] = [];
  const inc = Math.min(step, 1440);
  let cur = startM;
  // safety cap (96 = 15-min slots over a full day) in case of degenerate input
  while (cur <= endM && out.length < 96) {
    out.push(formatMinutes(cur));
    cur += inc;
  }
  return out;
}

/** Legacy default: the 30-minute grid between open and close, end exclusive. */
export function defaultGridTimes(open: string, close: string, step = 30): string[] {
  const startM = minutesOf(open);
  const endM = minutesOf(close);
  const out: string[] = [];
  let cur = startM;
  while (cur < endM && out.length < 96) {
    out.push(formatMinutes(cur));
    cur += step;
  }
  return out;
}

/**
 * Merge rules into per-section times for one weekday.
 * - A rule with no section restriction applies to every section.
 * - Overlapping rules merge: a time is created once even if two windows cover it.
 * - Sections not covered by any rule get no times for that day.
 */
export function timesForDay(
  rules: SlotRuleLike[],
  dow: number,
  sectionIds: string[],
): Map<string, string[]> {
  const perSection = new Map<string, Set<string>>();
  const ensure = (id: string) => {
    let set = perSection.get(id);
    if (!set) {
      set = new Set<string>();
      perSection.set(id, set);
    }
    return set;
  };
  for (const rule of rules) {
    if (!rule.days.includes(dow)) continue;
    const times = timesForWindow(rule.start, rule.end, rule.step);
    const scoped = rule.sections && rule.sections.length > 0 ? rule.sections : sectionIds;
    for (const sid of scoped) {
      const set = ensure(sid);
      for (const t of times) set.add(t);
    }
  }
  const out = new Map<string, string[]>();
  for (const [sid, set] of perSection) out.set(sid, sortTimes([...set]));
  return out;
}

/** Largest silent gap between consecutive times (minutes), or null under threshold. */
export function detectGap(
  times: string[],
  thresholdMin = 120,
): { from: string; to: string; gapMin: number } | null {
  const sorted = sortTimes(times);
  if (sorted.length < 2) return null;
  let worst: { from: string; to: string; gapMin: number } | null = null;
  for (let i = 1; i < sorted.length; i++) {
    const gap = minutesOf(sorted[i]) - minutesOf(sorted[i - 1]);
    if (gap > thresholdMin && (!worst || gap > worst.gapMin)) {
      worst = { from: sorted[i - 1], to: sorted[i], gapMin: gap };
    }
  }
  return worst;
}

/** "Every hour", "Every 30 min", "Fixed seating" … */
export function stepLabel(step: number): string {
  if (step <= 0) return "Fixed seating";
  if (step === 60) return "Every hour";
  if (step % 60 === 0) return `Every ${step / 60} hours`;
  return `Every ${step} min`;
}

/** "2h 30m" style label for a gap in minutes. */
export function gapLabel(gapMin: number): string {
  const h = Math.floor(gapMin / 60);
  const m = gapMin % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}
