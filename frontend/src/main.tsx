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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Around the router so the flow reaches the wave through context; tests
        that mount App alone have no provider and take the fallback path. */}
    <WaveTransition>
      <RouterProvider router={router} />
    </WaveTransition>
  </StrictMode>,
);
