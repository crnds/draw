import {
  BOUND_TEXT_PADDING,
  containsThaiComboMarks,
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_FAMILY,
  getFontString,
  isTestEnv,
  normalizeEOL,
  THAI_COMBO_MARKS_METRICS,
} from "@excalidraw/common";

import type { FontString, ExcalidrawTextElement } from "./types";

export const measureText = (
  text: string,
  font: FontString,
  lineHeight: ExcalidrawTextElement["lineHeight"],
) => {
  const _text = text
    .split("\n")
    // replace empty lines with single space because leading/trailing empty
    // lines would be stripped from computation
    .map((x) => x || " ")
    .join("\n");
  const fontSize = parseFloat(font);
  const height = getTextHeight(_text, fontSize, lineHeight);
  const width = getTextWidth(_text, font);
  return { width, height };
};

const DUMMY_TEXT = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".toLocaleUpperCase();

// FIXME rename to getApproxMinContainerWidth
export const getApproxMinLineWidth = (
  font: FontString,
  lineHeight: ExcalidrawTextElement["lineHeight"],
) => {
  const maxCharWidth = getMaxCharWidth(font);
  if (maxCharWidth === 0) {
    return (
      measureText(DUMMY_TEXT.split("").join("\n"), font, lineHeight).width +
      BOUND_TEXT_PADDING * 2
    );
  }
  return maxCharWidth + BOUND_TEXT_PADDING * 2;
};

export const getMinTextElementWidth = (
  font: FontString,
  lineHeight: ExcalidrawTextElement["lineHeight"],
) => {
  return measureText("", font, lineHeight).width + BOUND_TEXT_PADDING * 2;
};

export const isMeasureTextSupported = () => {
  const width = getTextWidth(
    DUMMY_TEXT,
    getFontString({
      fontSize: DEFAULT_FONT_SIZE,
      fontFamily: DEFAULT_FONT_FAMILY,
    }),
  );
  return width > 0;
};

export const normalizeText = (text: string) => {
  return (
    normalizeEOL(text)
      // replace tabs with spaces so they render and measure correctly
      .replace(/\t/g, "        ")
  );
};

const splitIntoLines = (text: string) => {
  return normalizeText(text).split("\n");
};

/**
 * To get unitless line-height (if unknown) we can calculate it by dividing
 * height-per-line by fontSize.
 */
export const detectLineHeight = (textElement: ExcalidrawTextElement) => {
  const lineCount = splitIntoLines(textElement.text).length;
  return (textElement.height /
    lineCount /
    textElement.fontSize) as ExcalidrawTextElement["lineHeight"];
};

/**
 * We calculate the line height from the font size and the unitless line height,
 * aligning with the W3C spec.
 *
 * When `text` contains Thai combining marks that stack above the preceding
 * character (e.g. the tone mark in นี้), the effective line height is bumped
 * up to reserve enough headroom for the substituted system Thai font, since
 * none of our own fonts have Thai glyphs and their own line-height doesn't
 * account for it.
 */
export const getLineHeightInPx = (
  fontSize: ExcalidrawTextElement["fontSize"],
  lineHeight: ExcalidrawTextElement["lineHeight"],
  text?: string,
) => {
  const effectiveLineHeight =
    text && containsThaiComboMarks(text)
      ? (Math.max(
          lineHeight,
          THAI_COMBO_MARKS_METRICS.lineHeight,
        ) as ExcalidrawTextElement["lineHeight"])
      : lineHeight;

  return fontSize * effectiveLineHeight;
};

// FIXME rename to getApproxMinContainerHeight
export const getApproxMinLineHeight = (
  fontSize: ExcalidrawTextElement["fontSize"],
  lineHeight: ExcalidrawTextElement["lineHeight"],
) => {
  return getLineHeightInPx(fontSize, lineHeight) + BOUND_TEXT_PADDING * 2;
};

let textMetricsProvider: TextMetricsProvider | undefined;

/**
 * Set a custom text metrics provider.
 *
 * Useful for overriding the width calculation algorithm where canvas API is not available / desired.
 */
export const setCustomTextMetricsProvider = (provider: TextMetricsProvider) => {
  textMetricsProvider = provider;
};

export interface TextMetricsProvider {
  getLineWidth(text: string, fontString: FontString): number;
}

class CanvasTextMetricsProvider implements TextMetricsProvider {
  private canvas: HTMLCanvasElement;

  constructor() {
    this.canvas = document.createElement("canvas");
  }

  /**
   * We need to use the advance width as that's the closest thing to the browser wrapping algo, hence using it for:
   * - text wrapping
   * - wysiwyg editor (+padding)
   *
   * > The advance width is the distance between the glyph's initial pen position and the next glyph's initial pen position.
   */
  public getLineWidth(text: string, fontString: FontString): number {
    const context = this.canvas.getContext("2d")!;
    context.font = fontString;
    const metrics = context.measureText(text);
    const advanceWidth = metrics.width;

    // since in test env the canvas measureText algo
    // doesn't measure text and instead just returns number of
    // characters hence we assume that each letteris 10px
    if (isTestEnv()) {
      return advanceWidth * 10;
    }

    return advanceWidth;
  }
}

export const getLineWidth = (text: string, font: FontString) => {
  if (!textMetricsProvider) {
    textMetricsProvider = new CanvasTextMetricsProvider();
  }

  return textMetricsProvider.getLineWidth(text, font);
};

export const getTextWidth = (text: string, font: FontString) => {
  const lines = splitIntoLines(text);
  let width = 0;
  lines.forEach((line) => {
    width = Math.max(width, getLineWidth(line, font));
  });

  return width;
};

export const getTextHeight = (
  text: string,
  fontSize: number,
  lineHeight: ExcalidrawTextElement["lineHeight"],
) => {
  const lineCount = splitIntoLines(text).length;
  return getLineHeightInPx(fontSize, lineHeight, text) * lineCount;
};

export const charWidth = (() => {
  // keyed by the full character/grapheme-cluster string rather than its first
  // code unit, since a Thai base char + combining mark (e.g. "ี้") is a
  // multi-codepoint unit that must not collide in the cache with other
  // grapheme clusters sharing the same leading codepoint (e.g. "ี๊")
  const cachedCharWidth: { [key: FontString]: Map<string, number> } = {};

  const calculate = (char: string, font: FontString) => {
    if (!cachedCharWidth[font]) {
      cachedCharWidth[font] = new Map();
    }
    const cache = cachedCharWidth[font];
    let width = cache.get(char);
    if (width === undefined) {
      width = getLineWidth(char, font);
      cache.set(char, width);
    }

    return width;
  };

  const getCache = (font: FontString) => {
    return cachedCharWidth[font];
  };

  const clearCache = (font: FontString) => {
    cachedCharWidth[font] = new Map();
  };

  return {
    calculate,
    getCache,
    clearCache,
  };
})();

export const getMinCharWidth = (font: FontString) => {
  const cache = charWidth.getCache(font);
  if (!cache) {
    return 0;
  }
  const cacheWithOutEmpty = Array.from(cache.values()).filter(
    (val) => val !== undefined,
  );

  return Math.min(...cacheWithOutEmpty);
};

export const getMaxCharWidth = (font: FontString) => {
  const cache = charWidth.getCache(font);
  if (!cache) {
    return 0;
  }
  const cacheWithOutEmpty = Array.from(cache.values()).filter(
    (val) => val !== undefined,
  );
  return Math.max(...cacheWithOutEmpty);
};
