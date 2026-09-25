import type { Config } from "@react-router/dev/config";

export default {
  // A static single-page app: every route loads data in the browser from the
  // API. The root still renders once at build time into index.html.
  ssr: false,
} satisfies Config;
