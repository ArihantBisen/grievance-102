// SBOSS Grievance & Request System — design tokens (build spec Part C).
// Import the CSS directly: `import "@sboss/design-tokens/src/tokens.css"`.
// This module also re-exports the raw color values for JS-side use (e.g. inline
// styles, chart colors) so the two never drift out of sync.

export const colors = {
  ink: "#1a1d24",
  sub: "#5a6270",
  paper: "#ffffff",
  bg: "#f4f5f7",
  line: "#e2e5ea",
  lineSoft: "#eceef2",
  accent: "#0b5e4a",
  accentSoft: "#e6f2ee",
  accentLine: "#bfe0d5",
  blue: "#1f5c8f",
  blueSoft: "#e8f0f8",
  blueLine: "#c5daed",
  amber: "#9a6a12",
  amberSoft: "#fbf1dc",
  amberLine: "#ecd9a8",
  red: "#9a2d2d",
  redSoft: "#fbeaea",
  redLine: "#eecaca",
  purple: "#5b3b8c",
  purpleSoft: "#efe9f8",
  purpleLine: "#dccdf0",
} as const;

export const fontUi =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
export const fontMono = '"SF Mono", ui-monospace, "Cascadia Code", Consolas, monospace';

// TAT/SLA indicator color — green/amber/red per Part C's convention.
export function slaColor(status: "onTrack" | "approaching" | "breached"): string {
  if (status === "breached") return colors.red;
  if (status === "approaching") return colors.amber;
  return colors.accent;
}
