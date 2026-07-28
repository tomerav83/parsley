import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import "./index.css";
import "./print.css";
import { router } from "./app/router/router.tsx";
import { LiquidTransition } from "./app/LiquidTransition/LiquidTransition.tsx";
import { ignoreSkippedViewTransitions } from "./lib/viewTransitionGuard.ts";

// The submit flow chains view transitions, and a superseded one rejects benignly.
// Keep that out of the console.
ignoreSkippedViewTransitions();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
    {/* Outside the router on purpose: the flow reaches it through its module
        controller, and tests that mount App alone get the fallback path. */}
    <LiquidTransition />
  </StrictMode>,
);
