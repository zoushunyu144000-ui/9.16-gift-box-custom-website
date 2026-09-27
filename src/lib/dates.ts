/** Date helpers in Malaysia time (UTC+8), returning YYYY-MM-DD strings. */
export function klToday(offsetDays = 0) {
  const d = new Date(Date.now() + 8 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

export function earliestDeliveryDate(leadDays: number) {
  return klToday(Math.max(0, leadDays));
}

export function formatDate(iso: string | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }) {
  if (!iso) return "";
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00+08:00`) : new Date(iso);
  return d.toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", ...opts });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
