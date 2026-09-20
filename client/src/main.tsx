import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./lib/i18n";
import { installInputModalityTracker } from "./lib/inputModality";

installInputModalityTracker();

createRoot(document.getElementById("root")!).render(<App />);
