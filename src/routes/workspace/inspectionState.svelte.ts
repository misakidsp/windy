import { type PaneDiffSnapshot } from "../diffModel";
import { type FilePropertySnapshot } from "../propertyModel";

export function createInspectionState() {
  let filePropertiesDialog: FilePropertySnapshot | null = $state.raw(null);
  let paneDiffDialog: PaneDiffSnapshot | null = $state.raw(null);
  let paneDiffListElement: HTMLDivElement | null = $state.raw(null);
  let detailedDiffRunning = $state.raw(false);
  let detailedDiffJobId: string | null = $state.raw(null);
  let detailedDiffCancelRequested = $state.raw(false);

  return {
    get filePropertiesDialog() { return filePropertiesDialog; },
    set filePropertiesDialog(value: FilePropertySnapshot | null) { filePropertiesDialog = value; },
    get paneDiffDialog() { return paneDiffDialog; },
    set paneDiffDialog(value: PaneDiffSnapshot | null) { paneDiffDialog = value; },
    get paneDiffListElement() { return paneDiffListElement; },
    set paneDiffListElement(value: HTMLDivElement | null) { paneDiffListElement = value; },
    get detailedDiffRunning() { return detailedDiffRunning; },
    set detailedDiffRunning(value) { detailedDiffRunning = value; },
    get detailedDiffJobId() { return detailedDiffJobId; },
    set detailedDiffJobId(value: string | null) { detailedDiffJobId = value; },
    get detailedDiffCancelRequested() { return detailedDiffCancelRequested; },
    set detailedDiffCancelRequested(value) { detailedDiffCancelRequested = value; },
  };
}
