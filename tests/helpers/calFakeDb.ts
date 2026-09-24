/**
 * A minimal stand-in for the service-role client as api/webhooks/cal.ts uses it:
 *   from('mentor_cal_webhooks').select(...).eq('mentor_id', id).maybeSingle()
 *   rpc('cal_record_delivery' | 'cal_apply_event', args)
 * It records every call so tests can assert what reached the database (and that the cheap
 * rejections reached nothing). tests/helpers/fakeSupabase.ts (the SSO fake) is not touched.
 */
export interface WebhookRow {
  secret: string;
  previous_secret: string | null;
  previous_valid_until: string | null;
}

export interface FakeError {
  code: string;
  message: string;
}

export type RpcHandler = (name: string, args: Record<string, unknown>) => { data?: unknown; error?: FakeError | null };

export class CalFakeDb {
  readonly webhooks = new Map<string, WebhookRow>();
  readonly lookups: string[] = [];
  readonly rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  /** When set, the secret lookup fails with this error. */
  lookupError: FakeError | null = null;
  rpcHandler: RpcHandler = (name, args) =>
    name === 'cal_record_delivery'
      ? { data: { outcome: args.p_outcome } }
      : { data: { outcome: 'confirmed', booking_id: 'booking-1', changed: true } };

  from(table: string) {
    if (table !== 'mentor_cal_webhooks') throw new Error(`CalFakeDb: unexpected table ${table}`);
    let mentorId = '';
    const builder = {
      select: () => builder,
      eq: (column: string, value: string) => {
        if (column !== 'mentor_id') throw new Error(`CalFakeDb: unexpected filter ${column}`);
        mentorId = value;
        return builder;
      },
      maybeSingle: async () => {
        this.lookups.push(mentorId);
        if (this.lookupError) return { data: null, error: this.lookupError };
        return { data: this.webhooks.get(mentorId) ?? null, error: null };
      },
    };
    return builder;
  }

  async rpc(name: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ name, args });
    const result = this.rpcHandler(name, args);
    return { data: result.data ?? null, error: result.error ?? null };
  }
}
