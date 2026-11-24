import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { registerMindCanvasServiceWorker } from "./lib/pwa";
import { restoreOnlineRoomSignIn } from "./lib/onlineRoomRoutes";
import { restoreFolderSignIn } from "./lib/folderLinks";
import "./styles.css";

restoreOnlineRoomSignIn();
restoreFolderSignIn();
registerMindCanvasServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
