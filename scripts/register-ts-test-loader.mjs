import * as module from "node:module";
import { pathToFileURL } from "node:url";
import * as hooks from "./ts-test-loader.mjs";

if (typeof module.registerHooks === "function") {
  module.registerHooks(hooks);
} else {
  module.register("./scripts/ts-test-loader.mjs", pathToFileURL("./"));
}
