// The Parsley sprig mark — a stem with paired leaflets. Inherits currentColor so
// it takes the brand green wherever it's placed.
export function ParsleyLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 21V9" />
      <path d="M12 12C12 8 9 5 4 5c0 5 3 8 8 7z" />
      <path d="M12 10c0-4 3-7 8-7 0 5-3 8-8 7z" />
      <path d="M12 15c-.5-2.5-2.5-4-5-4 0 3 2 4.5 5 4z" />
    </svg>
  );
}
