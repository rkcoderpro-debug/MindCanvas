import { readFileSync } from "node:fs";

// src/ and dist/ both sit beside package.json, so development and production
// report the version of the server package that was actually shipped.
export const APP_VERSION: string = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
