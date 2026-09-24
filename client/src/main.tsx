import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./lib/i18n";
import { resolveBackend } from "./lib/demo";
import { installInputModalityTracker } from "./lib/inputModality";

installInputModalityTracker();

// Decide the backend mode before anything renders. In production this resolves
// at once (the health probe runs in the background and only drives the outage
// banner); only dev/preview builds that allow local fallback wait for the probe.
void resolveBackend().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
