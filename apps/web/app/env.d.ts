/** Build-time settings inlined by Vite (see vite.config.ts). */
interface ImportMetaEnv {
  /** API origin, e.g. https://api.coursebook.golf. */
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
