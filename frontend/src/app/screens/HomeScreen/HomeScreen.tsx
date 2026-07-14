import type { RefObject } from "react";
import { ParsleyLogo } from "@/components/ParsleyLogo.tsx";
import { UrlForm } from "@/features/extract/UrlForm/UrlForm";
import styles from "./HomeScreen.module.css";

interface HomeScreenProps {
  url: string;
  onChange: (url: string) => void;
  onSubmit: () => void;
  loading: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
}

// The landing screen: the wordmark, the promise, and the single URL input that
// drives the whole app. All state lives in App; this is presentation only.
export function HomeScreen({
  url,
  onChange,
  onSubmit,
  loading,
  inputRef,
}: HomeScreenProps) {
  return (
    <div className={styles.homeInner}>
      <p className={styles.homeKicker}>recipe, extracted</p>
      <h1 className={styles.wordmark}>
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
        onChange={onChange}
        onSubmit={onSubmit}
        loading={loading}
        inputRef={inputRef}
      />

      <p className={styles.trust}>
        <ParsleyLogo className={styles.trustLeaf} />
        Nothing stored. Just you and the recipe.
      </p>
    </div>
  );
}
