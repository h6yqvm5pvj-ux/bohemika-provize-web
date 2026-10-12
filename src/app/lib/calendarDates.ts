/** A date's calendar belongs to that date/model, never to a shared request flag. */
export type CalendarDateFactory = {
  from(value: string | number | Date): Date;
  local(year: number, month: number, day: number, hours: number, minutes: number, seconds: number, milliseconds: number): Date;
};

const dateCalendars = new WeakMap<Date, CalendarDateFactory>();

export function withDateCalendar(value: Date, factory: CalendarDateFactory): Date {
  const date = factory.from(value);
  dateCalendars.set(date, factory);
  return date;
}

export function calendarDate(reference: Date | undefined, value: string | number | Date): Date;
export function calendarDate(reference: Date | undefined, year: number, month: number, day?: number,
  hours?: number, minutes?: number, seconds?: number, milliseconds?: number): Date;
export function calendarDate(reference: Date | undefined, value: string | number | Date, month?: number,
  day = 1, hours = 0, minutes = 0, seconds = 0, milliseconds = 0): Date {
  const factory = reference ? dateCalendars.get(reference) : undefined;
  const date = month === undefined
    ? factory ? factory.from(value) : new Date(value)
    : factory ? factory.local(value as number, month, day, hours, minutes, seconds, milliseconds)
      : new Date(value as number, month, day, hours, minutes, seconds, milliseconds);
  if (factory) dateCalendars.set(date, factory);
  return date;
}

export function hasDateCalendar(date: Date | undefined): boolean {
  return !!date && dateCalendars.has(date);
}
