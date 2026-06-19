import { pool } from "@workspace/db";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const PEOPLE_BASE = "https://people.googleapis.com/v1";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

export function googleClientId(): string {
  const v = process.env.GOOGLE_CLIENT_ID;
  if (!v) throw new Error("GOOGLE_CLIENT_ID is not configured");
  return v;
}

export function googleClientSecret(): string {
  const v = process.env.GOOGLE_CLIENT_SECRET;
  if (!v) throw new Error("GOOGLE_CLIENT_SECRET is not configured");
  return v;
}

// The shared proxy serves the API at /api on the public domain. Google requires
// this to EXACTLY match the redirect URI registered in the Cloud console.
export function googleRedirectUri(): string {
  const domain =
    process.env.REPLIT_DOMAINS?.split(",")[0]?.trim() ||
    process.env.REPLIT_DEV_DOMAIN;
  if (!domain) throw new Error("No REPLIT domain available for redirect URI");
  return `https://${domain}/api/google/callback`;
}

export function buildAuthUrl(state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", googleClientId());
  url.searchParams.set("redirect_uri", googleRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    redirect_uri: googleRedirectUri(),
    grant_type: "authorization_code",
  });
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) {
    throw new Error(`Google token exchange failed: ${r.status} ${await r.text()}`);
  }
  return (await r.json()) as TokenResponse;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    grant_type: "refresh_token",
  });
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) {
    throw new Error(`Google token refresh failed: ${r.status} ${await r.text()}`);
  }
  return (await r.json()) as TokenResponse;
}

export async function getUserEmail(accessToken: string): Promise<string | null> {
  const r = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { email?: string };
  return j.email ?? null;
}

export class NotConnectedError extends Error {
  constructor() {
    super("google_not_connected");
  }
}

// Returns a valid access token for the tenant, refreshing if near expiry.
export async function getValidAccessToken(tenantId: string): Promise<string> {
  const { rows } = await pool.query(
    `select access_token, refresh_token, expiry
       from google_oauth_tokens where tenant_id = $1`,
    [tenantId],
  );
  if (rows.length === 0) throw new NotConnectedError();
  const row = rows[0] as {
    access_token: string;
    refresh_token: string | null;
    expiry: Date | null;
  };
  const expMs = row.expiry ? new Date(row.expiry).getTime() : 0;
  if (expMs - Date.now() > 60_000) return row.access_token;
  if (!row.refresh_token) {
    // Token expired and we have no refresh token: force re-connect.
    throw new NotConnectedError();
  }
  const refreshed = await refreshAccessToken(row.refresh_token);
  const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000);
  await pool.query(
    `update google_oauth_tokens
        set access_token = $2, expiry = $3, updated_at = now()
      where tenant_id = $1`,
    [tenantId, refreshed.access_token, newExpiry],
  );
  return refreshed.access_token;
}

export interface GooglePerson {
  resourceName: string;
  etag?: string;
  names?: { displayName?: string; givenName?: string; familyName?: string }[];
  emailAddresses?: { value?: string }[];
  phoneNumbers?: { value?: string }[];
}

const PERSON_FIELDS = "names,emailAddresses,phoneNumbers";

export async function listConnections(
  accessToken: string,
): Promise<GooglePerson[]> {
  const out: GooglePerson[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${PEOPLE_BASE}/people/me/connections`);
    url.searchParams.set("personFields", PERSON_FIELDS);
    url.searchParams.set("pageSize", "500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) {
      throw new Error(`People list failed: ${r.status} ${await r.text()}`);
    }
    const j = (await r.json()) as {
      connections?: GooglePerson[];
      nextPageToken?: string;
    };
    if (j.connections) out.push(...j.connections);
    pageToken = j.nextPageToken;
  } while (pageToken);
  return out;
}

function personBody(input: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  const body: Record<string, unknown> = {};
  if (input.name) body.names = [{ givenName: input.name }];
  if (input.email) body.emailAddresses = [{ value: input.email }];
  if (input.phone) body.phoneNumbers = [{ value: input.phone }];
  return body;
}

export async function createContact(
  accessToken: string,
  input: { name?: string | null; email?: string | null; phone?: string | null },
): Promise<string> {
  const r = await fetch(`${PEOPLE_BASE}/people:createContact`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(personBody(input)),
  });
  if (!r.ok) {
    throw new Error(`People create failed: ${r.status} ${await r.text()}`);
  }
  const j = (await r.json()) as GooglePerson;
  return j.resourceName;
}

export async function updateContact(
  accessToken: string,
  resourceName: string,
  input: { name?: string | null; email?: string | null; phone?: string | null },
): Promise<void> {
  // Update requires the current etag from a fresh read.
  const get = await fetch(
    `${PEOPLE_BASE}/${resourceName}?personFields=${PERSON_FIELDS}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!get.ok) {
    throw new Error(`People get failed: ${get.status} ${await get.text()}`);
  }
  const existing = (await get.json()) as GooglePerson;
  const body = { ...personBody(input), etag: existing.etag };
  const r = await fetch(
    `${PEOPLE_BASE}/${resourceName}:updateContact?updatePersonFields=${PERSON_FIELDS}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!r.ok) {
    throw new Error(`People update failed: ${r.status} ${await r.text()}`);
  }
}

export function normalizePhone(p: string | null | undefined): string {
  return (p ?? "").replace(/\D/g, "");
}
