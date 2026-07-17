import { useState, type FormEvent } from "react";
import type { ExtractError } from "@/lib/api";
import { errorInfo } from "@/features/extract/errorInfo";
import styles from "./PasteHtmlForm.module.css";
import btn from "@/components/Button.module.css";

interface PasteHtmlFormProps {
  url: string;
  error: ExtractError | null; // a failure from a previous paste attempt
  onSubmit: (html: string) => void;
  onCancel: () => void;
  loading: boolean;
}

// Fallback for sites that block server-side fetching at the IP level: the user
// opens the page in their own browser, copies the page source, and pastes it
// here. We extract from that HTML directly — no fetch, so the block is bypassed.
export function PasteHtmlForm({
  url,
  error,
  onSubmit,
  onCancel,
  loading,
}: PasteHtmlFormProps) {
  const [html, setHtml] = useState("");
  const [touched, setTouched] = useState(false);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = html.trim();
    if (trimmed) onSubmit(trimmed);
    else setTouched(true);
  }

  const empty = touched && !html.trim();

  return (
    <div>
      <div className={styles.backrow}>
        <button type="button" className={btn.back} onClick={onCancel}>
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
      </div>

      <form onSubmit={handleSubmit}>
        <h1 className={styles.label} data-route-heading tabIndex={-1}>
          paste · page source
        </h1>
        <p className={styles.help}>
          On{" "}
          <a href={url} target="_blank" rel="noreferrer noopener">
            the recipe page
          </a>{" "}
          press <kbd>Ctrl</kbd>+<kbd>U</kbd> to view source, then{" "}
          <kbd>Ctrl</kbd>+<kbd>A</kbd> <kbd>Ctrl</kbd>+<kbd>C</kbd> and paste it
          below. We read the recipe straight from the HTML.
        </p>

        {error && (
          <p className={styles.error} role="alert">
            {errorInfo(error.code).title} — {errorInfo(error.code).hint}
          </p>
        )}

        <textarea
          className={`${styles.input}${empty ? ` ${styles.isEmpty}` : ""}`}
          placeholder="<!doctype html> …paste the whole page here…"
          aria-label="Page HTML source"
          value={html}
          onChange={(event) => setHtml(event.target.value)}
          disabled={loading}
          rows={8}
        />

        <div className={styles.actions}>
          <button
            type="submit"
            className={`${btn.btn} ${btn.primary}`}
            disabled={loading}
          >
            {loading ? "EXTRACTING…" : "EXTRACT FROM HTML"}
          </button>
          <button
            type="button"
            className={`${btn.btn} ${btn.ghost}`}
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
