import type { SessionData, SessionStorage } from './types.js';

/** Default in-process session storage. Fine for dev and single-instance servers; implement SessionStorage against Redis/Postgres/etc if you scale horizontally. */
export class InMemorySessionStorage implements SessionStorage {
  private readonly sessions = new Map<string, SessionData>();

  async get(companyId: string): Promise<SessionData | undefined> {
    return this.sessions.get(companyId);
  }

  async set(companyId: string, data: SessionData): Promise<void> {
    this.sessions.set(companyId, data);
  }

  async delete(companyId: string): Promise<void> {
    this.sessions.delete(companyId);
  }
}
