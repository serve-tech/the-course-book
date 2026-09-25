import { ClerkProvider } from "@clerk/react-router";
import { rootAuthLoader } from "@clerk/react-router/server";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";
import { clerkEnv } from "@coursebook/api/services/env";
import legacyStylesheet from "./shared/styles/legacy.css?url";

export { middleware } from "./middleware";

/** Clerk needs the auth state in the root loader data to hydrate the provider. */
export function loader(args: Route.LoaderArgs) {
  const { CLERK_PUBLISHABLE_KEY: publishableKey, CLERK_SECRET_KEY: secretKey } =
    clerkEnv();
  return rootAuthLoader(args, { publishableKey, secretKey });
}

export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: legacyStylesheet },
  { rel: "icon", type: "image/png", href: "/favicon.png" },
  { rel: "apple-touch-icon", href: "/icon-180.png" },
  { rel: "manifest", href: "/manifest.webmanifest" },
];

export const meta: Route.MetaFunction = () => [
  { title: "coursebook.golf" },
  { name: "theme-color", content: "#0b2117" },
  { name: "apple-mobile-web-app-title", content: "Course Book" },
];

/** Document shell shared by every route, including error responses. */
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width,initial-scale=1,viewport-fit=cover"
        />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <ClerkProvider loaderData={loaderData}>
      <Outlet />
    </ClerkProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let heading = "Something went wrong";
  let detail = "Please try again.";
  if (isRouteErrorResponse(error)) {
    heading = error.status === 404 ? "Page not found" : "Error " + String(error.status);
    detail = error.statusText || detail;
  } else if (import.meta.env.DEV && error instanceof Error) {
    detail = error.message;
  }
  return (
    <main className="page active">
      <h1>{heading}</h1>
      <p>{detail}</p>
    </main>
  );
}
