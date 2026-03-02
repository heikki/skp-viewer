// Augment rmdirSync to accept options, fixing type errors in electrobun's Updater.ts
// (electrobun publishes raw .ts source, so tsc type-checks it directly)
declare module 'fs' {
  function rmdirSync(path: string, options?: { recursive?: boolean }): void;
}
