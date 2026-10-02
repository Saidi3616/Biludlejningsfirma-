/** Kalenderfil (.ics) til "Tilføj til kalender" på bekræftelsessiden. Ingen persondata. */
export function calendarEvent(event: {
  uid: string;
  title: string;
  location: string;
  start: Date;
  end: Date;
  now?: Date;
}): string {
  const stamp = (date: Date) =>
    date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const escape = (text: string) => text.replace(/[\;,]/g, (match) => `\\${match}`);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Biludlejning//Booking//DA",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${stamp(event.now ?? new Date())}`,
    `DTSTART:${stamp(event.start)}`,
    `DTEND:${stamp(event.end)}`,
    `SUMMARY:${escape(event.title)}`,
    `LOCATION:${escape(event.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
