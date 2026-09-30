import { redirect } from "react-router";

/** The Top 100 page moved to Courses; old links and bookmarks keep working. */
export function clientLoader() {
  return redirect("/courses");
}

export default function Top100Redirect() {
  return null;
}
