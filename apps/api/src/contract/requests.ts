import { cloudLocation } from "@coursebook/domain/catalog/course";
import type { CourseInput } from "../services/catalog";
import type { AddCourseRequest } from "./schemas";

/**
 * Pure translations from contract request bodies to service inputs.
 */

/**
 * The service's course input for an add-course request. Missing optional
 * details become empty strings (the service's convention); a missing
 * location is composed from city, state and country; `manual` courses are
 * stored as shared custom courses.
 */
export function toCourseInput(body: AddCourseRequest): Exclude<CourseInput, { courseId: string }> {
  const { course } = body;
  const city = course.city ?? "";
  const state = course.state ?? "";
  return {
    name: course.name,
    location: course.location || cloudLocation({ city, state, country: course.country }),
    city,
    state,
    country: course.country,
    logo: course.logoUrl ?? "",
    website: course.websiteUrl ?? "",
    isCustom: body.source === "manual",
  };
}
