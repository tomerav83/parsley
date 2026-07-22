import { useState, type FormEvent } from "react";
import { BackButton } from "@/components/BackButton/BackButton";
import styles from "./PasteHtmlForm.module.css";
import btn from "@/components/Button.module.css";

interface PasteHtmlFormProps {
  url: string;
  onSubmit: (html: string) => void;
  onCancel: () => void;
  loading: boolean;
}

// Fallback for sites that block server-side fetching at the IP level: the user
// opens the page in their own browser, copies the page source, and pastes it
// here. We extract from that HTML directly — no fetch, so the block is bypassed.
// A failed paste is terminal, so it doesn't surface here — it returns to the
// transition screen's report-only state (see useExtractionFlow.submitPaste).
export function PasteHtmlForm({
  url,
  onSubmit,
  onCancel,
  loading,
}: PasteHtmlFormProps) {
  const [html, setHtml] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = html.trim();
    if (trimmed) onSubmit(trimmed);
  }

  return (
    <div>
      <div className={styles.backrow}>
        <BackButton onClick={onCancel} />
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

        <textarea
          className={styles.input}
          placeholder="<!doctype html> …paste the whole page here…"
          aria-label="Page HTML source"
          value={html}
          onChange={(event) => setHtml(event.target.value)}
          disabled={loading}
          required
        />

        <button
          type="submit"
          className={`${btn.btn} ${btn.primary} ${styles.submit}`}
          disabled={loading}
        >
          {loading ? "EXTRACTING…" : "EXTRACT FROM HTML"}
        </button>
      </form>
    </div>
  );
}
