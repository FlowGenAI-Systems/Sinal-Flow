import { expect } from "vitest";
import request from "supertest";

// Shared harness for the API parity suites (media, metrics, groups, mentions).
//
// The @workspace/db pool is created at import time from the connection string.
// In tests we never touch the read-only Supabase data; instead we point the pool
// at the local Postgres (DATABASE_URL) and build our own throwaway fixture
// tables. Deleting SUPABASE_DB_URL *before* importing any module that pulls in
// @workspace/db is therefore mandatory — and because this module performs no
// static import of @workspace/db, importing it from a test file applies the env
// below before the dynamic imports in `setupHarness` run.
delete process.env.SUPABASE_DB_URL;
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set to a local Postgres for the parity tests.",
  );
}
process.env.WHATSAPP_OWNER = process.env.WHATSAPP_OWNER ?? "tester-owner";
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret";

export const OWNER = process.env.WHATSAPP_OWNER!;

export type App = Awaited<typeof import("../app")>["default"];
export type Pool = Awaited<typeof import("@workspace/db")>["pool"];

export interface Harness {
  app: App;
  pool: Pool;
  cookie: string;
  tenantId: string;
  get: (path: string, query?: Record<string, string>) => Promise<any>;
}

// Builds the app, an authenticated session cookie, and a `get()` helper that
// asserts a 200 and returns the JSON body. Call inside beforeAll.
export async function setupHarness(): Promise<Harness> {
  const db = await import("@workspace/db");
  const pool = db.pool;
  const app = (await import("../app")).default;
  const auth = await import("../lib/auth");
  const scope = await import("../lib/scope");
  const tenantId = scope.OWNER_TENANT_ID;

  const cookie = `${auth.SESSION_COOKIE}=${auth.createSessionToken({
    userId: "test-user",
    tenantId,
    email: "test@example.com",
  })}`;

  const get = async (path: string, query: Record<string, string> = {}) => {
    const res = await request(app).get(path).query(query).set("Cookie", cookie);
    expect(
      res.status,
      `${path} ${JSON.stringify(query)} -> ${res.status}`,
    ).toBe(200);
    return res.body;
  };

  return { app, pool, cookie, tenantId, get };
}

// Throwaway mirror of the read-only `whatsapp_messages` source table. Identical
// across every parity suite.
export async function createWhatsappMessagesTable(pool: Pool): Promise<void> {
  await pool.query(`drop table if exists whatsapp_messages`);
  await pool.query(`
    create table whatsapp_messages (
      message_id text primary key,
      whatsapp_owner text not null,
      chat_type text not null,
      chat_id text,
      chat_name text,
      direction text,
      media_url text,
      metadata jsonb,
      message_created_at timestamptz default now(),
      sender_name text,
      sender_phone text,
      contact_phone text,
      message text,
      caption text,
      transcription text
    )
  `);
}

export async function dropWhatsappMessagesTable(pool: Pool): Promise<void> {
  await pool.query(`drop table if exists whatsapp_messages`);
}

// Tenant-scoped list of groups excluded from the Overview cloud / mentions feed.
// Identical in the groups and mentions parity suites.
export async function createSupportGroupsTable(pool: Pool): Promise<void> {
  await pool.query(`drop table if exists support_groups`);
  await pool.query(`
    create table support_groups (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null,
      chat_id text not null,
      name text,
      created_at timestamptz default now(),
      unique (tenant_id, chat_id)
    )
  `);
}

export async function dropSupportGroupsTable(pool: Pool): Promise<void> {
  await pool.query(`drop table if exists support_groups`);
}

// Throwaway mirror of `message_enrichment`. Uses the superset of columns needed
// by the parity suites (metrics needs category/sentiment/requires_reply/summary;
// groups only needs a subset) so both suites share one definition.
export async function createMessageEnrichmentTable(pool: Pool): Promise<void> {
  await pool.query(`drop table if exists message_enrichment`);
  await pool.query(`
    create table message_enrichment (
      message_id text primary key,
      tenant_id uuid not null,
      chat_type text,
      category text,
      sentiment text,
      topics text[],
      is_question boolean,
      requires_reply boolean,
      summary text,
      processed_at timestamptz default now()
    )
  `);
}

export async function dropMessageEnrichmentTable(pool: Pool): Promise<void> {
  await pool.query(`drop table if exists message_enrichment`);
}

// Throwaway mirror of `monitored_entities` (the registered mention keywords).
export async function createMonitoredEntitiesTable(pool: Pool): Promise<void> {
  await pool.query(`drop table if exists monitored_entities`);
  await pool.query(`
    create table monitored_entities (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null,
      name text,
      type text,
      aliases text[]
    )
  `);
}

export async function dropMonitoredEntitiesTable(pool: Pool): Promise<void> {
  await pool.query(`drop table if exists monitored_entities`);
}

// Throwaway mirror of `mentions` (classified entity mentions on messages).
export async function createMentionsTable(pool: Pool): Promise<void> {
  await pool.query(`drop table if exists mentions`);
  await pool.query(`
    create table mentions (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null,
      message_id text,
      entity_id uuid,
      mention_type text,
      sentiment text,
      created_at timestamptz default now()
    )
  `);
}

export async function dropMentionsTable(pool: Pool): Promise<void> {
  await pool.query(`drop table if exists mentions`);
}
