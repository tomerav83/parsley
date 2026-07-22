import type { ReactNode } from "react";

// Small inline icons for the error window's actions — one visual language
// (rounded caps/joins, ~1.9px stroke, inherit currentColor). Internal to
// ErrorWindow; lifted out of the component so the view file stays about layout.

const icon = (paths: ReactNode, strokeWidth = 1.9) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {paths}
  </svg>
);

export const RetryIcon = () =>
  icon(
    <>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3v5h-5" />
    </>,
    2,
  );

export const PasteIcon = () =>
  icon(
    <>
      <rect x="8" y="3" width="8" height="4" rx="1" />
      <path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
    </>,
  );

export const EditIcon = () =>
  icon(
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>,
  );

export const GithubIcon = () =>
  icon(
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-1-2.6c3-.3 6-1.5 6-6.6a5.1 5.1 0 0 0-1.4-3.5 4.8 4.8 0 0 0-.1-3.5s-1.1-.3-3.6 1.4a12.3 12.3 0 0 0-6.6 0C6.7 1.9 5.6 2.2 5.6 2.2a4.8 4.8 0 0 0-.1 3.5A5.1 5.1 0 0 0 4 9.2c0 5 3 6.3 5.9 6.6a3.4 3.4 0 0 0-.9 2.6V22" />,
  );
