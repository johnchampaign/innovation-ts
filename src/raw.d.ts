// Vite raw imports (works in both the browser build and vite-node).
declare module '*.tsv?raw' {
  const content: string;
  export default content;
}
