import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import "./index.css";
import "./print.css";
import { router } from "./app/router/router.tsx";
import { LiquidTransition } from "./app/LiquidTransition/LiquidTransition.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
    {/* Viewport-level, router-free on purpose: useExtractionFlow drives it
        through its module controller, and app tests that mount App alone stay
        on the view-transition fallback path. */}
    <LiquidTransition />
  </StrictMode>,
);
