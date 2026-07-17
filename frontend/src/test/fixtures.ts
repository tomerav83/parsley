import type { Recipe } from "@/lib/api";
import heroAsset from "@/assets/hero.png";

// The hero is a real <img> and RecipeCard's safeImage() only renders http(s), so a
// data: URI would silently fall through to the no-photo header and quietly snapshot
// the wrong branch. Absolutising the bundled asset against the test server keeps it
// http, local and byte-stable — no network in the baseline path.
export const HERO_URL = new URL(heroAsset, location.href).href;

// One fixture behind every recipe baseline, so a diff is always "the component
// changed", never "the fixture changed". Deliberately exercises the awkward cases:
// a quantity-less ingredient (the .noqty branch), a unicode range + a step whose
// duration becomes a timer chip, and a step long enough to drive MethodSteps'
// shrink-to-fit.
export const RECIPE: Recipe = {
  name: "Charred Broccoli & Chickpea Traybake",
  image: null,
  author: "Sam Oyelaran",
  ingredients: [
    "400g chickpeas, drained",
    "3 tbsp olive oil",
    "1½ tsp smoked paprika",
    "2 heads broccoli, cut into florets",
    "flaky sea salt",
  ],
  steps: [
    "Heat the oven to 220°C fan.",
    "Toss the chickpeas and broccoli with the oil and paprika, spread them over the largest tray you own in a single layer — crowd the tray and they steam instead of charring — then roast 18–20 minutes, turning once, until the florets are blackened at the edges and the chickpeas rattle when you shake the tray.",
    "Finish with flaky salt and serve.",
  ],
  prep_time_minutes: 10,
  cook_time_minutes: 20,
  total_time_minutes: 30,
  yields: "2 servings",
  source_url: "https://example.com/charred-broccoli-traybake",
  site_name: "Example Kitchen",
};
