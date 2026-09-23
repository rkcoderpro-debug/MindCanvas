import packageJson from "../../package.json";

/** The web package is the source of truth for the version shown in the UI. */
export const APP_VERSION = packageJson.version;
export const APP_VERSION_LABEL = `V${APP_VERSION}`;
