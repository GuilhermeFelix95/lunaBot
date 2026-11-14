export function invokeWith<TResult>(
  invoke: (channel: string, payload: unknown) => Promise<unknown>,
  channel: string,
  payload: unknown,
  decoder: (value: unknown) => TResult,
): Promise<TResult> {
  return invoke(channel, payload).then(decoder);
}
