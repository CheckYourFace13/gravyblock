import { PGlite } from "@electric-sql/pglite";
import { createServer } from "pglite-server";

const port = Number(process.env.PGLITE_PORT ?? 5432);
const dbPath = process.env.PGLITE_DATA_DIR ?? ".pglite-data";

const db = new PGlite(dbPath);
await db.waitReady;

const server = createServer(db);
server.listen(port, () => {
  console.log(`PGlite server listening on port ${port} with data dir ${dbPath}`);
});
