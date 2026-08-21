import { DEV_KEYWORDS } from "./constants";

export type Matchable = {
  title?: string;
  url?: string;
};

export function matchesDevelopmentTerms(input: Matchable): boolean {
  const haystack = `${input.title ?? ""} ${input.url ?? ""}`.toLowerCase();
  return DEV_KEYWORDS.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

export function scoreMatch(input: Matchable, query: string): number {
  const title = (input.title ?? "").toLowerCase();
  const url = (input.url ?? "").toLowerCase();
  const q = query.trim().toLowerCase();
  if (!q) return matchesDevelopmentTerms(input) ? 1 : 0;

  let score = 0;
  if (title === q) score += 10;
  if (url === q) score += 8;
  if (title.startsWith(q)) score += 6;
  if (url.startsWith(q)) score += 4;
  if (title.includes(q)) score += 3;
  if (url.includes(q)) score += 2;
  if (matchesDevelopmentTerms(input)) score += 1;
  return score;
}
