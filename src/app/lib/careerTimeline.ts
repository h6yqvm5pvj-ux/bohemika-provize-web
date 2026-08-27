type TimelineRowWithEndDate = {
  validTo: string;
};

export const getNextCareerTimelineStart = (
  rows: readonly TimelineRowWithEndDate[]
): string => {
  const previousRow = rows[rows.length - 1];
  return previousRow?.validTo.trim() ?? "";
};
