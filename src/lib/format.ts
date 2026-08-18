/** Format cents as a price string. */
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** "2026-08-09" -> "Sat, Aug 9" */
export function formatDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** "17:30" -> "5:30 PM" */
export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

/** YYYY-MM-DD for a date n days from now (local). */
export function dateFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today's YYYY-MM-DD */
export function today(): string {
  return dateFromNow(0);
}

export function isPastDate(date: string): boolean {
  return date < today();
}

/** Humanized relative label for a booking date. */
export function dateLabel(date: string): string {
  const diff = Math.round(
    (new Date(`${date}T00:00:00`).getTime() - new Date(today() + "T00:00:00").getTime()) /
      (1000 * 60 * 60 * 24),
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return formatDate(date);
}

// ---------------------------------------------------------------------------
// WhatsApp sharing
// ---------------------------------------------------------------------------

/** Share any text to a WhatsApp chat. */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Prebuilt share message for a booking — restaurant, when, party, code. */
export function bookingShareText(opts: {
  restaurantName: string;
  date: string;
  time: string;
  partySize: number;
  code: string;
  section?: string;
  city?: string;
}): string {
  const lines = [
    `🍽️ Table booked at ${opts.restaurantName}!`,
    `📅 ${formatDate(opts.date)} · ${formatTime(opts.time)}`,
    `👥 ${opts.partySize} ${opts.partySize === 1 ? "guest" : "guests"}`,
  ];
  if (opts.section) lines.push(`🪑 ${opts.section}`);
  lines.push(`✅ Confirmation code: ${opts.code}`);
  if (opts.city) lines.push(`📍 ${opts.city}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Special occasions
// ---------------------------------------------------------------------------

/** Presets offered when booking so the restaurant can prepare something. */
export const OCCASIONS: { value: string; emoji: string }[] = [
  { value: "Birthday", emoji: "🎂" },
  { value: "Anniversary", emoji: "💞" },
  { value: "Proposal", emoji: "💍" },
  { value: "Date night", emoji: "🌹" },
  { value: "Business", emoji: "💼" },
  { value: "Other", emoji: "✨" },
];

/** Emoji for a stored occasion value, or a generic party emoji. */
export function occasionEmoji(value?: string): string {
  if (!value) return "";
  const found = OCCASIONS.find((o) => o.value.toLowerCase() === value.toLowerCase());
  return found?.emoji ?? "🎉";
}
