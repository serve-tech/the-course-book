import { isRouteErrorResponse, useRevalidator } from "react-router";
import { ApiError } from "../../lib/api/client";

/** A readable message for whatever a route's loader threw. */
function describe(error: unknown): { title: string; detail: string } {
  if (isRouteErrorResponse(error)) {
    const data: unknown = error.data;
    const detail =
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error
        : error.statusText || "Please try again.";
    return { title: error.status === 404 ? "Not found" : "Something went wrong", detail };
  }
  if (error instanceof ApiError) return { title: "Something went wrong", detail: error.message };
  if (error instanceof DOMException && error.name === "TimeoutError")
    return { title: "The server is not answering", detail: "It may still be waking up. Please try again." };
  if (error instanceof TypeError)
    return { title: "Could not reach the server", detail: "Check your connection and try again." };
  return { title: "Something went wrong", detail: "Please try again." };
}

/**
 * Error panel for page routes. It renders inside the layout, so the header
 * and navigation stay usable, and Retry reloads the page's data.
 */
export function RouteError({ error }: { error: unknown }) {
  const revalidator = useRevalidator();
  const { title, detail } = describe(error);
  return (
    <section className="page active">
      <div className="empty" role="alert">
        <h3>{title}</h3>
        <p>{detail}</p>
        <button
          className="primary"
          disabled={revalidator.state !== "idle"}
          onClick={() => {
            void revalidator.revalidate();
          }}
        >
          {revalidator.state === "idle" ? "Retry" : "Retrying…"}
        </button>
      </div>
    </section>
  );
}
