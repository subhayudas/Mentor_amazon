import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { APIRequestContext, APIResponse, Frame, Page } from '@playwright/test';
import { calHeaders } from '../../tests/helpers/cal';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const EMBED_JS = path.join(ROOT, 'node_modules', '@calcom', 'embed-core', 'dist', 'embed', 'embed.js');
const STUB_HTML = path.join(ROOT, 'e2e', 'stubs', 'cal-embed.html');

export interface CalStub {
  /** URLs the embed iframe was opened with, in order. */
  readonly openedUrls: string[];
  /** The embed iframe (waits until the stub page has loaded in it). */
  frame(): Promise<Frame>;
  /** Post `CAL:<ns>:<type>` from the iframe to the app, as Cal.com's booking page does. */
  post(type: string, data: Record<string, unknown>): Promise<void>;
}

/**
 * Serve Cal.com's embed script from node_modules and answer every other https://app.cal.com
 * page with e2e/stubs/cal-embed.html, so no request reaches Cal.com and specs can emit
 * booking events (bookingSuccessfulV2, rescheduleBookingSuccessfulV2, …) deterministically.
 */
export async function calStub(page: Page): Promise<CalStub> {
  const embedJs = readFileSync(EMBED_JS);
  const stubHtml = readFileSync(STUB_HTML);
  const openedUrls: string[] = [];
  await page.route('https://app.cal.com/embed/embed.js', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: embedJs }),
  );
  await page.route(/^https:\/\/(app\.)?cal\.com\/(?!embed\/embed\.js).*/, (route) => {
    if (route.request().resourceType() === 'document') openedUrls.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: stubHtml });
  });

  const frame = async (): Promise<Frame> => {
    const deadline = Date.now() + 15_000;
    for (;;) {
      const hit = page.frames().find((f) => /^https:\/\/(app\.)?cal\.com\//.test(f.url()));
      if (hit) {
        await hit.waitForFunction(() => Boolean((window as unknown as { __calStub?: unknown }).__calStub));
        return hit;
      }
      if (Date.now() > deadline) throw new Error('the Cal.com embed iframe never opened');
      await page.waitForTimeout(100);
    }
  };

  return {
    openedUrls,
    frame,
    async post(type, data) {
      const f = await frame();
      await postCalEvent(f, type, data);
    },
  };
}

/** Post `{ fullType: 'CAL:<ns>:<type>', data }` from a Cal iframe to its parent. */
export async function postCalEvent(frame: Frame, type: string, data: Record<string, unknown>): Promise<void> {
  await frame.evaluate(
    ([t, d]) => {
      const w = window as unknown as { __calStubPost?: (type: string, data: unknown) => void };
      if (!w.__calStubPost) throw new Error('not the Cal.com stub page');
      w.__calStubPost(t, d);
    },
    [type, data] as const,
  );
}

/**
 * POST a Cal.com webhook delivery to /api/webhooks/cal, signed with `secret` the way
 * Cal.com signs it. `mentorId` selects the per-mentor path (?mentor=<id>).
 */
export async function signedCalPost(
  request: APIRequestContext,
  opts: { mentorId?: string; secret: string; body: Record<string, unknown> | string; ip?: string },
): Promise<APIResponse> {
  const raw = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  const url = opts.mentorId ? `/api/webhooks/cal?mentor=${encodeURIComponent(opts.mentorId)}` : '/api/webhooks/cal';
  return request.post(url, {
    data: raw,
    headers: { ...calHeaders(raw, opts.secret), ...(opts.ip ? { 'x-e2e-client-ip': opts.ip } : {}) },
  });
}
