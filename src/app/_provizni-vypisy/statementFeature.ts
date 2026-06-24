export const COMMISSION_STATEMENTS_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_ENABLE_COMMISSION_STATEMENTS_PAGE === "1";
