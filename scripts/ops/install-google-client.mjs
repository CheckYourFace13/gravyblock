// One command for the owner, run on this PC after downloading the OAuth client JSON from Google Cloud. It never prints the secret:
//   1. finds the newest client_secret*.json in Downloads (or the path you pass)
//   2. checks it is a Web client whose redirect URI is EXACTLY the one GravyBlock implements (so a typo in Google is caught here, not at sign-in)
//   3. sends the id and secret to the VPS over ssh into the web app's .env (scripts/ops/set-studio-google-oauth.sh --stdin), restarting only the web app
//   4. overwrites and deletes the local JSON
//   node scripts/ops/install-google-client.mjs [path-to-client_secret.json]
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const REDIRECT = "https://gravyblock.com/api/admin/marketing-studio/connect/youtube/callback";
const HOST = process.env.VPS_HOST ?? "root@177.7.38.145";
const KEY = process.env.VPS_KEY ?? path.join(os.homedir(), ".ssh", "sendfable_vps");

function findJson() {
  if (process.argv[2]) return process.argv[2];
  const dir = path.join(os.homedir(), "Downloads");
  const files = readdirSync(dir).filter((f) => /^client_secret.*\.json$/i.test(f)).map((f) => ({ f: path.join(dir, f), t: statSync(path.join(dir, f)).mtimeMs }));
  if (!files.length) throw new Error(`No client_secret*.json found in ${dir}. Download it from the Google Cloud client page first.`);
  return files.sort((a, b) => b.t - a.t)[0].f;
}

const file = findJson();
const web = JSON.parse(readFileSync(file, "utf8")).web;
if (!web) throw new Error("This is not a Web application client (no \"web\" section). Create the client with type Web application.");
if (!/^[0-9]+-[A-Za-z0-9_]+\.apps\.googleusercontent\.com$/.test(web.client_id ?? "")) throw new Error("The client id in the file looks wrong.");
if (typeof web.client_secret !== "string" || web.client_secret.length < 20) throw new Error("The client secret is missing from the file. Use the Download JSON button on the client page.");
const uris = web.redirect_uris ?? [];
if (!uris.includes(REDIRECT)) throw new Error(`The client's redirect URIs are [${uris.join(", ")}]. It must include exactly ${REDIRECT}. Fix it in Google Cloud, download the JSON again and re-run.`);

if (process.env.DRY_RUN) {
  console.log(`dry run: file valid, client ${web.client_id.slice(0, 12)}..., redirect URI exact. Nothing sent, nothing deleted.`);
  process.exit(0);
}
const r = spawnSync("ssh", ["-i", KEY, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", HOST, "bash /home/deploy/gravyblock/scripts/ops/set-studio-google-oauth.sh --stdin"], { input: `${web.client_id}\n${web.client_secret}\n`, encoding: "utf8" });
if (r.status !== 0) throw new Error(`Could not save to the server: ${(r.stderr || r.stdout || "ssh failed").trim().split("\n").slice(-2).join(" ")}`);
console.log(r.stdout.trim());
console.log(`client ${web.client_id.slice(0, 12)}... installed; redirect URI verified exact.`);
writeFileSync(file, Buffer.alloc(Math.max(statSync(file).size, 1), 0));
unlinkSync(file);
console.log("The downloaded JSON file was overwritten and deleted.");
