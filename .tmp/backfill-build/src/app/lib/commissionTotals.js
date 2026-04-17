"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.totalWithMultipliers = totalWithMultipliers;
function normalizeTitle(title) {
    if (!title)
        return "";
    return title
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim();
}
function isTotalRow(title) {
    return normalizeTitle(title).includes("celkem");
}
function itemMultiplier(title) {
    const norm = normalizeTitle(title);
    if (norm.includes("2.–5."))
        return 4; // roky 2–5
    if (norm.includes("5.–10."))
        return 6; // roky 5–10
    return 1;
}
function totalWithMultipliers(items) {
    const cleaned = (items ?? []).filter((it) => !isTotalRow(it.title));
    const hasYearly = cleaned.some((it) => normalizeTitle(it.title).includes("provize za rok"));
    const source = hasYearly
        ? cleaned.filter((it) => normalizeTitle(it.title).includes("provize za rok"))
        : cleaned;
    return source.reduce((sum, it) => {
        const amt = it.amount ?? 0;
        return sum + amt * itemMultiplier(it.title);
    }, 0);
}
