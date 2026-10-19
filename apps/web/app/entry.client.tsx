import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { performanceInstrumentation } from "./lib/telemetry/router";

startTransition(() => {
  hydrateRoot(document, <StrictMode><HydratedRouter instrumentations={[performanceInstrumentation]} /></StrictMode>);
});
