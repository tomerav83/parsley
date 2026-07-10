import { useRef, useState } from "react";
import {
  extractRecipe,
  extractRecipeFromHtml,
  ExtractError,
  type Recipe,
} from "./api";
import { UrlForm } from "./components/UrlForm";
import { RecipeCard } from "./components/RecipeCard";
import { RecipeSkeleton } from "./components/RecipeSkeleton";
import { ErrorBanner } from "./components/ErrorBanner";
import { PasteHtmlForm } from "./components/PasteHtmlForm";
import { Leaf } from "./components/Leaf";
import "./App.css";

function toExtractError(err: unknown): ExtractError {
  if (err instanceof ExtractError) return err;
  return new ExtractError("unknown", "Something went wrong. Please try again.");
}

// The three screens the app slides between. Order is the filmstrip order — a
// forward move (higher index) enters from the right; back exits to the right.
type Route = "home" | "paste" | "recipe";
const ORDER: Record<Route, number> = { home: 0, paste: 1, recipe: 2 };

const EXAMPLES = [
  { label: "Roast chicken", url: "https://www.seriouseats.com/roast-chicken" },
  { label: "Miso pasta", url: "https://smittenkitchen.com/miso-pasta" },
  { label: "Chocolate tart", url: "https://www.bonappetit.com/chocolate-tart" },
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0];
  }
}

function App() {
  const [route, setRoute] = useState<Route>("home");
  const [url, setUrl] = useState("");
  const [lastUrl, setLastUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<ExtractError | null>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  async function runUrl(target: string) {
    setLastUrl(target);
    setError(null);
    setRecipe(null);
    setLoading(true);
    setRoute("recipe"); // slide in and show the skeleton immediately
    try {
      setRecipe(await extractRecipe(target));
    } catch (err) {
      setError(toExtractError(err));
      setRoute("home"); // slide back; the error shows on the home screen
    } finally {
      setLoading(false);
    }
  }

  function submitUrl() {
    const trimmed = url.trim();
    if (trimmed) runUrl(trimmed);
  }

  async function submitPaste(html: string) {
    setError(null);
    setLoading(true);
    setRoute("recipe");
    try {
      setRecipe(await extractRecipeFromHtml(html, lastUrl));
    } catch (err) {
      setError(toExtractError(err));
      setRoute("paste"); // stay on paste so the HTML isn't lost
    } finally {
      setLoading(false);
    }
  }

  function backToSearch() {
    setError(null);
    setRoute("home");
  }

  function openPaste() {
    setError(null);
    setRoute("paste");
  }

  function editLink() {
    setError(null);
    setRoute("home");
    // wait for the slide before focusing so it lands on the visible field
    setTimeout(() => urlInputRef.current?.focus(), 260);
  }

  function pickExample(exampleUrl: string) {
    setUrl(exampleUrl);
    runUrl(exampleUrl);
  }

  function screenClass(name: Route): string {
    const delta = ORDER[name] - ORDER[route];
    const pos = delta === 0 ? "is-active" : delta < 0 ? "is-left" : "is-right";
    return `screen screen-${name} ${pos}`;
  }

  return (
    <div className="app">
      <div className="screens">
        {/* HOME */}
        <section
          className={screenClass("home")}
          aria-label="Search"
          inert={route !== "home"}
        >
          <div className="home-inner">
            <p className="home-kicker">recipe, extracted</p>
            <h1 className="wordmark">
              <Leaf className="wordmark-leaf" />
              <span>
                Pars<b>ley</b>
              </span>
            </h1>
            <p className="tagline">
              Paste a recipe link, get <b>just the recipe</b> — no life stories,
              no pop-ups, no scrolling past ten paragraphs.
            </p>

            <UrlForm
              value={url}
              onChange={setUrl}
              onSubmit={submitUrl}
              loading={loading}
              inputRef={urlInputRef}
            />

            <div className="examples">
              <span className="examples-label">try</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.url}
                  type="button"
                  className="example"
                  onClick={() => pickExample(ex.url)}
                  disabled={loading}
                >
                  {ex.label}
                </button>
              ))}
            </div>

            {error && route === "home" && (
              <ErrorBanner
                error={error}
                sourceUrl={lastUrl}
                onPaste={openPaste}
                onEdit={editLink}
                onRetry={() => runUrl(lastUrl)}
              />
            )}

            <p className="trust">
              <Leaf className="trust-leaf" />
              Nothing stored. Just you and the recipe.
            </p>
          </div>
        </section>

        {/* PASTE */}
        <section
          className={screenClass("paste")}
          aria-label="Paste page source"
          inert={route !== "paste"}
        >
          <div className="paste-inner">
            <PasteHtmlForm
              url={lastUrl}
              error={route === "paste" ? error : null}
              onSubmit={submitPaste}
              onCancel={backToSearch}
              loading={loading}
            />
          </div>
        </section>

        {/* RECIPE */}
        <section
          className={screenClass("recipe")}
          aria-label="Recipe"
          inert={route !== "recipe"}
        >
          <div className="recipe-bar">
            <button type="button" className="back" onClick={backToSearch}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
              NEW SEARCH
            </button>
            {recipe && (
              <span className="recipe-src">
                <span className="recipe-src-dot" aria-hidden />
                {recipe.site_name ?? hostOf(recipe.source_url)}
              </span>
            )}
          </div>
          <div className="recipe-scroll">
            {loading ? (
              <RecipeSkeleton />
            ) : recipe ? (
              <RecipeCard recipe={recipe} />
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;
