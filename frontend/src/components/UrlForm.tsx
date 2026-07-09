import type { FormEvent, RefObject } from "react";

interface UrlFormProps {
  value: string;
  onChange: (url: string) => void;
  onSubmit: () => void;
  loading: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}

// The single input that drives the whole app. Squared, mono placeholder — the
// "mise en place" treatment. Submitting is handled by the parent (App), which
// owns the URL so error recovery ("Edit link") and the paste fallback reuse it.
export function UrlForm({
  value,
  onChange,
  onSubmit,
  loading,
  inputRef,
}: UrlFormProps) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (value.trim()) onSubmit();
  }

  return (
    <form className="url-form" onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        type="url"
        inputMode="url"
        className="url-input"
        placeholder="https://a-food-blog.com/best-roast-chicken"
        aria-label="Recipe URL"
        spellCheck={false}
        autoComplete="url"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={loading}
        required
      />
      <button type="submit" className="url-submit" disabled={loading}>
        {loading && <span className="spinner" aria-hidden />}
        <span>{loading ? "EXTRACTING" : "EXTRACT"}</span>
      </button>
    </form>
  );
}
