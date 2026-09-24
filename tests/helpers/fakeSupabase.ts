import { randomBytes, randomUUID } from 'node:crypto';

/**
 * In-memory stand-in for the service-role Supabase client, covering exactly
 * the surface api/_lib/supabaseAdmin.ts uses (select/ilike/eq/limit, insert,
 * update, and the auth admin calls). The real supabaseAdmin functions run
 * against it, so the tests exercise their query logic, not a mock of it.
 * Unique constraints mirror shared/schema.ts and the migration.
 */

type Row = Record<string, unknown>;
interface PgError {
  code?: string;
  message: string;
}
type Result = { data: unknown; error: PgError | null };

const UNIQUE: Record<string, string[]> = {
  users: ['id', 'email', 'amazon_alias'],
  approved_users: ['id', 'amazon_alias'],
  user_identifiers: ['id'],
  mentors: ['id', 'email'],
};

export interface AuthUserRecord {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  app_metadata: { providers: string[] };
  user_metadata: Record<string, unknown>;
  password?: string;
}

export interface IssuedLink {
  email: string;
  userId: string;
  hashedToken: string;
}

class Query implements PromiseLike<Result> {
  private filters: Array<(row: Row) => boolean> = [];
  private op: 'select' | 'insert' | 'update' = 'select';
  private payload: Row = {};
  private max = Infinity;

  constructor(private readonly db: FakeSupabase, private readonly table: string) {}

  select(_columns?: string): this {
    return this;
  }

  ilike(column: string, pattern: string): this {
    // supabaseAdmin always escapes wildcards, so the pattern is a literal.
    const literal = pattern.replace(/\\([\\%_])/g, '$1').toLowerCase();
    this.filters.push((row) => typeof row[column] === 'string' && (row[column] as string).toLowerCase() === literal);
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  limit(n: number): this {
    this.max = n;
    return this;
  }

  insert(row: Row): this {
    this.op = 'insert';
    this.payload = row;
    return this;
  }

  update(patch: Row): this {
    this.op = 'update';
    this.payload = patch;
    return this;
  }

  then<A = Result, B = never>(onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected);
  }

  private run(): Result {
    const injected = this.db.failures.find((f) => f.table === this.table && f.op === this.op);
    if (injected) return { data: null, error: { message: `injected ${this.op} failure on ${this.table}` } };

    const rows = this.db.table(this.table);
    const matches = rows.filter((row) => this.filters.every((f) => f(row)));

    if (this.op === 'select') return { data: matches.slice(0, this.max).map((r) => ({ ...r })), error: null };

    if (this.op === 'insert') {
      const clash = (UNIQUE[this.table] ?? []).find((col) => {
        const value = this.payload[col];
        return value !== null && value !== undefined && rows.some((r) => r[col] === value);
      });
      if (clash) return { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint (${clash})` } };
      rows.push({ ...this.payload });
      return { data: null, error: null };
    }

    for (const row of matches) Object.assign(row, this.payload);
    return { data: null, error: null };
  }
}

export class FakeSupabase {
  readonly tables = new Map<string, Row[]>();
  readonly authUsers: AuthUserRecord[] = [];
  readonly issuedLinks: IssuedLink[] = [];
  readonly passwordRotations: string[] = [];
  readonly deletedAuthUsers: string[] = [];
  failures: Array<{ table: string; op: 'select' | 'insert' | 'update' }> = [];

  table(name: string): Row[] {
    let rows = this.tables.get(name);
    if (!rows) {
      rows = [];
      this.tables.set(name, rows);
    }
    return rows;
  }

  from(name: string): Query {
    return new Query(this, name);
  }

  /** Seed an auth user directly (e.g. someone who registered with a password). */
  addAuthUser(input: { email: string; confirmed?: boolean; signedIn?: boolean; providers?: string[] }): AuthUserRecord {
    const user: AuthUserRecord = {
      id: randomUUID(),
      email: input.email,
      email_confirmed_at: input.confirmed ? new Date().toISOString() : null,
      last_sign_in_at: input.signedIn ? new Date().toISOString() : null,
      app_metadata: { providers: input.providers ?? ['email'] },
      user_metadata: {},
    };
    this.authUsers.push(user);
    return user;
  }

  private findAuthByEmail(email: string): AuthUserRecord | undefined {
    return this.authUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  readonly auth = {
    admin: {
      createUser: async (attrs: { email: string; email_confirm?: boolean; user_metadata?: Record<string, unknown> }) => {
        if (this.findAuthByEmail(attrs.email)) {
          return { data: { user: null }, error: { code: 'email_exists', message: 'A user with this email address has already been registered' } };
        }
        const user: AuthUserRecord = {
          id: randomUUID(),
          email: attrs.email,
          email_confirmed_at: attrs.email_confirm ? new Date().toISOString() : null,
          last_sign_in_at: null,
          app_metadata: { providers: ['email'] },
          user_metadata: attrs.user_metadata ?? {},
        };
        this.authUsers.push(user);
        return { data: { user: { id: user.id, email: user.email } }, error: null };
      },

      listUsers: async ({ page = 1, perPage = 50 }: { page?: number; perPage?: number }) => {
        const start = (page - 1) * perPage;
        return { data: { users: this.authUsers.slice(start, start + perPage) }, error: null };
      },

      deleteUser: async (id: string) => {
        const idx = this.authUsers.findIndex((u) => u.id === id);
        if (idx >= 0) this.authUsers.splice(idx, 1);
        this.deletedAuthUsers.push(id);
        return { data: {}, error: null };
      },

      updateUserById: async (id: string, attrs: { password?: string; user_metadata?: Record<string, unknown> }) => {
        const user = this.authUsers.find((u) => u.id === id);
        if (!user) return { data: { user: null }, error: { message: 'User not found' } };
        if (attrs.password !== undefined) {
          user.password = attrs.password;
          this.passwordRotations.push(id);
        }
        if (attrs.user_metadata) user.user_metadata = { ...user.user_metadata, ...attrs.user_metadata };
        return { data: { user }, error: null };
      },

      generateLink: async ({ type, email }: { type: string; email: string }) => {
        const user = this.findAuthByEmail(email);
        if (type !== 'magiclink' || !user) return { data: { properties: null, user: null }, error: { message: 'User not found' } };
        const hashedToken = randomBytes(24).toString('hex');
        this.issuedLinks.push({ email, userId: user.id, hashedToken });
        return { data: { properties: { hashed_token: hashedToken }, user: { id: user.id } }, error: null };
      },
    },
  };
}
