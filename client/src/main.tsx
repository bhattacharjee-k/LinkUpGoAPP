import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initAds } from "./lib/ads";

// Initialize ads early so the script is loaded by the time we need it
initAds();

createRoot(document.getElementById("root")!).render(<App />);
