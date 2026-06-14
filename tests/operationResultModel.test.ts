import assert from "node:assert/strict";
import { operationResultStatus, operationResultTerminalLines } from "../src/routes/operationResultModel";

const result = {
  succeeded: Array.from({ length: 12 }, (_, index) => ({
    path: `/dest/${index}.txt`,
    message: "copied",
  })),
  failed: [{ path: "", message: "blocked" }],
};

assert.equal(operationResultStatus("Copy", result), "Copy: 12 succeeded / 1 failed");
assert.deepEqual(operationResultTerminalLines("Copy", result).slice(0, 3), [
  "",
  "[failed] -: blocked",
  "[ok] /dest/0.txt: copied",
]);
assert.equal(operationResultTerminalLines("Copy", result).at(-2), "[ok] ...and 2 more");
assert.equal(operationResultTerminalLines("Copy", { ...result, canceled: true }).at(-1), "[operation] Copy canceled: 12 succeeded / 1 failed");
