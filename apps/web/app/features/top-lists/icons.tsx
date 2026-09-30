/** Line icons for course actions and marks; they inherit the text color. */

const common = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** A tick: played. */
export function CheckIcon() {
  return (
    <svg {...common}>
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  );
}

/** A plus: log a round. */
export function LogIcon() {
  return (
    <svg {...common}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** A bookmark: Want to play. Filled when the course is on the list. */
export function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg {...common} fill={filled ? "currentColor" : "none"}>
      <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" />
    </svg>
  );
}

/** A bin: delete. */
export function TrashIcon() {
  return (
    <svg {...common}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" />
    </svg>
  );
}
