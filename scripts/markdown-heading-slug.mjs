export function normalizeHeadingSlug(text) {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/[`*_~]/g, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}
