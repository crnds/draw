import {
  COLOR_PALETTE,
  DEFAULT_ELEMENT_BACKGROUND_COLOR_PALETTE,
  DEFAULT_ELEMENT_BACKGROUND_PICKS,
  DEFAULT_ELEMENT_STROKE_COLOR_PALETTE,
  DEFAULT_ELEMENT_STROKE_PICKS,
  STICKY_NOTE_BACKGROUND_PICKS,
  STICKY_NOTE_STROKE_PICKS,
  arrayToMap,
} from "@excalidraw/common";

import {
  getColorTargetElement,
  hasBackground,
  hasStrokeColor,
  isStickyNoteBoundText,
  isStickyNoteElement,
  isTextElement,
  normalizeStickyNoteBackgroundColor,
  normalizeStickyNoteStrokeColor,
} from "@excalidraw/element";

import type { ColorPaletteCustom, ColorTuple } from "@excalidraw/common";
import type { ElementsMap, ExcalidrawElement } from "@excalidraw/element/types";

import { getSelectedElements } from "../scene";

import type { AppState } from "../types";

export type ColorProperty = "strokeColor" | "backgroundColor";

/**
 * Sticky notes are their own color domain: own defaults, own top picks, no
 * transparent. Rectangle/diamond/ellipse ("shape") are a second domain with
 * their own defaults, sharing the regular palette/top-picks. A pick targets
 * one domain, or several at once ("mixed" selections write every domain
 * present and use the regular picker).
 */
export type ColorTargetKind = "regular" | "sticky" | "shape" | "mixed";

export type ColorDefaultKey =
  | "currentItemStrokeColor"
  | "currentItemBackgroundColor"
  | "currentItemStickynoteStrokeColor"
  | "currentItemStickynoteBackgroundColor"
  | "currentItemShapeStrokeColor"
  | "currentItemShapeBackgroundColor";

export type ColorTargetAppState = Pick<
  AppState,
  "selectedElementIds" | "editingTextElement" | "activeTool" | ColorDefaultKey
>;

export type ColorTarget = {
  kind: ColorTargetKind;
  property: ColorProperty;
  /** the current-item defaults a pick is written to (normalized per domain) */
  appStateKeys: readonly ColorDefaultKey[];
  /** the default shown when no element is targeted */
  currentValue: string;
  palette: ColorPaletteCustom;
  topPicks: ColorTuple;
  customizableTopPicks: keyof AppState["colorTopPicks"];
  excludedColors: readonly string[] | undefined;
};

const DEFAULT_KEYS: Record<
  ColorProperty,
  Record<"regular" | "sticky" | "shape", ColorDefaultKey>
> = {
  strokeColor: {
    regular: "currentItemStrokeColor",
    sticky: "currentItemStickynoteStrokeColor",
    shape: "currentItemShapeStrokeColor",
  },
  backgroundColor: {
    regular: "currentItemBackgroundColor",
    sticky: "currentItemStickynoteBackgroundColor",
    shape: "currentItemShapeBackgroundColor",
  },
};

// transparent is hidden rather than removed from the palette so the remaining
// colors keep their usual hotkeys (same mechanism as the bucket fill picker);
// a module constant so the memoized picker's identity comparison holds
const STICKY_NOTE_EXCLUDED_COLORS: readonly string[] = [
  COLOR_PALETTE.transparent,
];

const isStickyNoteColorTarget = (
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
) =>
  isStickyNoteElement(element) ||
  (isTextElement(element) && isStickyNoteBoundText(element, elementsMap));

const SHAPE_ELEMENT_TYPES: ReadonlySet<ExcalidrawElement["type"]> = new Set([
  "rectangle",
  "diamond",
  "ellipse",
]);

const isShapeColorTarget = (element: ExcalidrawElement) =>
  SHAPE_ELEMENT_TYPES.has(element.type);

const isShapeToolType = (toolType: string) =>
  SHAPE_ELEMENT_TYPES.has(toolType as ExcalidrawElement["type"]);

/**
 * Who a stroke/background pick targets. Resolve it from the state an action
 * runs against, at execution time — never capture it in a render closure:
 * the memoized picker keeps a stale `onChange`, and the always-visible top
 * picks fire it without a re-render.
 *
 * Targets are the selected color-capable elements (for stroke incl. bound
 * labels, since a note's visible text is its label) plus the text being
 * edited (`handleTextWysiwyg` deselects while editing) — or, for a
 * background pick on a note's label, the note (see `getColorTargetElement`).
 * With no target, the active tool decides the domain.
 */
export const resolveColorTarget = (
  appState: ColorTargetAppState,
  elements: readonly ExcalidrawElement[],
  property: ColorProperty,
): ColorTarget => {
  const elementsMap = arrayToMap(elements);
  const supports = (element: ExcalidrawElement) =>
    property === "strokeColor"
      ? hasStrokeColor(element.type)
      : hasBackground(element.type);

  const targets: ExcalidrawElement[] = getSelectedElements(elements, appState, {
    includeBoundTextElement: property === "strokeColor",
  }).filter(supports);
  const editingText =
    appState.editingTextElement &&
    elementsMap.get(appState.editingTextElement.id);
  const editing =
    editingText && getColorTargetElement(editingText, property, elementsMap);
  if (
    editing &&
    !editing.isDeleted &&
    supports(editing) &&
    !targets.some((element) => element.id === editing.id)
  ) {
    targets.push(editing);
  }

  let kind: ColorTargetKind;
  let presentKinds: ReadonlySet<"regular" | "sticky" | "shape">;

  if (!targets.length) {
    const toolKind =
      appState.activeTool.type === "stickynote"
        ? "sticky"
        : isShapeToolType(appState.activeTool.type)
        ? "shape"
        : "regular";
    kind = toolKind;
    presentKinds = new Set([toolKind]);
  } else {
    const stickyCount = targets.filter((element) =>
      isStickyNoteColorTarget(element, elementsMap),
    ).length;
    const shapeCount = targets.filter(isShapeColorTarget).length;
    const regularCount = targets.length - stickyCount - shapeCount;

    const present = new Set<"regular" | "sticky" | "shape">();
    if (regularCount > 0) {
      present.add("regular");
    }
    if (stickyCount > 0) {
      present.add("sticky");
    }
    if (shapeCount > 0) {
      present.add("shape");
    }
    presentKinds = present;
    kind = present.size === 1 ? [...present][0] : "mixed";
  }

  const keys = DEFAULT_KEYS[property];
  const isStroke = property === "strokeColor";

  return {
    kind,
    property,
    appStateKeys: [...presentKinds].map((presentKind) => keys[presentKind]),
    currentValue: appState[kind === "mixed" ? keys.regular : keys[kind]],
    palette: isStroke
      ? DEFAULT_ELEMENT_STROKE_COLOR_PALETTE
      : DEFAULT_ELEMENT_BACKGROUND_COLOR_PALETTE,
    topPicks:
      kind === "sticky"
        ? isStroke
          ? STICKY_NOTE_STROKE_PICKS
          : STICKY_NOTE_BACKGROUND_PICKS
        : isStroke
        ? DEFAULT_ELEMENT_STROKE_PICKS
        : DEFAULT_ELEMENT_BACKGROUND_PICKS,
    customizableTopPicks:
      kind === "sticky"
        ? isStroke
          ? "stickyNoteStroke"
          : "stickyNoteBackground"
        : isStroke
        ? "elementStroke"
        : "elementBackground",
    excludedColors: kind === "sticky" ? STICKY_NOTE_EXCLUDED_COLORS : undefined,
  };
};

/** the current-item default updates for a picked color */
export const getColorTargetAppStateUpdates = (
  target: ColorTarget,
  color: string,
): Partial<AppState> => {
  const updates: Partial<AppState> = {};
  for (const key of target.appStateKeys) {
    updates[key] =
      key === "currentItemStickynoteStrokeColor"
        ? normalizeStickyNoteStrokeColor(color)
        : key === "currentItemStickynoteBackgroundColor"
        ? normalizeStickyNoteBackgroundColor(color)
        : color;
  }
  return updates;
};
