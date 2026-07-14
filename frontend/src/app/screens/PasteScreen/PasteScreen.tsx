import type { ExtractError } from "@/lib/api";
import { PasteHtmlForm } from "@/features/extract/PasteHtmlForm/PasteHtmlForm";
import styles from "./PasteScreen.module.css";

interface PasteScreenProps {
  url: string;
  error: ExtractError | null; // a failure from a previous paste attempt
  onSubmit: (html: string) => void;
  onCancel: () => void;
  loading: boolean;
}

// The paste-HTML fallback screen — a thin centring wrapper around PasteHtmlForm.
// App remounts it (via key) on each visit so the textarea starts empty.
export function PasteScreen({
  url,
  error,
  onSubmit,
  onCancel,
  loading,
}: PasteScreenProps) {
  return (
    <div className={styles.pasteInner}>
      <PasteHtmlForm
        url={url}
        error={error}
        onSubmit={onSubmit}
        onCancel={onCancel}
        loading={loading}
      />
    </div>
  );
}
