import { useEffect } from "react";
import { PasteHtmlForm } from "@/features/extract/PasteHtmlForm/PasteHtmlForm";
import { appOutlet } from "@/app/appOutlet.ts";
import styles from "./PasteScreen.module.css";

// The paste-HTML fallback screen — a thin centring wrapper around PasteHtmlForm.
// The route remounts it on each visit, so the textarea starts empty.
export function PasteScreen() {
  const { lastUrl, extract, submitPaste, backToSearch } = appOutlet();

  useEffect(() => {
    document.title = "Parsley — paste the page HTML";
  }, []);

  return (
    <div className={styles.pasteScreen}>
      <div className={styles.pasteInner}>
        <PasteHtmlForm
          url={lastUrl}
          error={extract.error}
          onSubmit={submitPaste}
          onCancel={backToSearch}
          loading={extract.loading}
        />
      </div>
    </div>
  );
}
