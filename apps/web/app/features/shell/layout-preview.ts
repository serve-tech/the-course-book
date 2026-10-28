/** Temporary rollout controls. Disable the preview here and deploy to force Classic. */
export const LAYOUT_PREVIEW_ENABLED = true;
export const LAYOUT_PREFERENCE_KEY = "coursebookLayoutPreview";

/** Shared availability check for the control and preference resolver. */
export function isLayoutPreviewEnabled(): boolean {
  return LAYOUT_PREVIEW_ENABLED;
}

export enum LayoutMode {
  Classic = "classic",
  CourseFirst = "course-first",
}

/** Only an explicit opt-in enables the new layout; unknown preferences fail to Classic. */
export function resolveLayout(
  value: string | null,
  previewEnabled: boolean = isLayoutPreviewEnabled(),
): LayoutMode {
  return previewEnabled && value === LayoutMode.CourseFirst
    ? LayoutMode.CourseFirst
    : LayoutMode.Classic;
}
