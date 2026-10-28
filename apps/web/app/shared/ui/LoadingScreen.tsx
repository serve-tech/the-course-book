import { cx } from "../lib/cx";
import { BrandMark } from "./Brand";
import styles from "./loading-screen.module.css";

/**
 * The first-load screen (the root route's HydrateFallback): the brand mark,
 * breathing slowly in the middle of the site background, while the first
 * page's data loads. It is prerendered into `index.html`, so it shows and
 * animates before the app's JavaScript runs; screen readers hear its status.
 */
export function LoadingScreen() {
  return (
    <div className={cx("app", styles.screen)} role="status">
      <span className={styles.mark}>
        <BrandMark />
      </span>
      <span className={styles.label}>Loading The Course Book</span>
    </div>
  );
}
