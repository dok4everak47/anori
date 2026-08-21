const TTL_MS = 60_000;

export type ConfirmationRecord<T> = {
  token: string;
  expiresAt: number;
  details: T;
};

export class ConfirmationManager<T> {
  private pending = new Map<string, { key: string; expiresAt: number; details: T }>();

  request(key: string, details: T): ConfirmationRecord<T> {
    const token = `confirm_${randomHex(16)}`;
    const expiresAt = Date.now() + TTL_MS;
    this.pending.set(token, { key, expiresAt, details });
    setTimeout(() => this.pending.delete(token), TTL_MS + 1000);
    return { token, expiresAt, details };
  }

  consume(token: string, key: string): T | null {
    const record = this.pending.get(token);
    if (!record) return null;
    this.pending.delete(token);
    if (record.expiresAt < Date.now()) return null;
    if (record.key !== key) return null;
    return record.details;
  }
}

function randomHex(bytes: number): string {
  const values = new Uint8Array(bytes);
  globalThis.crypto?.getRandomValues(values);
  let out = "";
  for (const v of values) out += v.toString(16).padStart(2, "0");
  return out;
}
