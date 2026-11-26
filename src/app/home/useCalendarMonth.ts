import { useEffect, useState } from "react";

const dayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
};

/** Local calendar boundaries match the existing home filters, including DST. */
export function useCalendarDay() {
  const [day, setDay] = useState(dayKey);
  useEffect(() => {
    const check = () => setDay(dayKey());
    const timer = window.setInterval(check, 30_000);
    window.addEventListener("focus", check);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", check); };
  }, []);
  return day;
}

export function useCalendarMonth() {
  const day = useCalendarDay();
  return day.slice(0, day.lastIndexOf("-"));
}
