// Imported FIRST by every test file so the studio config (read at import time) sees test-safe environment values.
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";

process.env.MARKETING_SECRET_KEY ||= randomBytes(32).toString("base64");
process.env.MARKETING_SECRET_KEY_ID ||= "k1";
process.env.MARKETING_STORAGE_ROOT ||= path.join(os.tmpdir(), `ms-test-${process.pid}`);
process.env.MARKETING_STUDIO_ENABLED ||= "1";
if (process.env.STUDIO_TEST_DATABASE_URL) process.env.MARKETING_DATABASE_URL = process.env.STUDIO_TEST_DATABASE_URL;
