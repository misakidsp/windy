import assert from "node:assert/strict";

import { invokeCommand, invokeErrorMessage, WindyInvokeError } from "../src/routes/tauriInvoke";

assert.equal(invokeErrorMessage("Invalid name regex: unclosed group"), "Invalid name regex: unclosed group");
assert.equal(invokeErrorMessage(new Error("Open PTY failed: unavailable")), "Open PTY failed: unavailable");

const objectError = { message: "ignored", code: "E_TEST" };
assert.equal(invokeErrorMessage(objectError), JSON.stringify(objectError));

const failingInvoke = async () => {
  throw "SFTP host is required.";
};

await assert.rejects(
  invokeCommand(failingInvoke, "test_sftp_connection"),
  (error) => {
    assert.ok(error instanceof WindyInvokeError);
    assert.equal(error.message, "SFTP host is required.");
    assert.equal(invokeErrorMessage(error), "SFTP host is required.");
    return true;
  },
);
