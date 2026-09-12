import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { registerMindCanvasServiceWorker } from "./lib/pwa";
import "./styles.css";

registerMindCanvasServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
