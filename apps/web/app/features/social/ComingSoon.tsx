import type { ReactNode } from "react";
import styles from "./social.module.css";

/**
 * A section that is designed but not built yet. It says plainly what is
 * coming instead of showing placeholder data: the people seeing it are real
 * members, so nothing here may look like their records.
 *
 * @param title - What the section will be, e.g. "Want to play".
 * @param children - One or two sentences on what it will do.
 */
export function ComingSoon({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.soon}>
      <span className={styles.soonIcon} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 21V3" />
          <path d="M6 4h11l-2.5 4L17 12H6" />
        </svg>
      </span>
      <div>
        <div className={styles.soonTitle}>
          {title}
          <span className={styles.soonPill}>Coming soon</span>
        </div>
        <p className={styles.soonText}>{children}</p>
      </div>
    </div>
  );
}
