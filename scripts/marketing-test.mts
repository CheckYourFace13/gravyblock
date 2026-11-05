// Runs the whole Marketing Studio test suite against a disposable, real, multi-connection PostgreSQL: a throwaway cluster (embedded-postgres,
// a devDependency) initialised in a temp folder and bound to 127.0.0.1 on a free port, holding one database named "gravyblock_studio_test"
// (the suites refuse any database whose name lacks "test") with the current schema pushed into it. Real Postgres means the concurrency tests
// run on genuinely parallel connections. Nothing here ever reads or writes a configured database: DATABASE_URL and MARKETING_DATABASE_URL
// are overwritten for the child processes, and the script refuses to run against anything that is not localhost with "test" in its name.
// The cluster and its files are deleted when the script ends.
//   npm run test:studio
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const NAME = "gravyblock_studio_test";
const USER = "studio_test";
const PASSWORD = "studio_test_pw";

function freePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

function assertDisposable(url: string) {
  const u = new URL(url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) throw new Error(`refusing to test against non-local host ${u.hostname}`);
  if (!/test/i.test(u.pathname.slice(1))) throw new Error(`refusing to test against database "${u.pathname.slice(1)}": its name must contain "test"`);
}

const port = await freePort();
const url = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${port}/${NAME}`;
assertDisposable(url);

const dir = mkdtempSync(path.join(os.tmpdir(), "gb-studio-test-pg-"));
const pg = new EmbeddedPostgres({ databaseDir: path.join(dir, "data"), user: USER, password: PASSWORD, port, persistent: false, postgresFlags: ["-c", "listen_addresses=127.0.0.1", "-c", "max_connections=60", "-c", "fsync=off"], onLog: () => {}, onError: () => {} });

const env = { ...process.env, DATABASE_URL: url, MARKETING_DATABASE_URL: url, STUDIO_TEST_DATABASE_URL: url, MARKETING_DB_POOL_MAX: process.env.MARKETING_DB_POOL_MAX ?? "8" };
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
let code = 1;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(NAME);
  console.log(`disposable test database ${NAME} on 127.0.0.1:${port} (real PostgreSQL, multi-connection, deleted afterward)`);
  const run = (args: string[]) => new Promise<number>((resolve) => spawn(npx, args, { env, stdio: "inherit", shell: process.platform === "win32" }).on("exit", (c) => resolve(c ?? 1)));
  // the current schema
  if ((await run(["drizzle-kit", "push", "--force"])) !== 0) throw new Error("applying the current schema failed");
  // test FILES run one after another (they share the database); the concurrency tests inside them overlap on separate connections
  code = await run(["tsx", "--test", "--test-concurrency=1", ...(process.argv.length > 2 ? process.argv.slice(2) : ["src/lib/marketing-studio/__tests__/*.test.ts"])]);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
} finally {
  await pg.stop().catch(() => {});
  rmSync(dir, { recursive: true, force: true });
}
process.exit(code);
