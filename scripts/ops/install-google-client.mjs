// One command for the owner, run on this PC. It never prints the secret. Two ways in:
//   node scripts/ops/install-google-client.mjs [path-to-client_secret.json]
//       reads the downloaded client JSON (newest client_secret*.json in Downloads by default), checks it is a Web client whose redirect URI is EXACTLY
//       the one GravyBlock implements, then overwrites and deletes the JSON after installing
//   node scripts/ops/install-google-client.mjs --client-id <id> --secret-from-clipboard
//       for the new Google console, which no longer offers a JSON download: the secret is copied with the console's copy button, read from the
//       clipboard here, installed, and the clipboard is cleared
// Installing = sending id and secret to the VPS over ssh into the web app's .env (scripts/ops/set-studio-google-oauth.sh --stdin), restarting only the web app.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const REDIRECT = "https://gravyblock.com/api/admin/marketing-studio/connect/youtube/callback";
const HOST = process.env.VPS_HOST ?? "root@177.7.38.145";
const KEY = process.env.VPS_KEY ?? path.join(os.homedir(), ".ssh", "sendfable_vps");
const ID_RE = /^[0-9]+-[A-Za-z0-9_]+\.apps\.googleusercontent\.com$/;
const args = process.argv.slice(2);
const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);

function fromClipboard() {
  const id = flag("--client-id");
  if (!id || !ID_RE.test(id)) throw new Error("--client-id must be the client id (123...-abc....apps.googleusercontent.com)");
  const r = spawnSync("powershell", ["-NoProfile", "-Command", "Get-Clipboard -Raw"], { encoding: "utf8" });
  const secret = (r.stdout ?? "").trim();
  if (!/^GOCSPX-[A-Za-z0-9_-]{20,}$/.test(secret)) throw new Error("The clipboard does not hold a Google client secret (expected GOCSPX-...). Use the console's copy button next to the secret, then run this again.");
  return { id, secret, cleanup: () => spawnSync("powershell", ["-NoProfile", "-Command", "Set-Clipboard -Value ' '"]) };
}

function fromJson() {
  let file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    const dir = path.join(os.homedir(), "Downloads");
    const files = readdirSync(dir).filter((f) => /^client_secret.*\.json$/i.test(f)).map((f) => ({ f: path.join(dir, f), t: statSync(path.join(dir, f)).mtimeMs }));
    if (!files.length) throw new Error(`No client_secret*.json found in ${dir}.`);
    file = files.sort((a, b) => b.t - a.t)[0].f;
  }
  const web = JSON.parse(readFileSync(file, "utf8")).web;
  if (!web) throw new Error("This is not a Web application client (no \"web\" section).");
  if (!ID_RE.test(web.client_id ?? "")) throw new Error("The client id in the file looks wrong.");
  if (typeof web.client_secret !== "string" || web.client_secret.length < 20) throw new Error("The client secret is missing from the file.");
  const uris = web.redirect_uris ?? [];
  if (!uris.includes(REDIRECT)) throw new Error(`The client's redirect URIs are [${uris.join(", ")}]. It must include exactly ${REDIRECT}.`);
  return { id: web.client_id, secret: web.client_secret, cleanup: () => { writeFileSync(file, Buffer.alloc(Math.max(statSync(file).size, 1), 0)); unlinkSync(file); } };
}

const cred = args.includes("--secret-from-clipboard") ? fromClipboard() : fromJson();
if (process.env.DRY_RUN) {
  console.log(`dry run: credential valid, client ${cred.id.slice(0, 12)}.... Nothing sent, nothing cleared.`);
  process.exit(0);
}
const r = spawnSync("ssh", ["-i", KEY, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", HOST, "bash /home/deploy/gravyblock/scripts/ops/set-studio-google-oauth.sh --stdin"], { input: `${cred.id}\n${cred.secret}\n`, encoding: "utf8" });
if (r.status !== 0) throw new Error(`Could not save to the server: ${(r.stderr || r.stdout || "ssh failed").trim().split("\n").slice(-2).join(" ")}`);
console.log(r.stdout.trim());
console.log(`client ${cred.id.slice(0, 12)}... installed.`);
cred.cleanup();
console.log("Local copy cleared (clipboard emptied, or JSON overwritten and deleted).");
