// Runs the whole Marketing Studio test suite against a disposable database: an in-memory PGlite server on a free localhost port, addressed as
// "gravyblock_studio_test" (the suites refuse any database whose name lacks "test"), with the current schema pushed into it. Nothing here ever
// reads or writes a configured database: DATABASE_URL and MARKETING_DATABASE_URL are overwritten for the child processes, and the script refuses
// to run against anything that is not localhost with "test" in its name. The database vanishes when the script ends.
//   npm run test:studio
import { spawn } from "node:child_process";
import net from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "pglite-server";

const NAME = "gravyblock_studio_test";

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
const url = `postgresql://postgres:postgres@127.0.0.1:${port}/${NAME}`;
assertDisposable(url);

const db = new PGlite();
await db.waitReady;
const server = createServer(db);
await new Promise<void>((r) => server.listen(port, "127.0.0.1", () => r()));
console.log(`disposable test database ${NAME} on 127.0.0.1:${port} (in memory)`);

const env = { ...process.env, DATABASE_URL: url, MARKETING_DATABASE_URL: url, STUDIO_TEST_DATABASE_URL: url, /* the PGlite wire server serves one connection at a time */ MARKETING_DB_POOL_MAX: "1" };
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
let code = 1;
try {
  const run = (args: string[]) => new Promise<number>((resolve) => spawn(npx, args, { env, stdio: "inherit", shell: process.platform === "win32" }).on("exit", (c) => resolve(c ?? 1)));
  // the current schema (async spawn: this process hosts the database, so its event loop must stay free)
  if ((await run(["drizzle-kit", "push", "--force"])) !== 0) throw new Error("applying the current schema failed");
  // async, not spawnSync: this process hosts the database, so its event loop must stay free while the tests run
  code = await new Promise<number>((resolve) => {
    const child = spawn(npx, ["tsx", "--test", "--test-concurrency=1", ...(process.argv.length > 2 ? process.argv.slice(2) : ["src/lib/marketing-studio/__tests__/*.test.ts"])], { env, stdio: "inherit", shell: process.platform === "win32" });
    child.on("exit", (c) => resolve(c ?? 1));
  });
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
} finally {
  server.close?.();
  await db.close().catch(() => {});
}
process.exit(code);
