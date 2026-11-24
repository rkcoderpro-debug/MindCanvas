import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { registerMindCanvasServiceWorker } from "./lib/pwa";
import { restoreOnlineRoomSignIn } from "./lib/onlineRoomRoutes";
import "./styles.css";

restoreOnlineRoomSignIn();
registerMindCanvasServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
