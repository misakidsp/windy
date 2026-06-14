import assert from "node:assert/strict";
import {
  appearanceCssVariables,
  colorSetting,
  defaultAppearanceSettings,
  fileRowHeightSetting,
  fontFamilySetting,
} from "../src/routes/appearanceModel";

assert.equal(colorSetting(defaultAppearanceSettings, "terminal.background"), "#111318");
assert.equal(colorSetting(defaultAppearanceSettings, "missing.color"), "");
assert.match(fontFamilySetting("Custom Font"), /^"Custom Font"/);

const variables = appearanceCssVariables({
  ...defaultAppearanceSettings,
  fonts: {
    ...defaultAppearanceSettings.fonts,
    uiFamily: "My UI",
    uiSize: 14,
  },
  layout: {
    fileRowHeight: 24,
  },
  colors: {
    ...defaultAppearanceSettings.colors,
    "app.background": "#000000",
  },
});

assert.equal(variables["--windy-ui-font-size"], "14px");
assert.equal(variables["--windy-file-row-height"], "24px");
assert.equal(variables["--windy-app-background"], "#000000");
assert.equal(variables["--windy-dialog-input-background"], "#1f242c");
assert.equal(variables["--windy-terminal-selection-background"], "#374151");
assert.match(variables["--windy-font-family"], /^"My UI"/);

assert.equal(fileRowHeightSetting(defaultAppearanceSettings), 20);
assert.equal(fileRowHeightSetting({ ...defaultAppearanceSettings, layout: { fileRowHeight: 10 } }), 16);
