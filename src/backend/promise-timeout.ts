/** Rejects with `message` when `promise` has not settled within `milliseconds`. The original promise keeps running. */
export function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
    timer.unref?.();
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}
