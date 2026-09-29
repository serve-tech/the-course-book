import type { ReactNode } from "react";
export function Modal({
  id,
  title,
  eyebrow,
  children,
  onClose,
  className = "",
  dismissBackdrop = false,
  plainHeader = false,
}: {
  id: string;
  title: string;
  eyebrow: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  dismissBackdrop?: boolean;
  plainHeader?: boolean;
}) {
  return (
    <div
      className="backdrop open"
      id={id}
      onClick={(event) => {
        if (dismissBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={"modal " + className}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id + "Title"}
      >
        {plainHeader ? (
          <h3 id={id + "Title"}>{title}</h3>
        ) : (
          <div className="modalhead">
            <div>
              <div className="eyebrow">{eyebrow}</div>
              <h3 id={id + "Title"}>{title}</h3>
            </div>
            <button className="modalclose" aria-label="Close" onClick={onClose}>
              ×
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
