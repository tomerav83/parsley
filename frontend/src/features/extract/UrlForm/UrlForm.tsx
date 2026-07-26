import type { FormEvent, RefObject } from "react";
import styles from "./UrlForm.module.css";

interface UrlFormProps {
  value: string;
  onChange: (url: string) => void;
  onSubmit: () => void;
  loading: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
}

/**
 * The single input that drives the whole app. The parent owns the URL, so error
 * recovery and the paste fallback can reuse it.
 */
export function UrlForm({
  value,
  onChange,
  onSubmit,
  loading,
  inputRef,
}: UrlFormProps) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        type="url"
        className={styles.input}
        placeholder="https://a-food-blog.com/best-roast-chicken"
        aria-label="Recipe URL"
        spellCheck={false}
        autoComplete="url"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={loading}
        required
      />
      <button type="submit" className={styles.submit} disabled={loading}>
        {loading && <span className={styles.spinner} aria-hidden />}
        <span>{loading ? "EXTRACTING…" : "EXTRACT"}</span>
      </button>
    </form>
  );
}
