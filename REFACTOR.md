# Frontend maintainability plan — measured against open-source exemplars

Goal: make the frontend easy to understand and maintain, with every change grounded in a
cited open-source reference — and just as importantly, a written record of what already
matches the references so it doesn't get churned later.

**Sources scraped for this plan:** [bulletproof-react](https://github.com/alan2207/bulletproof-react)
(docs + its sample app `apps/react-vite`), [react.dev](https://react.dev/learn) official guidance,
[React Router 8 docs](https://reactrouter.com) + the official
[react-router-examples](https://github.com/remix-run/react-router-examples) repo,
[TanStack Query v5 docs](https://tanstack.com/query/v5) + [TkDodo's blog](https://tkdodo.eu/blog),
[react-aria FocusScope](https://react-aria.adobe.com/FocusScope) /
[Radix alert-dialog](https://www.radix-ui.com/primitives/docs/components/alert-dialog),
[W3C APG patterns](https://www.w3.org/WAI/ARIA/apg/patterns/), and npm
[parse-ingredient](https://github.com/jakeboone02/parse-ingredient) (run locally against our
test cases).

Baseline: **95/95 tests green** on `feat/understand-the-code`.

---

## Verdict first

**The implementation is solid, and the fear driving this review is mostly unfounded.**
Specifically:

- There are **no classes** in this codebase. Every component is a function component;
  the only `class` is `ExtractError extends Error` (`lib/api.ts:42`), which is the standard
  way to make a typed error.
- Components are already slim by the exemplars' own standards. bulletproof-react's sample
  components run ~90 lines ([discussions-list.tsx](https://github.com/alan2207/bulletproof-react/blob/master/apps/react-vite/src/features/discussions/components/discussions-list.tsx)
  is 92); no numeric size rule exists in its docs. Parsley's median component is ~70 lines.
- Logic already lives outside components: pure tested reducers (`features/extract/state/state.ts`,
  `FloatingError/state/state.ts`), a zod-validated API client (`lib/api.ts`), pure parsing
  (`features/recipe/ingredients.ts`), a cache module (`lib/recipeCache.ts`).
- What makes files *feel* heavy: ~20% of lines in the big files are prose comments, and
  two files (`ingredients.ts`, `errorInfo.ts`) are mostly **data tables** (a unit whitelist,
  an error-copy table), not logic.

Three files genuinely carry more than they should — `App.tsx`, `FloatingError.tsx`,
`MethodSteps.tsx`. Refactors R1–R3 below fix exactly those, each backed by a citation.
Everything else: leave alone (Part 3 records why, so future-you doesn't re-litigate it).

---

## Part 1 — What already matches the exemplars (do not churn)

| Area | Parsley today | Exemplar verdict |
|---|---|---|
| Folder layout | `app/` + `components/` + `features/{extract,recipe}` + `lib/` | Exactly bulletproof-react's prescribed shape and its `shared → features → app` direction ([project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)) |
| No barrel files | direct imports everywhere | bulletproof-react *reversed* its old barrel advice for Vite tree-shaking: "it is recommended to import the files directly" |
| API layer | `lib/api.ts`: zod schema + fetcher + typed error | The documented triad: "Types and validation schemas … a fetcher function … a hook" ([api-layer.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md)); central `api/` location explicitly allowed |
| State machines | `useReducer` + pure reducer in own tested file | Verbatim react.dev criteria: "A reducer is a pure function … you can export and test it separately in isolation" ([Extracting State Logic into a Reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer)) |
| Screens | thin, presentation-only, read outlet context | The DiscussionsList composition pattern (hook + render, no fetch logic in component) |
| Typed `useAppOutlet()` | wrapper hook over `useOutletContext` | *Literally* the docs' recommended TS pattern: "we recommend the parent component provide a custom hook for accessing the context value" ([useOutletContext](https://reactrouter.com/api/hooks/useOutletContext)) |
| Lazy routes | `lazy: { Component: async () => … }` | The current v7.5+ object API ([route.lazy](https://reactrouter.com/start/data/route-object#lazy)) |
| `viewTransition` | `navigate(to, { viewTransition: true })` | Documented API ([view-transitions](https://reactrouter.com/how-to/view-transitions)) |
| Carousel a11y | `role="group"` + `aria-roledescription="carousel"` + polite live region | Matches [APG carousel](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/) verbatim; our arrow keys *exceed* the base pattern's requirement |
| Dialog focus semantics | focus primary on open, return to sprite on close | Matches [APG modal-dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) ("When a dialog closes, focus returns to the element that invoked the dialog") |
| CSS Modules, co-located tests, function components | — | All listed/endorsed options in bulletproof-react |

---

## Part 2 — The three refactors

Ordered by value. Total estimated effort: about half a day. All three preserve behavior;
the existing behavior-level tests (App.test.tsx mocks at the API boundary and renders
through a real router) should pass unchanged except where noted.

### R1 · FloatingError: retry outcome through the handler, not an effect

**The one guidance-backed defect found in the codebase.** The widget detects a retry
failure by *watching the `error` prop's identity change* in an effect, coordinated with a
`didRetry` ref (`FloatingError.tsx:66-96`). react.dev names this exact shape as the thing
to remove:

> "If this logic is caused by a particular interaction, keep it in the event handler."
> — [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)

> "adjusting state based on props or other state makes your data flow more difficult to
> understand and debug. Always check whether you can … calculate everything during
> rendering instead."

The parent's `retry()` is already async and already knows the outcome — it just doesn't
return it. And the effect is guarding against a case that can't happen: a *fresh* submit
clears the error (`state.test.ts:39` — "submit (fresh) clears any prior error"), which
unmounts the widget entirely. **A retry failure is the only in-place `error` change**, so
the whole errorChanged/didRetry machinery exists for one event the click handler can
observe directly.

**Before** (`FloatingError.tsx`, abridged):

```tsx
const didRetry = useRef(false);

// Fold each `error`/`terminal` change into the machine (fresh error, failed
// retry, or an already-terminal paste failure). didRetry is consumed here.
useEffect(() => {
  dispatch({
    type: "errorChanged",
    terminal,
    didRetry: didRetry.current,
    retryInfo: errorInfo(error.code),
  });
  didRetry.current = false;
}, [error, terminal]);

function handleRetry() {
  didRetry.current = true;
  dispatch({ type: "retryStart" });
  onRetry();
}
```

**After** — the parent returns the outcome (in App / the flow hook):

```tsx
async function retry(): Promise<RunResult> {
  const result = await runUrl(lastUrl, { retry: true });
  if (result === "success") navigate(recipePath(lastUrl), { viewTransition: true });
  return result;
}
```

…and the widget consumes it in the handler; `failed`/`retryUsed` become render-time
derivations from the *current* error's affordances instead of stored state:

```tsx
async function handleRetry() {
  dispatch({ type: "retryStart" });
  // "success" unmounts the widget; "aborted" means a newer run owns the screen.
  if ((await onRetry()) === "error") dispatch({ type: "retryFailed" });
}

const info = errorInfo(error.code);
// One failed retry: report-only when nothing else can take over; otherwise the
// fallback becomes primary and retry is spent. Rate-limit/network keep retry
// as the sole repeatable action (nothing to hand over to).
const failed = terminal || (state.retryFailed && info.unexpected && !info.canPaste);
const retryUsed = state.retryFailed && (info.canPaste || info.canEdit);
const copy = failed ? SPRITE_FAILED : info;
```

The reducer shrinks accordingly — `errorChanged` (30 lines), the `RetryInfo` type, and the
stored `failed`/`retryUsed` fields all go; `retryFailed` is two lines
(`{ ...state, retrying: false, open: true }`). `initFloatingError(terminal)` keeps only
`open: terminal`.

*Deletes:* the `didRetry` ref, the errorChanged effect, ~30 reducer lines, 2 state fields.
*Test impact:* `FloatingError/state/state.test.ts` rewrites to the smaller event set (the
tests get simpler); `FloatingError.test.tsx` behavior tests pass unchanged.
*Verify while doing it:* the terminal remount path (paste fails on `/paste` → widget was
unmounted → remounts on home with `terminal=true`) — covered by the existing E6 tests.

### R2 · App.tsx: extract the orchestration into `useExtractionFlow()`

`App.tsx` (189 lines) is the one genuinely fat component: seven handlers, two effects, and
a hand-maintained 9-field context interface, all inline. Two cited rules bear on it:

> "Limit the number of props a component is accepting as input."
> — [components-and-styling.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/components-and-styling.md)

> "whenever you write an Effect, consider whether it would be clearer to also wrap it in a
> custom Hook … it lets you precisely communicate your intent."
> — [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)

Note what the guidance does **not** say: the handlers themselves are canonical
("interaction logic lives in event handlers"), and lifting shared state to the layout route
is endorsed ("compose different features at the application level"). The fix is packaging,
not redesign: move the orchestration into one named hook so App renders chrome.

**Before:** `App.tsx` = `useRecipeExtractor()` + `useState(url)` + `useState(lastUrl)` +
`urlFieldRef` + cache effect + `submitUrl`/`submitPaste`/`requestRecipe`/`retry`/
`backToSearch`/`openPaste`/`dismissError` + slide/focus effect + JSX + a separately
maintained `AppOutletContext` interface listing all 9 fields (`useAppOutlet.ts:8-23`).

**After:**

```tsx
// src/app/useExtractionFlow.ts — the extraction journey: submit → navigate,
// retry, paste fallback, deep-link, and the sessionStorage cache write.
export function useExtractionFlow() {
  const extract = useRecipeExtractor();
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [lastUrl, setLastUrl] = useState("");
  const urlFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (extract.recipe) cacheRecipe(lastUrl, extract.recipe);
  }, [extract.recipe, lastUrl]);

  async function submitUrl() { /* unchanged body */ }
  async function submitPaste(html: string) { /* unchanged */ }
  async function retry(): Promise<RunResult> { /* R1's version */ }
  const requestRecipe = useCallback(/* unchanged */);
  /* backToSearch, openPaste, dismissError — unchanged */

  return { extract, url, setUrl, lastUrl, urlFieldRef,
           submitUrl, submitPaste, requestRecipe, retry,
           backToSearch, openPaste, dismissError };
}
```

```tsx
// src/app/router/useAppOutlet.ts — the interface stops being hand-maintained:
export type AppOutletContext = ReturnType<typeof useExtractionFlow>;
export const useAppOutlet = () => useOutletContext<AppOutletContext>();
```

```tsx
// src/app/App.tsx — chrome only (~70 lines):
function App() {
  const flow = useExtractionFlow();
  const onHome = useLocation().pathname === "/";
  useSlideDirection(); // the stamp+focus layout effect, named (optional split)
  return (
    <div className={styles.app}>
      <Background />
      <ThemeToggle />
      <main className={styles.screens} data-app-screens="">
        <Outlet context={flow} />
      </main>
      {/* live region + <FloatingError …> exactly as today, reading from flow */}
    </div>
  );
}
```

*Deletes:* the duplicated 9-field interface (derived instead); App drops to ~70 lines.
*Doesn't change:* the outlet-context mechanism (it's the documented pattern; no official
React Router example passes a bag this wide, but the width comes from state that genuinely
must survive route changes — the field text for "Edit link", `lastUrl` + error for the
cross-route widget — so narrowing it would break the UX it serves).
*Test impact:* none — App.test.tsx tests behavior through the router.

### R3 · MethodSteps: give `useFitText` its own file and test

`MethodSteps.tsx` (202 lines) inlines a 30-line `useFitText` hook — a ResizeObserver +
font-load-refit loop, the subtlest logic in the file and the only part not directly
unit-tested. react.dev's extraction rule targets exactly this:

> "if you're writing [an Effect], it means you need to 'step outside React' to synchronize
> with some external system … Wrapping it into a custom Hook lets you precisely
> communicate your intent." — with `useIntersectionObserver(ref, options)` as the named
> good example. — [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)

One-hook-per-file is also the convention of the canonical hooks repo
([streamich/react-use](https://github.com/streamich/react-use)) — which, notably, has no
fit-text hook to adopt, so ours stays local.

**After:** move the hook verbatim to `MethodSteps/useFitText.ts`; add
`useFitText.test.tsx` in the browser project (it needs real layout — per the repo's
test-environment convention, real-Chromium for anything measuring boxes). Assert: long
text shrinks below base size, short text stays at base, hidden element (height 0) is left
alone.

**Explicitly not extracted, with reasons:**
- The swipe handlers (15 lines): "You don't need to extract a custom Hook for every little
  duplicated bit of code. Some duplication is fine." (react.dev, same page).
  [react-swipeable](https://github.com/FormidableLabs/react-swipeable) exists (1.5 kB gz,
  maintained) — noted for if swipe ever appears in a second component.
- The timer regex and Chevron svg: no guidance bears on them; they're 10 lines each and
  used once.

---

## Part 3 — Decision records (researched, resolved: keep as-is)

These are the "why doesn't this app use X like everyone online" questions, answered with
evidence so they stay answered. Each has a trigger that reopens it.

### D1 · Hand-rolled data layer vs TanStack Query — **keep, with triggers**

bulletproof-react does prescribe a server-cache lib as the default, and TkDodo's
["Why You Want React Query"](https://tkdodo.eu/blog/why-you-want-react-query) catalogs the
bugs of hand-rolled fetching (race conditions, StrictMode double-fires, loading-state
gaps). **Parsley's hand-rolled layer already handles every bug on that list** — the
AbortController supersede in `recipeExtractor.ts:34` is the race-condition fix; the state
machine is the loading-state fix — in ~250 tested lines.

What the migration would actually look like (verified against TQ v5 docs):

- The signature UX ("stay on Home until the recipe lands") **stays imperative** under TQ —
  [`queryClient.fetchQuery`](https://tanstack.com/query/v5/docs/reference/QueryClient) +
  local pending state, structurally the same code as today's reducer.
- TQ's cancellation is **per-key**: submitting URL B while URL A is in flight does *not*
  cancel A's `fetchQuery` promise ([query-cancellation](https://tanstack.com/query/v5/docs/framework/react/guides/query-cancellation)
  — cancellation is keyed state management, not latest-user-intent). Our "a superseded
  submit can never navigate later" guarantee would still need a hand-rolled guard.
- Defaults become footguns for a POST-backed pseudo-query: `retry: 3` with backoff,
  `refetchOnWindowFocus`, `refetchOnReconnect` — each a surprise re-POST of the extract
  endpoint until disabled. The paste flow is forced into direct `setQueryData` seeding
  (the pattern [TkDodo advises against](https://tkdodo.eu/blog/mastering-mutations-in-react-query)
  when invalidation is possible) and needs `staleTime: Infinity` pinned so a refetch can't
  hit the unfetchable URL.
- Cost: 3 deps, ~17 kB gz, into an app whose runtime deps are react, react-router, zod.
- Real wins forfeited: the deep-link effect + `requestedFor` ref would become a plain
  `useQuery(['recipe', url])`, and `recipeCache.ts` would become the persister plugin
  (minus our 10-entry LRU — TQ's persistence is time-based only).

**Reopen when:** the app grows a second server resource, or needs background
refetch/stale management/optimistic updates. At that point adopt TQ wholesale (query-key
`['recipe', url]`, persister with `shouldDehydrateQuery`), don't run both layers.

### D2 · Deep-link effect vs React Router loaders — **keep, with a trigger**

Loaders are the documented tool for exactly `/recipe?url=X`: a loader reads
`new URL(request.url).searchParams`, the router re-runs it on "any change to URL search
params" (no `requestedFor` guard needed), and on client navigations "the loaders for the
next page are awaited before the next page renders" — so stay-on-Home-while-loading
survives ([data-loading](https://reactrouter.com/start/data/data-loading),
[route-object#shouldRevalidate](https://reactrouter.com/start/data/route-object#shouldRevalidate)).

Why not, for this app: **a throwing loader renders the `ErrorBoundary` on the destination
route** ([error-boundary](https://reactrouter.com/how-to/error-boundary)) — the navigation
completes and `/recipe` shows the error. Parsley's most-designed feature is the opposite:
failures keep you on Home with the floating widget's retry/paste state, which spans
routes. Splitting the difference (loader for deep links only, Home-side fetch for submits)
means two fetch paths for one resource, and the loader can't see the in-memory hook state,
making the cache-write ordering load-bearing. The docs have no pattern for "error surfaces
on the origin route."

**Reopen when:** the error UX moves into the recipe route, or the app adopts framework
mode/SSR. The RecipeScreen effect (`RecipeScreen.tsx:37-45`) keeps its long comment — it's
carrying a documented deviation.

### D3 · `ingredients.ts` vs npm `parse-ingredient` — **keep, measured**

[parse-ingredient](https://github.com/jakeboone02/parse-ingredient) (v2.2.0, maintained,
3.5 kB gz with its dep) was run locally against our tested edge cases:

| Input | parse-ingredient v2.2.0 | our `splitQuantity` |
|---|---|---|
| `1½ tbsp olive oil` | ✓ (as normalized float) | ✓ |
| `1 and 1/2 cups flour` | ✗ name becomes "and 1/2 cups flour" | ✓ |
| `2 x 400g chopped tomatoes` | ✗ name becomes "x 400g chopped tomatoes" | ✓ |
| `juice of 1 lemon` | ✗ mangled to "juice of lemon", qty 1 | ✓ passed through |
| `1 to 2 pears` | separator text lost (reconstructs "1-2") | ✓ preserved |
| `salt to taste` | ✓ same graceful fallback | ✓ |

It also returns normalized floats, not the display substring we need — reconstruction
requires a second dep (`format-quantity`) plus glue, and 22 of our unit forms (the UK/count
tail: rashers, tins, knobs…) would need ~100 lines of `additionalUOMs` config. **Net LOC
roughly zero-to-negative, with behavior regressions.** The lib solves scaling/conversion —
problems this app doesn't have.

**Reopen when:** recipe scaling or unit conversion becomes a feature. parse-ingredient is
best-in-class for that job.

---

## Part 4 — Do-not-do list

- **Don't chase a line-count target.** The exemplar's own components are ~90 lines. After
  R1–R3 the largest component will be ~200 lines of which a fifth is why-comments; that's
  in-distribution.
- **Don't split `Background.tsx`** (194 lines). Canvas animation is inherently imperative;
  it's isolated, `aria-hidden`, honors reduced-motion, and cleans up after itself. One
  effect synchronizing with an external system is the *endorsed* use of effects.
- **Don't extract the swipe handlers or add react-swipeable** (see R3).
- **Don't slim the comment prose wholesale.** The why-comments citing APG/WCAG/redesign
  decisions are this codebase's documentation. Optional light pass: rewrite the handful of
  PR-narration comments ("replacing the five useState flags…") into present-tense
  statements — history belongs to git.
- **Don't move `lib/api.ts` into `features/extract/api/`.** bulletproof-react explicitly
  allows the central location; with one endpoint pair it's churn for zero benefit.

## Suggested order

| Step | Change | Effort | Risk |
|---|---|---|---|
| 1 | R1 FloatingError retry-through-handler | ~1 h | Low — state tests rewrite smaller; behavior tests unchanged |
| 2 | R2 `useExtractionFlow()` extraction | ~1 h | Low — pure move; App tests unchanged |
| 3 | R3 `useFitText` file + browser test | ~30 min | None |
| 4 | (optional) FloatingError action buttons: replace the four nested renderer closures + ternary cascade (`FloatingError.tsx:130-213`) with one `ActionButton` + an ordered actions array — bulletproof-react: "Avoid large components with nested rendering functions" | ~45 min | Low |
| 5 | (optional) PR-narration comment pass | ~30 min | None |

Each step lands green on `npm test` (95 baseline) before the next starts.
