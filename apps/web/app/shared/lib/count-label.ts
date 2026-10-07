/**
 * A label with its count in parentheses, so the number reads apart from
 * the words on filter buttons: "Played (2)", not "Played 2".
 *
 * Example:
 *     countLabel("Not played", 98) // "Not played (98)"
 */
export function countLabel(label: string, count: number): string {
  return label + " (" + String(count) + ")";
}
