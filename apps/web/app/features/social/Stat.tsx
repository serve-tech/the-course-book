import { countLabel } from "./format";
import profileStyles from "./profile.module.css";

/**
 * One number in a profile's or a ranking's header, over a label that agrees
 * with it: "1 Country", "4 States".
 *
 * @param value - The number.
 * @param label - The label for exactly one: "Course". Also the label for
 *   every count when `plural` is omitted ("In 2026").
 * @param plural - The label for any other count: "Courses".
 */
export function Stat({ value, label, plural }: { value: number; label: string; plural?: string }) {
  return (
    <div className={profileStyles.stat}>
      <dd className={profileStyles.statValue}>{value.toLocaleString()}</dd>
      <dt className={profileStyles.statLabel}>{plural === undefined ? label : countLabel(value, label, plural)}</dt>
    </div>
  );
}
