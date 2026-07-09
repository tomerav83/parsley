import type { ExtractError } from "../api";
import { errorInfo, reportIssueUrl } from "../errorInfo";

interface ErrorBannerProps {
  error: ExtractError;
  sourceUrl: string; // the URL that failed — used for the GitHub report body
  onPaste: () => void; // open the paste-HTML fallback
  onEdit: () => void; // refocus the URL field to fix the link
  onRetry: () => void; // re-run the extraction
}

// The extraction error card: a mono code badge, a plain-language cause + fix, and
// the recovery actions appropriate to the code. Only "unexpected" codes (likely
// bugs) show the quiet "Report it on GitHub" link, which opens a prefilled issue.
export function ErrorBanner({
  error,
  sourceUrl,
  onPaste,
  onEdit,
  onRetry,
}: ErrorBannerProps) {
  const info = errorInfo(error.code);

  return (
    <div className="error-card" role="alert">
      <span className="error-code">
        <span className="error-dot" aria-hidden />
        EXTRACTION FAILED · <b>{error.code}</b>
      </span>
      <h2 className="error-title">{info.title}</h2>
      <p className="error-hint">{info.hint}</p>

      <div className="error-actions">
        {info.canPaste && (
          <button type="button" className="btn btn-primary" onClick={onPaste}>
            Paste the HTML
          </button>
        )}
        {info.canEdit && (
          <button type="button" className="btn btn-primary" onClick={onEdit}>
            Edit link
          </button>
        )}
        {info.canRetry && (
          <button
            type="button"
            className={`btn ${info.canPaste || info.canEdit ? "btn-ghost" : "btn-primary"}`}
            onClick={onRetry}
          >
            Try again
          </button>
        )}
      </div>

      {info.unexpected && (
        <div className="error-report">
          <span>Not working as expected?</span>
          <a
            href={reportIssueUrl(error.code, sourceUrl)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-1-2.6c3-.3 6-1.5 6-6.6a5.1 5.1 0 0 0-1.4-3.5 4.8 4.8 0 0 0-.1-3.5s-1.1-.3-3.6 1.4a12.3 12.3 0 0 0-6.6 0C6.7 1.9 5.6 2.2 5.6 2.2a4.8 4.8 0 0 0-.1 3.5A5.1 5.1 0 0 0 4 9.2c0 5 3 6.3 5.9 6.6a3.4 3.4 0 0 0-.9 2.6V22" />
            </svg>
            Report it on GitHub ↗
          </a>
        </div>
      )}
    </div>
  );
}
