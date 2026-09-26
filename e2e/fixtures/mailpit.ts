import { e2eEnv } from './env';

/** Mailpit (the local stack's mail catcher) through its REST API. */
export interface MailMessage {
  id: string;
  subject: string;
  to: string[];
  created: string;
  html: string;
  text: string;
  links: string[];
}

interface SearchResult {
  messages?: Array<{ ID: string; Subject: string; Created: string; To?: Array<{ Address: string }> }>;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${e2eEnv.mailpitUrl}${path}`);
  if (!res.ok) throw new Error(`mailpit ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

function extractLinks(html: string, text: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(/href="([^"]+)"/g)) found.add(m[1].replace(/&amp;/g, '&'));
  for (const m of text.matchAll(/https?:\/\/[^\s<>"]+/g)) found.add(m[0]);
  return [...found];
}

export const mailpit = {
  /** Newest message to `address` (optionally only ones created after `since`), or null. */
  async latest(address: string, opts: { since?: Date } = {}): Promise<MailMessage | null> {
    const q = encodeURIComponent(`to:"${address}"`);
    const result = await getJson<SearchResult>(`/api/v1/search?query=${q}&limit=20`);
    const summary = (result.messages ?? [])
      .filter((m) => !opts.since || new Date(m.Created).getTime() >= opts.since.getTime())
      .sort((a, b) => b.Created.localeCompare(a.Created))[0];
    if (!summary) return null;
    const full = await getJson<{ ID: string; Subject: string; Created?: string; Date?: string; HTML: string; Text: string; To?: Array<{ Address: string }> }>(
      `/api/v1/message/${summary.ID}`,
    );
    return {
      id: full.ID,
      subject: full.Subject,
      to: (full.To ?? []).map((t) => t.Address),
      created: summary.Created,
      html: full.HTML ?? '',
      text: full.Text ?? '',
      links: extractLinks(full.HTML ?? '', full.Text ?? ''),
    };
  },

  /** Poll until a message to `address` arrives (after `since`). */
  async waitFor(address: string, opts: { since?: Date; timeoutMs?: number } = {}): Promise<MailMessage> {
    const deadline = Date.now() + (opts.timeoutMs ?? 15_000);
    for (;;) {
      const msg = await mailpit.latest(address, opts);
      if (msg) return msg;
      if (Date.now() > deadline) throw new Error(`no mail to ${address} within ${opts.timeoutMs ?? 15_000} ms`);
      await new Promise((r) => setTimeout(r, 500));
    }
  },

  /** The first link in a message whose URL contains `fragment` (e.g. '/auth/v1/verify'). */
  link(msg: MailMessage, fragment: string): string {
    const hit = msg.links.find((l) => l.includes(fragment));
    if (!hit) throw new Error(`no link containing ${fragment} in "${msg.subject}"`);
    return hit;
  },
};
