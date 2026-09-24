import { randomBytes } from 'node:crypto';
import { test, expect, signedCalPost, type Page } from '../fixtures/test';
import { ids } from '../fixtures/personas';
import { calWebhookBody, plain, tr, useLanguage } from './b-helpers';

/**
 * S13 (design §6.4, B11, F08): the mentor's Cal.com booking sync panel — the subscriber URL,
 * the masked secret with Show / Copy, rotation with a 24-hour grace for the old secret, and the
 * last delivery a signed PING produces (picked up by the panel's 15-second poll).
 * /mentor-portal/profile is Track B's page; /dashboard/profile (@needs-track-c) is Track C's.
 */
type Sql = import('postgres').Sql;

test.beforeEach(async ({ page, lang, context, browserName }) => {
  await useLanguage(page, lang);
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

async function secrets(db: Sql, mentorId: string) {
  const [row] = await db<{ secret: string; previous_secret: string | null; grace_hours: number | null; deliveries: number; outcome: string | null }[]>`
    select secret, previous_secret, (extract(epoch from (previous_valid_until - now())) / 3600)::float8 as grace_hours,
           deliveries_total as deliveries, last_outcome as outcome
    from public.mentor_cal_webhooks where mentor_id = ${mentorId}`;
  return row;
}

async function checkPanel(page: Page, db: Sql, mentorId: string, lang: 'en' | 'ar') {
  const panel = page.getByTestId('cal-sync-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: tr(lang, 'calSync.title') })).toBeVisible();
  await expect(page.getByTestId('cal-sync-url')).toHaveValue(new RegExp(`/api/webhooks/cal\\?mentor=${mentorId}$`));
  await expect(page.getByTestId('cal-sync-status')).toHaveAttribute('data-kind', /not_connected|working|attention/);
  const { secret } = await secrets(db, mentorId);
  const shown = page.getByTestId('cal-sync-secret');
  await expect(shown).toHaveText(`•••• ${secret.slice(-4)}`);
  await expect(shown).toHaveAttribute('data-revealed', 'false');
  await expect(page.getByTestId('cal-sync-steps').locator('li')).toHaveCount(6);
  return secret;
}

test('S13 the Cal.com sync panel: URL, masked secret, copy, rotate with grace, a signed ping shows up', async ({ page, db, request, clientIp, loginAs, healthy, lang, personaProject }) => {
  const mentorId = ids(personaProject).mentor;
  // Start from no webhook row (earlier specs may have delivered to this mentor): the panel creates it.
  await db`delete from public.mentor_cal_webhooks where mentor_id = ${mentorId}`;
  await loginAs('mentor');
  await page.goto('/mentor-portal/profile');
  const oldSecret = await checkPanel(page, db, mentorId, lang);
  await expect(page.getByTestId('cal-sync-status')).toHaveAttribute('data-kind', 'not_connected');
  // Cal.com cannot reach this local origin, and the panel says so.
  await expect(page.getByTestId('cal-sync-preview')).toBeVisible();
  await healthy({ screenshotName: 'S13-panel' });

  // Show and Copy.
  await page.getByTestId('button-toggle-cal-secret').click();
  await expect(page.getByTestId('cal-sync-secret')).toHaveText(oldSecret);
  await expect(page.getByTestId('button-toggle-cal-secret')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('button-copy-cal-url').click();
  await expect(page.getByTestId('button-copy-cal-url')).toContainText(tr(lang, 'calSync.copied'));
  const copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  if (copied) expect(copied).toMatch(new RegExp(`/api/webhooks/cal\\?mentor=${mentorId}$`));

  // Rotate: the new secret is shown once; the old one keeps working for 24 hours.
  await page.getByTestId('button-rotate-cal-secret').click();
  await expect(page.getByTestId('dialog-rotate-cal-secret')).toContainText(tr(lang, 'calSync.rotateBody'));
  await page.getByTestId('button-confirm-rotate').click();
  await expect(page.getByTestId('cal-sync-new-secret')).toBeVisible();
  await expect.poll(async () => (await secrets(db, mentorId)).previous_secret).toBe(oldSecret);
  const rotated = await secrets(db, mentorId);
  expect(rotated.secret).not.toBe(oldSecret);
  expect(rotated.grace_hours).toBeGreaterThan(23.9);
  expect(rotated.grace_hours).toBeLessThan(24.1);
  await expect(page.getByTestId('cal-sync-secret')).toHaveText(rotated.secret);

  // A signed PING with the new secret: the panel's poll shows it (no reload).
  const ping = await signedCalPost(request, { mentorId, secret: rotated.secret, body: calWebhookBody('PING'), ip: clientIp });
  expect(ping.status()).toBe(200);
  const lastDelivery = page.getByTestId('cal-sync-last-delivery');
  await expect(lastDelivery).toBeVisible({ timeout: 25_000 });
  expect(plain(await lastDelivery.innerText())).toBe(
    tr(lang, 'calSync.lastDelivery', { trigger: tr(lang, 'calSync.triggers.PING'), when: tr(lang, 'calSync.justNow') }),
  );
  await expect(page.getByTestId('cal-sync-status')).toHaveAttribute('data-kind', 'working');
  await expect(page.getByTestId('cal-sync-status')).toHaveAttribute('data-outcome', 'ping');
  await healthy({ screenshotName: 'S13-ping' });

  // The old secret still verifies within the grace period; a random one gets 401 and changes nothing.
  const graced = await signedCalPost(request, { mentorId, secret: oldSecret, body: calWebhookBody('PING'), ip: clientIp });
  expect(graced.status()).toBe(200);
  const before = await secrets(db, mentorId);
  const forged = await signedCalPost(request, { mentorId, secret: randomBytes(32).toString('hex'), body: calWebhookBody('PING'), ip: clientIp });
  expect(forged.status()).toBe(401);
  const after = await secrets(db, mentorId);
  expect(after.deliveries).toBe(before.deliveries);
  expect(after.outcome).toBe('ping');
});

test('S13 the panel on /dashboard/profile @needs-track-c', async ({ page, db, loginAs, healthy, lang, personaProject }) => {
  const mentorId = ids(personaProject).mentor;
  await loginAs('mentor');
  await page.goto('/dashboard/profile#cal-sync');
  await checkPanel(page, db, mentorId, lang);
  await healthy({ screenshotName: 'S13-dashboard-profile' });
});
