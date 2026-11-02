import { UPLOAD_KINDS, type UploadKind } from "@/lib/marketing-studio/config";
import { BodyTooLargeError, MAX_UPLOAD_REQUEST_BYTES, notFoundResponse, readBodyLimited, redirectTo, sameOrigin, studioApiAuthorized } from "@/lib/marketing-studio/http";
import { StudioAccessError, INTERNAL_SCOPE } from "@/lib/marketing-studio/scope";
import { storeImageAsset, UploadError } from "@/lib/marketing-studio/uploads";

export const dynamic = "force-dynamic";

/**
 * Marketing Studio asset upload. This is a dedicated route (not a Server Action) so its body limit is its own, bounded at
 * the 10 MB asset limit plus multipart overhead, and every other Server Action keeps the framework default.
 */
export async function POST(req: Request) {
  if (!(await studioApiAuthorized())) return notFoundResponse();
  if (!sameOrigin(req)) return new Response("Forbidden", { status: 403 });
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("multipart/form-data")) return new Response("Unsupported media type", { status: 415 });

  let productId = "";
  try {
    const body = await readBodyLimited(req, MAX_UPLOAD_REQUEST_BYTES);
    const form = await new Response(new Uint8Array(body), { headers: { "content-type": type } }).formData();
    productId = String(form.get("productId") ?? "");
    const kind = String(form.get("kind") ?? "") as UploadKind;
    if (!UPLOAD_KINDS.includes(kind)) throw new UploadError("Choose an asset type");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UploadError("Choose a file");
    await storeImageAsset(INTERNAL_SCOPE, "admin", productId, { bytes: Buffer.from(await file.arrayBuffer()), originalName: file.name, kind, provenance: "owner_upload" });
    return redirectTo(`/admin/marketing-studio/products/${productId}`);
  } catch (err) {
    if (err instanceof StudioAccessError) return notFoundResponse();
    const msg = err instanceof BodyTooLargeError || err instanceof UploadError || err instanceof Error ? err.message : "Upload failed";
    const back = /^[0-9a-f-]{36}$/i.test(productId) ? `/admin/marketing-studio/products/${productId}` : "/admin/marketing-studio";
    return redirectTo(`${back}?e=${encodeURIComponent(msg.slice(0, 200))}`);
  }
}
