import { MAX_CORRELATION_REGISTRY } from './constants.js';

/**
 * Tracks correlation_ids from load until cleanup. Bounded FIFO eviction when full.
 */
export class CorrelationRegistry {
  private readonly ids = new Map<string, true>();

  constructor(private readonly maxSize: number = MAX_CORRELATION_REGISTRY) {
    if (maxSize < 1) {
      throw new Error('CorrelationRegistry maxSize must be at least 1');
    }
  }

  get size(): number {
    return this.ids.size;
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  add(id: string): void {
    if (this.ids.has(id)) return;
    while (this.ids.size >= this.maxSize) {
      const oldest = this.ids.keys().next().value;
      if (oldest === undefined) break;
      this.ids.delete(oldest);
    }
    this.ids.set(id, true);
  }

  delete(id: string): boolean {
    return this.ids.delete(id);
  }
}
