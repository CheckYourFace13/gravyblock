import postgres from "postgres";

const query = process.argv.slice(2).join(" ").trim();
if (!query) {
  console.error("Usage: node scripts/sql-query.mjs <sql>");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL ?? "postgresql://gravyblock:gravyblock@localhost:5432/gravyblock");
try {
  const rows = await sql.unsafe(query);
  console.log(JSON.stringify(rows, null, 2));
} finally {
  await sql.end();
}
