import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import styles from "./page-header.module.css";

/**
 * The header at the top of a page: a small label, the page's title and a
 * subtitle, with an optional panel on the right. The label and subtitle are
 * paragraphs in an hgroup, as the HTML standard has it, because a heading names
 * a section and a subtitle does not start one.
 *
 * @param eyebrow - The small label above the title.
 * @param title - The page's title, its one h1.
 * @param lede - The subtitle.
 * @param titleId - An id for the title, for `aria-labelledby`.
 * @param aside - A panel beside the title; it moves under the title on phones.
 * @param children - Anything else under the subtitle, such as a button.
 */
export function PageHeader({
  eyebrow,
  title,
  lede,
  titleId,
  aside,
  children,
}: {
  eyebrow: string;
  title: string;
  lede?: ReactNode;
  titleId?: string;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={cx(styles.head, aside ? styles.withAside : false)}>
      <div>
        <hgroup className={styles.group}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 id={titleId} className={styles.title}>
            {title}
          </h1>
          {lede && <p className={styles.lede}>{lede}</p>}
        </hgroup>
        {children}
      </div>
      {aside}
    </div>
  );
}
