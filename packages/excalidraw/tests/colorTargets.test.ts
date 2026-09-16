import {
  COLOR_PALETTE,
  DEFAULT_ELEMENT_BACKGROUND_PICKS,
  DEFAULT_ELEMENT_STROKE_PICKS,
  DEFAULT_STICKY_NOTE_BG,
  STICKY_NOTE_BACKGROUND_PICKS,
} from "@excalidraw/common";

import {
  getColorTargetAppStateUpdates,
  resolveColorTarget,
} from "../actions/colorTargets";
import { getDefaultAppState } from "../appState";

import { API } from "./helpers/api";

import type { AppState } from "../types";

const appState = (overrides: Partial<AppState> = {}): AppState =>
  ({
    ...getDefaultAppState(),
    selectedElementIds: {},
    editingTextElement: null,
    ...overrides,
  } as AppState);

describe("resolveColorTarget", () => {
  const note = API.createElement({ type: "stickynote", id: "note" });
  const label = API.createElement({
    type: "text",
    id: "label",
    containerId: "note",
  });
  const rectangle = API.createElement({ type: "rectangle", id: "rectangle" });
  // a stroke/background-capable element that is neither sticky nor a shape
  // (rectangle/diamond/ellipse), to exercise the plain "regular" domain
  const line = API.createElement({ type: "line", id: "line" });
  const elements = [note, label, rectangle, line];

  it("follows the active tool when nothing is targeted", () => {
    const regular = resolveColorTarget(appState(), elements, "strokeColor");
    expect(regular.kind).toBe("regular");
    expect(regular.appStateKeys).toEqual(["currentItemStrokeColor"]);
    expect(regular.topPicks).toBe(DEFAULT_ELEMENT_STROKE_PICKS);
    expect(regular.excludedColors).toBeUndefined();

    const sticky = resolveColorTarget(
      appState({
        activeTool: {
          ...getDefaultAppState().activeTool,
          type: "stickynote" as const,
          customType: null,
        },
      }),
      elements,
      "backgroundColor",
    );
    expect(sticky.kind).toBe("sticky");
    expect(sticky.appStateKeys).toEqual([
      "currentItemStickynoteBackgroundColor",
    ]);
    expect(sticky.topPicks).toBe(STICKY_NOTE_BACKGROUND_PICKS);
    expect(sticky.customizableTopPicks).toBe("stickyNoteBackground");
    expect(sticky.excludedColors).toContain(COLOR_PALETTE.transparent);

    const shape = resolveColorTarget(
      appState({
        activeTool: {
          ...getDefaultAppState().activeTool,
          type: "rectangle" as const,
          customType: null,
        },
      }),
      elements,
      "backgroundColor",
    );
    expect(shape.kind).toBe("shape");
    expect(shape.appStateKeys).toEqual(["currentItemShapeBackgroundColor"]);
    // shape shares the regular palette/top-picks/customizable slot — it only
    // has its own current-item defaults, not its own picker cosmetics
    expect(shape.topPicks).toBe(DEFAULT_ELEMENT_BACKGROUND_PICKS);
    expect(shape.customizableTopPicks).toBe("elementBackground");
    expect(shape.excludedColors).toBeUndefined();
  });

  it("classifies a note (and its label) as the sticky domain", () => {
    const target = resolveColorTarget(
      appState({ selectedElementIds: { note: true } }),
      elements,
      "strokeColor",
    );
    expect(target.kind).toBe("sticky");
    expect(target.appStateKeys).toEqual(["currentItemStickynoteStrokeColor"]);
  });

  it("classifies a rectangle/diamond/ellipse as the shape domain", () => {
    const target = resolveColorTarget(
      appState({ selectedElementIds: { rectangle: true } }),
      elements,
      "strokeColor",
    );
    expect(target.kind).toBe("shape");
    expect(target.appStateKeys).toEqual(["currentItemShapeStrokeColor"]);
  });

  it("writes every domain present for a mixed selection but shows the regular picker", () => {
    const stickyAndRegular = resolveColorTarget(
      appState({ selectedElementIds: { note: true, line: true } }),
      elements,
      "strokeColor",
    );
    expect(stickyAndRegular.kind).toBe("mixed");
    expect(stickyAndRegular.appStateKeys).toEqual([
      "currentItemStrokeColor",
      "currentItemStickynoteStrokeColor",
    ]);
    expect(stickyAndRegular.topPicks).toBe(DEFAULT_ELEMENT_STROKE_PICKS);
    expect(stickyAndRegular.excludedColors).toBeUndefined();

    const stickyAndShape = resolveColorTarget(
      appState({ selectedElementIds: { note: true, rectangle: true } }),
      elements,
      "strokeColor",
    );
    expect(stickyAndShape.kind).toBe("mixed");
    expect(stickyAndShape.appStateKeys).toEqual([
      "currentItemStickynoteStrokeColor",
      "currentItemShapeStrokeColor",
    ]);

    const allThree = resolveColorTarget(
      appState({
        selectedElementIds: { note: true, rectangle: true, line: true },
      }),
      elements,
      "strokeColor",
    );
    expect(allThree.kind).toBe("mixed");
    expect(allThree.appStateKeys).toEqual([
      "currentItemStrokeColor",
      "currentItemStickynoteStrokeColor",
      "currentItemShapeStrokeColor",
    ]);
  });

  it("treats the sticky label being edited as a sticky target even with no selection", () => {
    // `handleTextWysiwyg` deselects while editing; `changeProperty` still
    // targets the edited text explicitly
    const target = resolveColorTarget(
      appState({ editingTextElement: label }),
      elements,
      "strokeColor",
    );
    expect(target.kind).toBe("sticky");
  });

  it("normalizes transparent for the sticky defaults only", () => {
    const stickyStroke = resolveColorTarget(
      appState({ selectedElementIds: { note: true } }),
      elements,
      "strokeColor",
    );
    expect(
      getColorTargetAppStateUpdates(stickyStroke, COLOR_PALETTE.transparent),
    ).toEqual({ currentItemStickynoteStrokeColor: COLOR_PALETTE.black });

    const stickyBackground = resolveColorTarget(
      appState({ selectedElementIds: { note: true } }),
      elements,
      "backgroundColor",
    );
    expect(
      getColorTargetAppStateUpdates(
        stickyBackground,
        COLOR_PALETTE.transparent,
      ),
    ).toEqual({ currentItemStickynoteBackgroundColor: DEFAULT_STICKY_NOTE_BG });

    const regular = resolveColorTarget(
      appState({ selectedElementIds: { line: true } }),
      elements,
      "backgroundColor",
    );
    expect(
      getColorTargetAppStateUpdates(regular, COLOR_PALETTE.transparent),
    ).toEqual({ currentItemBackgroundColor: COLOR_PALETTE.transparent });

    const shape = resolveColorTarget(
      appState({ selectedElementIds: { rectangle: true } }),
      elements,
      "backgroundColor",
    );
    expect(
      getColorTargetAppStateUpdates(shape, COLOR_PALETTE.transparent),
    ).toEqual({ currentItemShapeBackgroundColor: COLOR_PALETTE.transparent });
  });
});
