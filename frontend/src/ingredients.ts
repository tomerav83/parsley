// Split a leading measurement off an ingredient line so the recipe card can show
// quantities in a tight mono column (the "mise en place" signature) with the
// ingredient name beside it. Degrades gracefully: lines with no leading amount
// return an empty quantity and the whole string as the name.

const UNITS = new Set([
  "tsp",
  "teaspoon",
  "teaspoons",
  "tbsp",
  "tbs",
  "tablespoon",
  "tablespoons",
  "cup",
  "cups",
  "oz",
  "ounce",
  "ounces",
  "lb",
  "lbs",
  "pound",
  "pounds",
  "g",
  "gram",
  "grams",
  "kg",
  "mg",
  "ml",
  "l",
  "cl",
  "dl",
  "liter",
  "liters",
  "litre",
  "litres",
  "clove",
  "cloves",
  "bunch",
  "bunches",
  "bn",
  "pinch",
  "pinches",
  "dash",
  "dashes",
  "can",
  "cans",
  "jar",
  "jars",
  "slice",
  "slices",
  "stick",
  "sticks",
  "sprig",
  "sprigs",
  "head",
  "heads",
  "piece",
  "pieces",
  "handful",
  "handfuls",
  "quart",
  "quarts",
  "qt",
  "pint",
  "pints",
  "pt",
  "gallon",
  "gallons",
  "gal",
  "fl",
]);

const FRACTIONS = "¼½¾⅓⅔⅛⅜⅝⅞";
const NUM = `(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[${FRACTIONS}]+)`;
// leading amount, optional range (1-2, 1–2), optional trailing word (maybe a unit)
const LEAD = new RegExp(
  `^\\s*(${NUM}(?:\\s*[-–]\\s*${NUM})?)\\s*([a-zA-Z]+\\.?)?`,
);

export interface SplitIngredient {
  qty: string;
  name: string;
}

export function splitQuantity(line: string): SplitIngredient {
  const trimmed = line.trim();
  const m = trimmed.match(LEAD);
  if (!m) return { qty: "", name: trimmed };

  const word = m[2];
  const wordIsUnit = !!word && UNITS.has(word.toLowerCase().replace(/\.$/, ""));

  const consumed = wordIsUnit ? m[0].length : m[0].length - (word?.length ?? 0);
  const qty = trimmed.slice(0, consumed).trim();
  const name = trimmed.slice(consumed).trim().replace(/^,\s*/, "");

  if (!qty || !name) return { qty: "", name: trimmed };
  return { qty, name };
}
