export const log = {
  info: (...args: unknown[]) => console.log('[INFO]', ...args),
  error: (...args: unknown[]) => console.error('[ERROR]', ...args),
};

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export function logJson(channel: string, level: LogLevel, data: Record<string, unknown> = {}): void {
  // single-line JSON; avoid circulars
  const line = {
    t: new Date().toISOString(),
    ch: channel,
    lv: level,
    ...data,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(line));
}
