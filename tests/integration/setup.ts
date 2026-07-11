import { afterAll, afterEach, beforeAll } from 'vitest';
import { setupServer } from 'msw/node';
import type { RequestHandler } from 'msw';

/** Shared MSW server for integration tests — import `server` and call `server.use(...)` per test. */
export const server = setupServer();

export function registerMswLifecycle() {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
}

export type { RequestHandler };
