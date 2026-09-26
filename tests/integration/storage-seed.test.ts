import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, expect, it } from 'vitest';
import { describeDb } from './env.ts';
import { Accounts, anonClient } from './fixtures.ts';
import { createScratchDb, SQL, type ScratchDb } from './scratchDb.ts';
import { connect } from './sql.ts';

/** I15 (the uploads bucket) and I16 (the featured-mentor seed, migrations/0004). */
const sql = connect();
const accounts = new Accounts();
afterAll(async () => {
  await accounts.cleanup(sql);
  await sql.end();
});

const FEATURED = {
  '738d7465-42c6-5550-be9a-6e7ef35f52bc': 'manav-gupta',
  'caf1ee67-267d-591f-9842-5ae649ec2a26': 'bashar-aboudaoud',
  '20b28010-7bf8-5b6b-a1cc-d9435478d131': 'nick-ramil',
  'ec758eba-8efc-5c32-a3ee-768badd8c9c9': 'levi-lewandowski',
  '6afa7b6d-d098-568a-b629-2b04c6edeef1': 'ghita-elidrissi',
} as const;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

describeDb('I15 storage', () => {
  it('the uploads bucket is public, 5 MB, images only', async () => {
    const [b] = await sql`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'uploads'`;
    expect(b).toEqual({ public: true, file_size_limit: '5242880', allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] });
  });

  it('a signed-in user uploads a photo to mentors/; anon cannot; limits are enforced', async () => {
    const account = await accounts.create('uploader', { userType: 'mentor' });
    const path = `mentors/${account.id}/it-${Date.now()}.png`;
    const ok = await account.client.storage.from('uploads').upload(path, PNG, { contentType: 'image/png' });
    expect(ok.error).toBeNull();
    const url = account.client.storage.from('uploads').getPublicUrl(path).data.publicUrl;
    const fetched = await fetch(url);
    expect(fetched.status).toBe(200);

    const anon = await anonClient().storage.from('uploads').upload(`mentors/anon-${Date.now()}.png`, PNG, { contentType: 'image/png' });
    expect(anon.error).not.toBeNull();

    const wrongType = await account.client.storage.from('uploads').upload(`mentors/${account.id}/x-${Date.now()}.txt`, Buffer.from('hi'), { contentType: 'text/plain' });
    expect(wrongType.error).not.toBeNull();
    const tooBig = await account.client.storage.from('uploads').upload(`mentors/${account.id}/big-${Date.now()}.png`, Buffer.alloc(5 * 1024 * 1024 + 10), { contentType: 'image/png' });
    expect(tooBig.error).not.toBeNull();

    await account.client.storage.from('uploads').remove([path]);
  });

  it('the list API shows signed-in users their own objects only and anon nothing; profiles/ uploads go only into the own folder (R1-11)', async () => {
    const a = await accounts.create('lister-a', { userType: 'mentor' });
    const b = await accounts.create('lister-b', { userType: 'mentee' });
    const own = `profiles/${a.id}/it-${Date.now()}.png`;
    const flat = `mentors/it-${randomUUID()}.png`;
    try {
      expect((await a.client.storage.from('uploads').upload(own, PNG, { contentType: 'image/png' })).error).toBeNull();
      // The live client's flat folders (random file names) keep working.
      expect((await a.client.storage.from('uploads').upload(flat, PNG, { contentType: 'image/png' })).error).toBeNull();
      const intruder = await b.client.storage.from('uploads').upload(`profiles/${a.id}/intruder-${Date.now()}.png`, PNG, { contentType: 'image/png' });
      expect(intruder.error, 'another account cannot write into this folder').not.toBeNull();
      expect((await b.client.storage.from('uploads').upload(`profiles/${b.id}/mine-${Date.now()}.png`, PNG, { contentType: 'image/png' })).error).toBeNull();

      const anonList = await anonClient().storage.from('uploads').list('profiles');
      expect(anonList.data ?? []).toEqual([]);
      const anonFolder = await anonClient().storage.from('uploads').list(`profiles/${a.id}`);
      expect(anonFolder.data ?? []).toEqual([]);
      const strangerView = await b.client.storage.from('uploads').list(`profiles/${a.id}`);
      expect(strangerView.data ?? []).toEqual([]);
      const ownView = await a.client.storage.from('uploads').list(`profiles/${a.id}`);
      expect((ownView.data ?? []).map((o) => o.name)).toContain(own.split('/').pop());
      // Files are still served to everyone through their public URL.
      const url = anonClient().storage.from('uploads').getPublicUrl(own).data.publicUrl;
      expect((await fetch(url)).status).toBe(200);
    } finally {
      await a.client.storage.from('uploads').remove([own, flat]);
      const { data } = await b.client.storage.from('uploads').list(`profiles/${b.id}`);
      await b.client.storage.from('uploads').remove((data ?? []).map((o) => `profiles/${b.id}/${o.name}`));
    }
  });
});

describeDb('I16 featured-mentor seed', () => {
  const open: ScratchDb[] = [];
  afterEach(async () => {
    while (open.length) await open.pop()!.drop();
  });

  it('exactly the five ids exist as programme-managed rows with placeholder emails and zero ratings', async () => {
    const rows = await sql<{ id: string; email: string; cal_link: string; average_rating: string; total_ratings: number; managed_by_programme: boolean; comms_owner: string }[]>`
      select id, email, cal_link, average_rating::text, total_ratings, managed_by_programme, comms_owner
      from public.mentors where managed_by_programme order by id`;
    expect(rows.map((r) => r.id).sort()).toEqual(Object.keys(FEATURED).sort());
    for (const r of rows) {
      expect(r).toMatchObject({
        email: `featured.${FEATURED[r.id as keyof typeof FEATURED]}@mentorconnect.invalid`,
        cal_link: '',
        average_rating: '0.00',
        total_ratings: 0,
        comms_owner: 'exec',
      });
    }
  });

  it('anon reads them from mentors_public without email or Cal link, flagged programme-managed', async () => {
    const { data, error } = await anonClient().from('mentors_public').select('*').in('id', Object.keys(FEATURED));
    expect(error).toBeNull();
    expect(data).toHaveLength(5);
    for (const row of data ?? []) {
      expect(row).not.toHaveProperty('email');
      expect(row).not.toHaveProperty('cal_link');
      // The client switches a handed-over profile (flag false) from the curated copy to the row.
      expect(row).toHaveProperty('managed_by_programme', true);
    }
    const direct = await anonClient().from('mentors').select('id').limit(1);
    expect(direct.error?.code).toBe('42501');
  });

  it('a re-run never overwrites an admin edit (is_available = false stays false)', async () => {
    const db = await createScratchDb();
    open.push(db);
    for (const f of [SQL.v2, SQL.phase2, SQL.m0002, SQL.m0003, SQL.m0004]) await db.apply(f);
    await db.sql`update public.mentors set is_available = false, bio = 'edited by an admin' where id = '738d7465-42c6-5550-be9a-6e7ef35f52bc'`;
    await db.apply(SQL.m0004);
    const [row] = await db.sql`select is_available, bio from public.mentors where id = '738d7465-42c6-5550-be9a-6e7ef35f52bc'`;
    expect(row).toEqual({ is_available: false, bio: 'edited by an admin' });
    const [{ n }] = await db.sql<{ n: number }[]>`select count(*)::int as n from public.mentors where managed_by_programme`;
    expect(n).toBe(5);
  });
});
