/**
 * Run tasks one at a time, in the order they arrive. A task that fails
 * doesn't stop the ones after it; its caller gets the failure.
 *
 * Photo uploads use it to keep memory bounded on the API's 512 MB: measured
 * in the real image, one 22 MB, 48-megapixel progressive JPEG peaked at
 * 325 MB, and two received at once at 464 MB (decision 2026-11-15).
 *
 * Returns:
 *     A function that runs a task after every task given to it before.
 *
 * Example:
 *     >>> const queue = oneAtATime();
 *     >>> await Promise.all([queue(slow), queue(fast)]); // fast starts after slow ends
 */
export function oneAtATime(): <T>(task: () => Promise<T>) => Promise<T> {
  let last: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = last.then(task);
    last = run.catch(() => undefined);
    return run;
  };
}
