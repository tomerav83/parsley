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
import { FloatingError } from "./components/FloatingError";
import { PasteHtmlForm } from "./components/PasteHtmlForm";
import { Leaf } from "./components/Leaf";
import { SprigsBackground } from "./components/SprigsBackground";
import "./App.css";

function toExtractError(err: unknown): ExtractError {
  if (err instanceof ExtractError) return err;
  return new ExtractError("unknown", "Something went wrong. Please try again.");
}

// The three screens the app slides between. Order is the filmstrip order — a
// forward move (higher index) enters from the right; back exits to the right.
type Route = "home" | "paste" | "recipe";
const ORDER: Record<Route, number> = { home: 0, paste: 1, recipe: 2 };

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
  // A failed paste has no further fallback, so it surfaces as the corner widget in
  // its terminal (report / not now) state rather than an inline error on the paste
  // screen. This flag tells FloatingError to open straight into that state.
  const [pasteFailed, setPasteFailed] = useState(false);
  // Bumped every time the paste screen is opened. Used as PasteHtmlForm's key so it
  // remounts fresh each visit — otherwise its textarea keeps the previous HTML.
  const [pasteSession, setPasteSession] = useState(0);
  const urlInputRef = useRef<HTMLInputElement>(null);

  // `isRetry` comes from the floating error widget's "Try again". On a retry we
  // deliberately keep the current error set while the request is in flight, so
  // the widget stays mounted and can tell a second failure apart from a fresh one
  // (see FloatingError). A fresh run clears the error first.
  async function runUrl(target: string, isRetry = false) {
    setLastUrl(target);
    if (!isRetry) setError(null);
    setPasteFailed(false);
    setRecipe(null);
    setLoading(true);
    // Stay on home while the form spinner runs; only slide once we actually
    // have a recipe. Sliding early meant a failed extract slid in then back.
    try {
      setRecipe(await extractRecipe(target));
      setError(null);
      setRoute("recipe");
    } catch (err) {
      setError(toExtractError(err)); // surfaced by the floating widget on home
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
    try {
      setRecipe(await extractRecipeFromHtml(html, lastUrl));
      setRoute("recipe"); // slide only once the paste actually yields a recipe
    } catch (err) {
      // A failed paste is the end of the recovery road — no further fallback to
      // offer. Return to the corner widget in its report-only terminal state
      // instead of showing an inline error on the paste screen.
      setError(toExtractError(err));
      setPasteFailed(true);
      setRoute("home");
    } finally {
      setLoading(false);
    }
  }

  function backToSearch() {
    setError(null);
    setPasteFailed(false);
    setUrl(""); // "new search" starts from a clean field
    setRoute("home");
  }

  function openPaste() {
    setError(null);
    setPasteFailed(false);
    setPasteSession((n) => n + 1); // remount the paste form so its textarea is empty
    setRoute("paste");
  }

  function editLink() {
    setError(null);
    setPasteFailed(false);
    setRoute("home");
    // wait for the slide before focusing so it lands on the visible field
    setTimeout(() => urlInputRef.current?.focus(), 260);
  }

  function screenClass(name: Route): string {
    const delta = ORDER[name] - ORDER[route];
    const pos = delta === 0 ? "is-active" : delta < 0 ? "is-left" : "is-right";
    return `screen screen-${name} ${pos}`;
  }

  return (
    <div className="app">
      <SprigsBackground />
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
              key={pasteSession}
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

      {/* Extraction failures on the search flow surface here, as a floating
          mascot fixed to the viewport corner. The paste screen keeps its own
          inline error so the pasted HTML isn't lost. */}
      {error && route === "home" && (
        <FloatingError
          error={error}
          sourceUrl={lastUrl}
          terminal={pasteFailed}
          onPaste={openPaste}
          onEdit={editLink}
          onRetry={() => runUrl(lastUrl, true)}
          onDismiss={() => {
            setError(null);
            setPasteFailed(false);
          }}
        />
      )}
    </div>
  );
}

export default App;
