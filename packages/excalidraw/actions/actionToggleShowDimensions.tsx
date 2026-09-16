import { CaptureUpdateAction } from "@excalidraw/element";

import { register } from "./register";

export const actionToggleShowDimensions = register({
  name: "showDimensions",
  label: "labels.toggleDimensions",
  viewMode: true,
  trackEvent: {
    category: "canvas",
    predicate: (appState) => appState.showDimensions,
  },
  perform(elements, appState) {
    return {
      appState: {
        ...appState,
        showDimensions: !this.checked!(appState),
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  checked: (appState) => appState.showDimensions,
});
