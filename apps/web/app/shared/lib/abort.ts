/**
 * Combine abort signals, as `AbortSignal.any` does.
 *
 * Safari only gained `AbortSignal.any` in 17.4. Calling it directly made every
 * API request fail on iOS 16, so nothing could load there (issue #10).
 *
 * @param signals The signals to follow.
 * @returns A signal that aborts as soon as any of `signals` does, with that
 *     signal's reason. If several have already aborted, the first one's reason.
 */
export function anySignal(signals: AbortSignal[]): AbortSignal {
  if ("any" in AbortSignal) return AbortSignal.any(signals);
  const combined = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      combined.abort(signal.reason);
      break;
    }
    // `signal: combined.signal` removes the other signals' listeners on abort.
    signal.addEventListener("abort", () => { combined.abort(signal.reason); }, { once: true, signal: combined.signal });
  }
  return combined.signal;
}
