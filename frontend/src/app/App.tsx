import { useRef, useState } from "react";
import { recipeExtractor } from "@/features/extract/recipeExtractor.ts";
import { FloatingError } from "@/features/extract/FloatingError/FloatingError";
import { Background } from "@/components/Background.tsx";
import { ThemeToggle } from "@/components/ThemeToggle/ThemeToggle";
import { HomeScreen } from "./screens/HomeScreen/HomeScreen";
import { PasteScreen } from "./screens/PasteScreen/PasteScreen";
import { RecipeScreen } from "./screens/RecipeScreen/RecipeScreen";
import styles from "./App.module.css";

// The three screens the app slides between. Order is the filmstrip order — a
// forward move (higher index) enters from the right; back exits to the right.
type Route = "home" | "paste" | "recipe";
const ORDER: Record<Route, number> = { home: 0, paste: 1, recipe: 2 };

// Route → its screen-specific module class. `satisfies` checks every route is
// covered while keeping the values' real type (CSS-module keys are
// `string | undefined` under noUncheckedIndexedAccess).
const SCREEN_CLASS = {
  home: styles.screenHome,
  paste: styles.screenPaste,
  recipe: styles.screenRecipe,
} satisfies Record<Route, string | undefined>;

// App owns only the route and the URL field; the extraction request lifecycle
// lives in recipeExtractor, and each screen's markup in its own component.
function App() {
  const extract = recipeExtractor();
  const [route, setRoute] = useState<Route>("home");
  const [url, setUrl] = useState("");
  const [lastUrl, setLastUrl] = useState("");
  // Bumped every time the paste screen is opened. Used as PasteScreen's key so it
  // remounts fresh each visit — otherwise its textarea keeps the previous HTML.
  const [pasteSession, setPasteSession] = useState(0);
  const urlInputRef = useRef<HTMLInputElement>(null);

  async function submitUrl() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLastUrl(trimmed);
    // Stay on home while the request runs; only slide once a recipe lands, so a
    // failed extract doesn't slide in then back.
    if ((await extract.runUrl(trimmed)) === "success") setRoute("recipe");
  }

  async function submitPaste(html: string) {
    const result = await extract.runPaste(html, lastUrl);
    if (result === "success") setRoute("recipe");
    // A failed paste is the end of the recovery road — return to home, where it
    // surfaces as the corner widget in its report-only terminal state.
    else if (result === "error") setRoute("home");
  }

  // "Try again" from the floating widget re-runs WITHOUT clearing the error, so
  // the widget stays mounted to tell a second failure apart from a fresh one.
  async function retry() {
    if ((await extract.runUrl(lastUrl, { retry: true })) === "success")
      setRoute("recipe");
  }

  function backToSearch() {
    extract.dismiss();
    setUrl(""); // "new search" starts from a clean field
    setRoute("home");
  }

  function openPaste() {
    extract.dismiss();
    setPasteSession((n) => n + 1); // remount the paste form so its textarea is empty
    setRoute("paste");
  }

  function editLink() {
    extract.dismiss();
    setRoute("home");
    // wait for the slide before focusing so it lands on the visible field
    setTimeout(() => urlInputRef.current?.focus(), 260);
  }

  function screenClass(name: Route): string {
    const delta = ORDER[name] - ORDER[route];
    const pos =
      delta === 0
        ? styles.isActive
        : delta < 0
          ? styles.isLeft
          : styles.isRight;
    return `${styles.screen} ${SCREEN_CLASS[name]} ${pos}`;
  }

  return (
    <div className={styles.app}>
      <Background />
      <ThemeToggle />
      <div className={styles.screens}>
        <section
          className={screenClass("home")}
          aria-label="Search"
          inert={route !== "home"}
        >
          <HomeScreen
            url={url}
            onChange={setUrl}
            onSubmit={submitUrl}
            loading={extract.loading}
            inputRef={urlInputRef}
          />
        </section>

        <section
          className={screenClass("paste")}
          aria-label="Paste page source"
          inert={route !== "paste"}
        >
          <PasteScreen
            key={pasteSession}
            url={lastUrl}
            error={route === "paste" ? extract.error : null}
            onSubmit={submitPaste}
            onCancel={backToSearch}
            loading={extract.loading}
          />
        </section>

        <section
          className={screenClass("recipe")}
          aria-label="Recipe"
          inert={route !== "recipe"}
        >
          <RecipeScreen
            recipe={extract.recipe}
            loading={extract.loading}
            onBack={backToSearch}
          />
        </section>
      </div>

      {/* Extraction failures on the search flow surface here, as a floating
          mascot fixed to the viewport corner. The paste screen keeps its own
          inline error so the pasted HTML isn't lost. */}
      {extract.error && route === "home" && (
        <FloatingError
          error={extract.error}
          sourceUrl={lastUrl}
          terminal={extract.pasteFailed}
          onPaste={openPaste}
          onEdit={editLink}
          onRetry={retry}
          onDismiss={extract.dismiss}
        />
      )}
    </div>
  );
}

export default App;
