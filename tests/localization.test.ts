import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { defaultKeybindSettings } from "../src/routes/keyboardModel";
import { defaultMessages, translateMessage } from "../src/routes/localization";
import type { LanguageSettings } from "../src/routes/types";

const englishSettings = JSON.parse(readFileSync("docs/examples/language.en.json", "utf8")) as LanguageSettings;
const japaneseSettings = JSON.parse(readFileSync("docs/examples/language.ja.json", "utf8")) as LanguageSettings;
const quenyaSettings = JSON.parse(readFileSync("docs/examples/language.qya-Latn.json", "utf8")) as LanguageSettings;

const languagePresets = [englishSettings, japaneseSettings, quenyaSettings];
const defaultMessageIds = Object.keys(defaultMessages).sort();

function placeholders(template: string): string[] {
  return Array.from(template.matchAll(/\{([a-zA-Z0-9_]+)\}/g), (match) => match[1]).sort();
}

for (const settings of languagePresets) {
  assert.deepEqual(
    Object.keys(settings.messages).sort(),
    defaultMessageIds,
    `${settings.locale} must define the same message ids as the default messages`,
  );

  for (const id of defaultMessageIds) {
    assert.deepEqual(
      placeholders(settings.messages[id]),
      placeholders(defaultMessages[id]),
      `${settings.locale}:${id} must use the same placeholders as the default message`,
    );
  }
}

for (const commandId of Object.keys({ ...defaultKeybindSettings.lockedBindings, ...defaultKeybindSettings.bindings })) {
  assert.ok(
    defaultMessages[`keyHelp.command.${commandId}`],
    `key help command ${commandId} must have a localized label`,
  );
}

assert.equal(translateMessage(undefined, "dialog.close"), "Close");
assert.equal(translateMessage(undefined, "viewer.openFailed", { error: "boom" }), "Viewer failed: boom");
assert.equal(translateMessage(japaneseSettings, "preferences.title"), "設定");
assert.equal(
  translateMessage(japaneseSettings, "preferences.currentLocale", { locale: "ja" }),
  "現在のlocale: ja",
);
assert.equal(translateMessage(japaneseSettings, "missing.key"), "missing.key");
