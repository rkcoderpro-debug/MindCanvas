import { restoreWorkspaceShareSignIn } from "./lib/workspaceShareLinks";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { registerMindCanvasServiceWorker } from "./lib/pwa";
import { restoreOnlineRoomSignIn } from "./lib/onlineRoomRoutes";
import { restoreFolderSignIn } from "./lib/folderLinks";
import { installThemeTooltips } from "./lib/themeTooltips";
import "./styles.css";
import "./studioPolish.css";
import "./musicPolish.css";
import "./documentReader.css";

restoreOnlineRoomSignIn();
restoreFolderSignIn();
restoreWorkspaceShareSignIn();
registerMindCanvasServiceWorker();
installThemeTooltips(document);

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
