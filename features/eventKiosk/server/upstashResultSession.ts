import { Redis } from '@upstash/redis';
import type { ResultSessionRepository, StoredResultSession } from './persistentResultSession.ts';

const PREFIX = 'wanpane:event-result:v1:';

export class UpstashResultSessionRepository implements ResultSessionRepository {
  readonly #redis: Redis;

  constructor(env: Readonly<Record<string, string | undefined>> = process.env) {
    const url = env.UPSTASH_REDIS_REST_URL?.trim();
    const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
    if (!url || !token) throw new Error('RESULT_SESSION_BACKEND_UNCONFIGURED');
    this.#redis = new Redis({ url, token });
  }

  async putIfAbsent(token: string, value: StoredResultSession, ttlSeconds: number): Promise<boolean> {
    const result = await this.#redis.set(`${PREFIX}${token}`, value, { nx: true, ex: ttlSeconds });
    return result === 'OK';
  }

  async read(token: string): Promise<StoredResultSession | null> {
    return this.#redis.get<StoredResultSession>(`${PREFIX}${token}`);
  }

  async delete(token: string): Promise<void> {
    await this.#redis.del(`${PREFIX}${token}`);
  }
}
