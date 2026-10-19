/** Build-time settings inlined by Vite (see vite.config.ts). */
interface ImportMetaEnv {
  /** API origin, e.g. https://api.coursebook.golf. */
  readonly VITE_API_URL: string;
  /** Clerk publishable key (public by design). */
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  readonly VITE_APP_RELEASE: string;
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
