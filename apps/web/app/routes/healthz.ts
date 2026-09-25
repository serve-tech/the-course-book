import { checkDatabase } from "../server/backend.server";
import { db } from "../server/db.server";

/**
 * Health probe for Render. Reports 503 when the database round-trip fails so
 * a broken connection string never passes a deploy.
 */
export async function loader(): Promise<Response> {
  try {
    await checkDatabase(db);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Health check failed", error);
    return Response.json({ ok: false }, { status: 503 });
  }
}
