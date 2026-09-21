import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./lib/i18n";
import { resolveBackend } from "./lib/demo";
import { installInputModalityTracker } from "./lib/inputModality";

installInputModalityTracker();

// Decide local vs live persistence before anything renders: a configured but
// dead Supabase project must not turn into "unable to load" on every page.
void resolveBackend().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
