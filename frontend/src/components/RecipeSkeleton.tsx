// Shimmer placeholder shown while an extraction is in flight. Mirrors the recipe
// card's layout (hero banner, section body) so nothing jumps when the real
// content lands. Decorative only — hidden from assistive tech.
export function RecipeSkeleton() {
  return (
    <div className="recipe-card" aria-hidden>
      <div className="sk sk-hero" />
      <div className="sk sk-seg" />
      <div className="sk-lines">
        {[82, 64, 90, 71, 58, 78].map((w, i) => (
          <div key={i} className="sk sk-line" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}
