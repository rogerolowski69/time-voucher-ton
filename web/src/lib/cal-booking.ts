export interface CalBookingOptions {
  note: string;
  guestName?: string;
}

export function buildCalBookingUrl(baseUrl: string, options: CalBookingOptions): string {
  const url = new URL(baseUrl);
  url.searchParams.set('notes', options.note);
  if (options.guestName) {
    url.searchParams.set('name', options.guestName);
  }
  return url.toString();
}
