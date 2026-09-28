import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import "./index.css";
import "./print.css";
import { router } from "./app/router/router.tsx";
import { WaveTransition } from "./navigation/WaveTransition/WaveTransition.tsx";
import { ignoreSkippedViewTransitions } from "./lib/viewTransitionGuard.ts";

// The submit flow chains view transitions, and a superseded one rejects benignly.
// Keep that out of the console.
ignoreSkippedViewTransitions();

// After a deploy, an open tab asks for chunk names that no longer exist (Vercel
// answers them with index.html). Reload to pick up the new build, but at most
// once per 10s so a deep link to a genuinely broken deploy can't loop forever.
window.addEventListener("vite:preloadError", (event) => {
  const last = Number(sessionStorage.getItem("chunkReloadAt") ?? 0);
  if (Date.now() - last < 10_000) return; // falls through to the root ErrorBoundary
  sessionStorage.setItem("chunkReloadAt", String(Date.now()));
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Around the router so the flow reaches the wave through context; tests
        that mount App alone have no provider and take the fallback path. */}
    <WaveTransition>
      <RouterProvider router={router} />
    </WaveTransition>
  </StrictMode>,
);
