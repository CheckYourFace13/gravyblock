/** Sends ONE labelled test of the owner review email through the app (Resend). Uploads and publishes nothing. */
import { requestTestEmail } from "../../src/lib/marketing-studio/publishing/review-notify";

requestTestEmail().then((r) => console.log(JSON.stringify(r, null, 2)));
