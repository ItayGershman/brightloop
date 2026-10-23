import { createSign } from "node:crypto";
import type { SheetKeys, SheetStore } from "./deliver.ts";
import { CHANGES_TAB, COLUMNS, OWN_PRICING_TAB } from "./tabs.ts";

// The Google Sheets adapter: a service-account token (a signed JWT exchanged for an access
// token) and three REST calls, with Node's own crypto and fetch, so no dependency. The key
// is read only here and never logged; a failure says the HTTP status and nothing from the
// answer. Rows are sent as RAW values, so a cell is stored as typed, never run as a formula.

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const API = "https://sheets.googleapis.com/v4/spreadsheets";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const TIMEOUT_MS = 30_000;

/** A failure the adapter describes itself: safe to show, it holds no key and no Sheet content. */
export class SheetError extends Error {}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export function googleSheet({ credentials, sheetId }: SheetKeys, fetchImpl: typeof fetch = fetch): SheetStore {
  let token: { value: string; until: number } | undefined;

  async function accessToken(): Promise<string> {
    if (token && Date.now() < token.until) return token.value;
    const account = serviceAccount(credentials);
    const now = Math.floor(Date.now() / 1000);
    const audience = account.token_uri ?? DEFAULT_TOKEN_URI;
    const unsigned = `${base64url({ alg: "RS256", typ: "JWT" })}.${base64url({ iss: account.client_email, scope: SCOPE, aud: audience, iat: now, exp: now + 3600 })}`;
    const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key, "base64url");
    const answer = await fetchImpl(audience, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!answer.ok) throw new SheetError(`Google sign-in answered ${answer.status}`);
    const { access_token: value, expires_in: seconds } = (await answer.json()) as { access_token: string; expires_in?: number };
    token = { value, until: Date.now() + ((seconds ?? 3600) - 60) * 1000 };
    return value;
  }

  async function call(path: string, what: string, init: RequestInit = {}): Promise<unknown> {
    const answer = await fetchImpl(`${API}/${encodeURIComponent(sheetId)}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!answer.ok) throw new SheetError(`Google Sheets answered ${answer.status} ${what}`);
    return answer.json();
  }

  async function values(tab: string, what: string): Promise<unknown[][]> {
    const answer = (await call(`/values/${range(tab)}`, what)) as { values?: unknown[][] };
    return answer.values ?? [];
  }

  return {
    readOwnPricing: () => values(OWN_PRICING_TAB, "reading the own-pricing tab"),
    readChanges: () => values(CHANGES_TAB, "reading the changes tab"),
    async appendChanges(rows) {
      await call(`/values/${range(CHANGES_TAB)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, "appending to the changes tab", {
        method: "POST",
        body: JSON.stringify({ values: rows }),
      });
    },
  };
}

/** A tab's columns, A to the last of Maya's, in A1 notation. */
function range(tab: string): string {
  const last = String.fromCharCode("A".charCodeAt(0) + COLUMNS.length - 1);
  return encodeURIComponent(`'${tab}'!A:${last}`);
}

function serviceAccount(credentials: string): ServiceAccount {
  let account: Partial<ServiceAccount>;
  try {
    account = JSON.parse(credentials);
  } catch {
    throw new SheetError("the service account key is not JSON");
  }
  if (typeof account.client_email !== "string" || typeof account.private_key !== "string") {
    throw new SheetError("the service account key has no client_email or private_key");
  }
  return account as ServiceAccount;
}

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
