import { getToken } from "@clerk/react-router";
import type { Route } from "./+types/course";
import { CoursePageView } from "../features/courses/CoursePageView";
import { api, unwrap } from "../lib/api";
import { fromCoursePage } from "../lib/api/mappers";
import { RouteError } from "../shared/ui/RouteError";
import { useShell } from "../shared/ui/shell";

/**
 * A course's page (`/courses/<id>`): its photo, published ranks, the
 * member's standing with it and their friends' (decision 2026-11-13).
 * Signed out, there is nothing to show yet; the API needs a member.
 */
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  if (!(await getToken())) return null;
  const page = unwrap(await api.GET("/v1/courses/{courseId}", { params: { path: { courseId: params.courseId } } }));
  return fromCoursePage(page);
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? loaderData.course.name + " · The Course Book" : "The Course Book" }];
}

export default function Course({ loaderData }: Route.ComponentProps) {
  const shell = useShell();
  if (!loaderData) return null;
  return <CoursePageView page={loaderData} canCurate={shell.canCurate} notify={shell.notify} openAuth={shell.openAuth} />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
