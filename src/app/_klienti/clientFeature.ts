export const CLIENT_CARDS_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_ENABLE_CLIENTS_PAGE === "1";
