import { useState } from "react";
import { useNavigation, useRevalidator } from "react-router";
import { saveLayoutPreference } from "./layout-preference";
import { isLayoutPreviewEnabled, LayoutMode } from "./layout-preview";
import styles from "./preview.module.css";

/** A reversible, per-browser opt-in. Revalidation switches navigation and Home together. */
export function LayoutPreview({ layout }: { layout: LayoutMode }) {
  const revalidator = useRevalidator();
  const navigation = useNavigation();
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  if (!isLayoutPreviewEnabled()) return null;
  const preview = layout === LayoutMode.CourseFirst;
  const busy =
    switching || revalidator.state !== "idle" || navigation.state !== "idle";

  const change = async () => {
    setError(null);
    if (
      !saveLayoutPreference(
        preview ? LayoutMode.Classic : LayoutMode.CourseFirst,
      )
    ) {
      setError(
        "Couldn't save your choice. Allow browser storage for this site, then try again.",
      );
      return;
    }
    setSwitching(true);
    try {
      await revalidator.revalidate();
    } catch (failure) {
      console.warn("Could not switch layouts", failure);
      setError("Couldn't switch layouts. Refresh the page to try again.");
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className={styles.banner} aria-label="Layout preview" role="region">
      <div className={styles.controls}>
        <div className={styles.copy}>
          <span className={styles.badge}>Preview</span>
          <span>
            {preview
              ? "You're using the new layout."
              : "A new home for your courses and ranking."}
          </span>
          <small>Saved on this browser. Switch back any time.</small>
        </div>
        <button
          type="button"
          className={styles.toggle}
          disabled={busy}
          onClick={() => {
            void change();
          }}
        >
          {busy && switching
            ? "Switching…"
            : preview
              ? "Use classic layout"
              : "Try the new layout"}
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
