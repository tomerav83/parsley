import { useEffect } from "react";
import { ParsleyLogo } from "@/components/ParsleyLogo.tsx";
import { UrlForm } from "@/features/extract/UrlForm/UrlForm";
import { appOutlet } from "@/app/appOutlet.ts";
import styles from "./HomeScreen.module.css";

// The landing screen: the wordmark, the promise, and the single URL input that
// drives the whole app. State lives in App and is read from the outlet context;
// this is presentation only.
export function HomeScreen() {
  const { url, setUrl, submitUrl, extract, urlFieldRef } = appOutlet();

  useEffect(() => {
    document.title = "Parsley — paste a link, get just the recipe";
  }, []);

  return (
    <div className={styles.homeScreen}>
      <div className={styles.homeInner}>
        <p className={styles.homeKicker}>recipe, extracted</p>
        {/* focus target on route change (App moves focus here); tabIndex={-1}
            makes it programmatically focusable without adding a tab stop */}
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
