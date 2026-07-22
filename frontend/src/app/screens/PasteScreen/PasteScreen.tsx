import { PasteHtmlForm } from "@/features/extract/PasteHtmlForm/PasteHtmlForm";
import { useAppOutlet } from "@/app/router/useAppOutlet.ts";
import styles from "./PasteScreen.module.css";

// The paste-HTML fallback screen — a thin centring wrapper around PasteHtmlForm.
// The route remounts it on each visit, so the textarea starts empty.
export function PasteScreen() {
  const { lastUrl, extract, submitPaste, backToSearch } = useAppOutlet();

  return (
    <div className={styles.pasteScreen}>
      <title>Parsley — paste the page HTML</title>
      <div className={styles.pasteInner}>
        <PasteHtmlForm
          url={lastUrl}
          onSubmit={submitPaste}
          onCancel={backToSearch}
          loading={extract.loading}
        />
      </div>
    </div>
  );
}
