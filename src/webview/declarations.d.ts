/**
 * Ambient module declarations for importing static raw SVG text assets via esbuild text loader.
 */
declare module '*.svg' {
  const content: string;
  export default content;
}
