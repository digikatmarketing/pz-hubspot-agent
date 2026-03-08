/**
 * Date range utilities for reports.
 * Supports MTD, YTD, LTM, Last 30/90 days, and custom ranges.
 */

export type DateRangeKey = "mtd" | "ytd" | "ltm" | "last_30" | "last_90" | "custom";

export interface DateRange {
  from: Date;
  to: Date;
  label: string;
  key: DateRangeKey;
}

export interface MonthBucket {
  label: string;   // e.g. "Jan 2025"
  from: Date;
  to: Date;
}

// ── Get a date range by key ─────────────────────────────────────────

export function getDateRange(
  key: DateRangeKey,
  custom?: { from: string; to: string },
): DateRange {
  const now = new Date();

  switch (key) {
    case "mtd": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to: now, label: "Month to Date", key };
    }
    case "ytd": {
      const from = new Date(now.getFullYear(), 0, 1);
      return { from, to: now, label: "Year to Date", key };
    }
    case "ltm": {
      const from = new Date(now);
      from.setMonth(from.getMonth() - 12);
      return { from, to: now, label: "Last 12 Months", key };
    }
    case "last_30": {
      const from = new Date(now);
      from.setDate(from.getDate() - 30);
      return { from, to: now, label: "Last 30 Days", key };
    }
    case "last_90": {
      const from = new Date(now);
      from.setDate(from.getDate() - 90);
      return { from, to: now, label: "Last 90 Days", key };
    }
    case "custom": {
      if (!custom) throw new Error("Custom date range requires from/to");
      return {
        from: new Date(custom.from),
        to: new Date(custom.to),
        label: `${custom.from} — ${custom.to}`,
        key,
      };
    }
  }
}

// ── Split a range into monthly buckets ──────────────────────────────

export function getMonthlyBuckets(from: Date, to: Date): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);

  while (cursor <= to) {
    const monthStart = new Date(cursor);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);

    buckets.push({
      label: monthStart.toLocaleDateString("en-AU", { month: "short", year: "numeric" }),
      from: monthStart,
      to: monthEnd > to ? to : monthEnd,
    });

    cursor.setMonth(cursor.getMonth() + 1);
  }

  return buckets;
}

// ── Convert date to HubSpot epoch millisecond string ────────────────

export function toHsTimestamp(d: Date): string {
  return d.getTime().toString();
}

// ── Default date range labels for UI dropdown ───────────────────────

export const DATE_RANGE_OPTIONS: Array<{ key: DateRangeKey; label: string }> = [
  { key: "mtd", label: "Month to Date" },
  { key: "ytd", label: "Year to Date" },
  { key: "ltm", label: "Last 12 Months" },
  { key: "last_30", label: "Last 30 Days" },
  { key: "last_90", label: "Last 90 Days" },
];
