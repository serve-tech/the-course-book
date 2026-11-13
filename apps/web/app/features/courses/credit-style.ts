/** How a photo's credit is shown. */
export enum CreditStyle {
  /** No credit: only where a larger view of the same photo shows it. */
  None = "none",
  /** The photographer's name in a small chip on the photo. */
  Chip = "chip",
  /** The chip, linked to the photo's source page. Never inside another link. */
  Link = "link",
}
