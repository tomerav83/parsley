import type { Recipe } from "@/lib/api";

// "Dine & Dish", "Dine and Dish" and "dine  dish" all collapse to the same thing,
// which is how we notice the author and the site are one name printed twice.
function canonical(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The attribution line, "Author — Site", minus whichever is missing or repeated. */
export function byline({
  author,
  site_name,
}: Pick<Recipe, "author" | "site_name">): string {
  if (author && site_name && canonical(author) === canonical(site_name))
    return author;
  return [author, site_name].filter(Boolean).join(" — ");
}
