import { labelHaloColor, LABEL_HALO_WIDTH_RATIO } from "@behindthemusictree/ui";

/** Halo thickness as a CSS length in the label's own `em`, so it keeps tracking the font size the
 * layout rewrites on every zoom. Stroke is centered on the glyph edge, hence twice the visible width. */
export const LABEL_HALO_STROKE_EM = `${2 * LABEL_HALO_WIDTH_RATIO}em`;

/** Stroke color and width for an SVG <text> label painted in `textColor`; pairs with
 * `paint-order: stroke` in styles.css. */
export function svgLabelHalo(textColor: string): { stroke: string; strokeWidth: string } {
  return { stroke: labelHaloColor(textColor), strokeWidth: LABEL_HALO_STROKE_EM };
}

/** Inline style declaration giving an HTML label the same halo. */
export function htmlLabelHaloStyle(textColor: string): string {
  return `-webkit-text-stroke:${LABEL_HALO_STROKE_EM} ${labelHaloColor(textColor)};paint-order:stroke fill`;
}
