import { test, expect } from '../fixtures/test';
import { tr } from '../fixtures/i18n';
import { displayName, ids } from '../fixtures/personas';
import { plain, tokenSettle } from './c-helpers';

/**
 * The activity feed reads in the viewer's language for the events the client writes
 * (R1-46, R1-74): registrations, profile and calendar saves, favourites. Their stored
 * `summary` is a sentence in the WRITER's language, so the rows below are stored in the other
 * language (or as the old English favourite line) and must still read in the viewer's.
 */

type Db = import('postgres').Sql;
const fill = (s: string, vars: Record<string, string>) => Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{{${k}}}`, v), s);

async function clearFeed(db: Db, profileId: string): Promise<void> {
  await db`delete from public.activity_events where ${profileId} = any(visible_to)`;
}

test('R1-74 client-written lines read in the viewer\'s language, whatever language they were stored in', async ({ page, loginAs, healthy, db, lang, personaProject }) => {
  const p = personaProject;
  const mentee = ids(p).mentee;
  const name = displayName(p, 'mentee');
  const other = lang === 'ar' ? 'en' : 'ar';
  await clearFeed(db, mentee);
  try {
    const insert = (type: string, summary: string, subject: string) => db`
      insert into public.activity_events (actor_type, actor_id, actor_name, type, subject_type, subject_id, visible_to, summary, meta)
      values ('mentee', ${mentee}, ${name}, ${type}, 'mentee', ${subject}, ${[mentee]}, ${summary}, '{}'::jsonb)`;
    await insert('mentee_registered', fill(tr(other, 'showcase.activity.summaries.menteeRegistered'), { name }), mentee);
    await insert('profile_updated', fill(tr(other, 'showcase.activity.summaries.profileUpdated'), { name }), mentee);
    await insert('favorite_added', 'Saved Manav Gupta as a favourite', ids(p).mentor);

    await loginAs('mentee');
    await tokenSettle(page);
    await page.goto('/dashboard/activity');
    const feed = page.getByTestId('activity-list');
    await expect(feed).toBeVisible();
    const line = async (type: string) => plain(await feed.locator(`[data-testid="activity-item"][data-type="${type}"] p`).first().innerText());
    expect(await line('mentee_registered')).toBe(fill(tr(lang, 'showcase.activity.summaries.menteeRegistered'), { name }));
    expect(await line('profile_updated')).toBe(fill(tr(lang, 'showcase.activity.summaries.profileUpdated'), { name }));
    expect(await line('favorite_added')).toBe(fill(tr(lang, 'showcase.activity.summaries.favoriteAdded'), { mentor: 'Manav Gupta' }));
    if (lang === 'ar') expect(await feed.innerText()).not.toMatch(/joined as a mentee|updated their profile|as a favourite/);
    else expect(await feed.innerText()).not.toMatch(/[؀-ۿ]/);
    await healthy({ screenshotName: 'R1-74-feed' });
  } finally {
    await clearFeed(db, mentee);
  }
});

test('R1-46 a favourite is logged with the mentor\'s name and the mentee\'s row name, and reads in the viewer\'s language', async ({ page, loginAs, healthy, db, lang, personaProject }) => {
  const p = personaProject;
  const { mentee, mentor } = ids(p);
  const rowName = `E2E Mentee Row Name (${p})`;
  const cleanup = async () => {
    await db`delete from public.mentee_favorites where mentee_id = ${mentee}`;
    await clearFeed(db, mentee);
    await db`update public.mentees set name = ${displayName(p, 'mentee')} where id = ${mentee}`;
  };
  await cleanup();
  try {
    // The mentees row's name differs from the sign-in metadata's (the auditor's "Audit mentee" vs "Audit Mentee R1").
    await db`update public.mentees set name = ${rowName} where id = ${mentee}`;
    await loginAs('mentee');
    await tokenSettle(page);
    await page.goto('/mentors');
    const heart = page.getByTestId(`button-favorite-${mentor}`);
    await heart.click();
    await expect(heart).toHaveAttribute('aria-pressed', 'true');

    const logged = async () =>
      (await db<{ actor_name: string | null; meta: Record<string, unknown> }[]>`
        select actor_name, meta from public.activity_events where type = 'favorite_added' and actor_id = ${mentee} and subject_id = ${mentor}`)[0] ?? null;
    await expect.poll(logged).not.toBeNull();
    const row = (await logged())!;
    expect(row.actor_name, 'named from the mentees row').toBe(rowName);
    expect(row.meta).toMatchObject({ source: 'client', mentor_name: displayName(p, 'mentor'), name: rowName });

    await page.goto('/dashboard/activity');
    const item = page.getByTestId('activity-list').locator('[data-testid="activity-item"][data-type="favorite_added"] p').first();
    await expect(item).toBeVisible();
    expect(plain(await item.innerText())).toBe(fill(tr(lang, 'showcase.activity.summaries.favoriteAdded'), { mentor: displayName(p, 'mentor') }));
    await healthy({ screenshotName: 'R1-46-favourite-line' });
  } finally {
    await cleanup();
  }
});
