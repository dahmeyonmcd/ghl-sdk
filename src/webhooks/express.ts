import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { WebhookVerifier, type WebhookVerifierOptions } from './verify.js';
import type { GhlWebhookEvent } from './types.js';

declare module 'express-serve-static-core' {
  interface Request {
    ghlWebhookEvent?: GhlWebhookEvent;
  }
}

export interface GhlWebhookMiddlewareOptions extends WebhookVerifierOptions {
  /** Called with the verified, typed event; use instead of reading `req.ghlWebhookEvent` downstream. */
  onEvent?: (event: GhlWebhookEvent, req: Request) => void | Promise<void>;
}

/**
 * Verifies `x-wh-signature` and attaches the parsed event to `req.ghlWebhookEvent`. Needs the raw
 * body — mount `express.raw({ type: 'application/json' })` first, since GHL signs the raw bytes,
 * not a re-serialized object. `express` is a peer dep; only import this entrypoint if you have it.
 *
 * @example
 * ```ts
 * app.post('/webhooks/ghl', express.raw({ type: 'application/json' }), ghlWebhookMiddleware(), (req, res) => {
 *   console.log(req.ghlWebhookEvent);
 *   res.sendStatus(200);
 * });
 * ```
 */
export function ghlWebhookMiddleware(options: GhlWebhookMiddlewareOptions = {}): RequestHandler {
  const verifier = new WebhookVerifier(options);

  return (req: Request, res: Response, next: NextFunction) => {
    const signature = req.header('x-wh-signature');
    if (!signature) {
      res.status(401).json({ message: 'Missing x-wh-signature header' });
      return;
    }

    const rawBody = req.body;
    if (!(typeof rawBody === 'string' || Buffer.isBuffer(rawBody))) {
      res.status(500).json({
        message:
          'Raw request body unavailable. Mount express.raw({ type: "application/json" }) before ghlWebhookMiddleware().',
      });
      return;
    }

    let event: GhlWebhookEvent;
    try {
      event = verifier.verify(rawBody, signature);
    } catch (error) {
      res.status(401).json({ message: error instanceof Error ? error.message : 'Invalid webhook signature' });
      return;
    }

    req.ghlWebhookEvent = event;
    Promise.resolve(options.onEvent?.(event, req))
      .then(() => next())
      .catch(next);
  };
}
