import pg from 'pg';
const { Client } = pg;
const url = process.env.SUPABASE_DB_URL;
console.log('URL host:', url ? url.replace(/:[^:@]+@/, ':****@') : 'MISSING');
const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  const r = await client.query('select current_database() as db, current_user as usr, version() as v');
  console.log('Connected OK:', r.rows[0].db, '|', r.rows[0].usr);
  const c = await client.query('select count(*)::int as n from whatsapp_messages');
  console.log('whatsapp_messages count via direct PG:', c.rows[0].n);
  await client.end();
} catch (e) {
  console.error('CONNECT ERROR:', e.message);
  process.exit(1);
}
