import type { Recipe } from "@/lib/api";

// Collapse "Dine & Dish", "Dine and Dish", "dine  dish" to one canonical form so
// an author and site_name that are really the same name get deduped, not printed
// twice.
function canonical(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// The recipe's attribution line: "Author — Site", deduped when the two are really
// the same name, and dropping whichever is missing.
export function byline({
  author,
  site_name,
}: Pick<Recipe, "author" | "site_name">): string {
  if (author && site_name && canonical(author) === canonical(site_name))
    return author;
  return [author, site_name].filter(Boolean).join(" — ");
}
