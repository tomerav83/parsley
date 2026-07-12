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
  // cup abbreviation seen in the wild ("1 1/2 c. flour")
  "c",
  // count/pack units that show up on real recipe sites (esp. UK/AU)
  "packet",
  "packets",
  "rib",
  "ribs",
  "bulb",
  "bulbs",
  "tin",
  "tins",
  "stalk",
  "stalks",
  "rasher",
  "rashers",
  "batch",
  "batches",
  "knob",
  "knobs",
  "sachet",
  "sachets",
  "fillet",
  "fillets",
  "sheet",
  "sheets",
  "wedge",
  "wedges",
  "cube",
  "cubes",
  "strip",
  "strips",
  "drop",
  "drops",
  "ear",
  "ears",
  "loaf",
  "loaves",
]);

const FRACTIONS = "¼½¾⅓⅔⅛⅜⅝⅞";
// Ordered alternation: mixed numbers ("1 1/2", "1 and 1/2", "1½") must be tried
// before a bare integer, or "1½" would match just the "1" and strand the
// fraction in the name. The optional "and" covers the spelled-out mixed number.
const NUM = `(?:\\d+\\s+(?:and\\s+)?\\d+\\/\\d+|\\d+\\s*[${FRACTIONS}]|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[${FRACTIONS}]+)`;
// Range separator: hyphen/en-dash ("1-2", "1–2") or the word "to" ("1 to 2").
const RANGE = `(?:\\s*[-–]\\s*|\\s+to\\s+)`;
// Leading amount: an optional "N x" multiplier ("2 x 400g"), the amount, an
// optional range, then an optional trailing word (maybe a unit).
const LEAD = new RegExp(
  `^\\s*((?:${NUM}\\s*[x×]\\s*)?${NUM}(?:${RANGE}${NUM})?)\\s*([a-zA-Z]+\\.?)?`,
);

export interface SplitIngredient {
  qty: string;
  name: string;
}

// Precomposed "vulgar fraction" glyphs (½, ¾, …) render as tiny superscript/
// subscript pairs in Space Mono, so a quantity like "½ tsp" looks shrunken next
// to plain digits. Expand them to full-size ASCII ("1/2"), inserting a space
// after a leading whole number so "1½" becomes "1 1/2".
const FRACTION_MAP: Record<string, string> = {
  "¼": "1/4",
  "½": "1/2",
  "¾": "3/4",
  "⅓": "1/3",
  "⅔": "2/3",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
};

function expandFractions(text: string): string {
  return text.replace(
    new RegExp(`(\\d)?([${FRACTIONS}])`, "g"),
    (_, whole: string | undefined, frac: string) =>
      (whole ? `${whole} ` : "") + FRACTION_MAP[frac],
  );
}

export function splitQuantity(line: string): SplitIngredient {
  const trimmed = line.trim();
  const m = trimmed.match(LEAD);
  if (!m) return { qty: "", name: trimmed };

  const word = m[2];
  const wordIsUnit = !!word && UNITS.has(word.toLowerCase().replace(/\.$/, ""));

  const consumed = wordIsUnit ? m[0].length : m[0].length - (word?.length ?? 0);
  const qty = expandFractions(trimmed.slice(0, consumed).trim());
  const name = trimmed.slice(consumed).trim().replace(/^,\s*/, "");

  if (!qty || !name) return { qty: "", name: trimmed };
  return { qty, name };
}
