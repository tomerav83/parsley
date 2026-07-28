import { ParsleyLogo } from "@/components/ParsleyLogo.tsx";
import { UrlForm } from "@/features/extract/UrlForm/UrlForm";
import { useAppOutlet } from "@/app/router/useAppOutlet.ts";
import styles from "./HomeScreen.module.css";

/**
 * The landing screen: wordmark, promise, and the URL input that drives everything.
 * Presentation only — the state lives in App and arrives via the outlet context.
 */
export function HomeScreen() {
  const { url, setUrl, submitUrl, extract, urlFieldRef } = useAppOutlet();

  return (
    <div className={styles.homeScreen}>
      <title>Parsley — paste a link, get just the recipe</title>
      <div className={styles.homeInner}>
        <p className={styles.homeKicker}>recipe, extracted</p>
        {/* App moves focus here on a route change; tabIndex={-1} allows that
            without adding a tab stop */}
        <h1 className={styles.wordmark} data-route-heading tabIndex={-1}>
          <ParsleyLogo className={styles.wordmarkLeaf} />
          <span>
            Pars<b>ley</b>
          </span>
        </h1>
        <p className={styles.tagline}>
          Paste a recipe link, get <b>just the recipe</b> — no life stories, no
          pop-ups, no scrolling past ten paragraphs.
        </p>

        <UrlForm
          value={url}
          onChange={setUrl}
          onSubmit={submitUrl}
          loading={extract.loading}
          inputRef={urlFieldRef}
        />

        <p className={styles.trust}>
          <ParsleyLogo className={styles.trustLeaf} />
          Nothing stored. Just you and the recipe.
        </p>
      </div>
    </div>
  );
}
