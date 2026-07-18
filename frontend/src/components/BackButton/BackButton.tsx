import btn from "@/components/Button.module.css";

// The "NEW SEARCH" back control shown above the recipe view and the paste form.
export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={btn.back} onClick={onClick}>
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
  );
}
