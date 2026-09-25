/** Build-time settings inlined by Vite (see vite.config.ts). */
interface ImportMetaEnv {
  /** API origin, e.g. https://api.coursebook.golf. */
  readonly VITE_API_URL: string;
  /** Clerk publishable key (public by design). */
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
