import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const url=process.env.POSTGRES_URL||process.env.DATABASE_URL||process.env.NEON_DATABASE_URL;
if(!url) {
  console.error('Set POSTGRES_URL (or DATABASE_URL) before running the DEBRIX database migration.');
  process.exitCode=1;
} else {
  const sql=postgres(url,{max:1,prepare:false,connect_timeout:10});
  try {
    const migration=readFileSync(new URL('../migrations/001_initial.sql',import.meta.url),'utf8');
    await sql.begin(async tx=>{
      for(const statement of migration.split(';').map(value=>value.trim()).filter(Boolean)) await tx.unsafe(statement);
    });
    console.log('DEBRIX Postgres schema is up to date (migration 1).');
  } catch(error) {
    console.error('DEBRIX database migration failed:',error.message);
    process.exitCode=1;
  } finally {
    await sql.end({timeout:5});
  }
}
