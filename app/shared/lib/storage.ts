import type { z } from "zod";
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export class SafeStorage {
  constructor(
    private readonly storage: StoragePort,
    private readonly report: (
      message: string,
      error: unknown,
    ) => void = console.warn,
  ) {}
  read(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch (error) {
      this.report("Could not read saved preferences", error);
      return null;
    }
  }
  write(key: string, value: string): boolean {
    try {
      this.storage.setItem(key, value);
      return true;
    } catch (error) {
      this.report("Could not save preferences", error);
      return false;
    }
  }
  remove(key: string): void {
    try {
      this.storage.removeItem(key);
    } catch (error) {
      this.report("Could not remove saved preferences", error);
    }
  }
  parse<T>(key: string, schema: z.ZodType<T>, fallback: () => NoInfer<T>): T {
    const raw = this.read(key);
    if (raw === null) return fallback();
    try {
      const value: unknown = JSON.parse(raw);
      return schema.parse(value);
    } catch (error) {
      this.report("Ignored invalid saved data at " + key, error);
      return fallback();
    }
  }
  save(key: string, value: unknown): boolean {
    return this.write(key, JSON.stringify(value));
  }
}
