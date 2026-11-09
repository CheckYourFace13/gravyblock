// Prints the number of heavy Marketing Studio jobs running right now (0 on any error). Used by self-deploy.sh so a deploy waits for a render instead of killing it.
import postgres from "postgres";
const sql = postgres(process.env.MARKETING_DATABASE_URL ?? process.env.DATABASE_URL ?? "", { max: 1, connect_timeout: 5 });
try {
  const rows = await sql`select count(*)::int as n from ms_media_jobs where status = 'running' and weight = 'heavy'`;
  console.log(rows[0].n);
} catch {
  console.log(0);
} finally {
  await sql.end({ timeout: 2 }).catch(() => {});
}
