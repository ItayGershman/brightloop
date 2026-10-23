import { gzipSync } from "node:zlib";

// Publishing the live page to the Base44 app: the page goes up as a static site through the
// platform API's "Deploy a prebuilt site" (POST /api/apps/{app_id}/deploy-dist), a .tar.gz
// with index.html at its root, sent with a personal access token as a bearer token. The
// token is a secret: it comes only from the environment and never appears in a message, an
// error or the result.

export interface PagePublisher {
  /** Publishes the page; throws a PublishError (whose message is safe to show) when it fails. */
  publish(html: string): Promise<{ url: string }>;
}

/** A failure whose message names what went wrong and never the token. */
export class PublishError extends Error {}

export interface Base44Keys {
  token: string;
  appId: string;
}

const API = "https://app.base44.com";
const TIMEOUT_MS = 60_000;
const NO_ANSWER = "no answer from Base44";

/** The Base44 publisher when both keys are set; otherwise none, and nothing is built. */
export function publisherFromEnv(
  env: Record<string, string | undefined>,
  connect: (keys: Base44Keys) => PagePublisher = base44Publisher,
): PagePublisher | undefined {
  const token = env.BASE44_API_KEY?.trim();
  const appId = env.BASE44_APP_ID?.trim();
  if (!token || !appId) return undefined;
  return connect({ token, appId });
}

/** Deploys the page as the app's whole published site. `fetchImpl` is the test seam. */
export function base44Publisher(keys: Base44Keys, fetchImpl: typeof fetch = fetch): PagePublisher {
  return {
    async publish(html) {
      const form = new FormData();
      form.append("file", new Blob([tarGz([{ name: "index.html", data: Buffer.from(html) }])], { type: "application/gzip" }), "page.tar.gz");
      let answer: Response;
      try {
        answer = await fetchImpl(`${API}/api/apps/${encodeURIComponent(keys.appId)}/deploy-dist`, {
          method: "POST",
          headers: { authorization: `Bearer ${keys.token}` },
          body: form,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        throw new PublishError(NO_ANSWER);
      }
      if (!answer.ok) throw new PublishError(`Base44 answered ${answer.status}${await reason(answer, keys.token)}`);
      const body = (await answer.json().catch(() => ({}))) as { app_url?: unknown };
      return { url: typeof body.app_url === "string" ? body.app_url : "" };
    },
  };
}

/** Base44's own short reason (its JSON "message"), with the token cut out should it ever be echoed; empty when there is none. */
async function reason(answer: Response, token: string): Promise<string> {
  const body = (await answer.json().catch(() => ({}))) as { message?: unknown };
  if (typeof body.message !== "string" || body.message.trim() === "") return "";
  return `: ${body.message.replaceAll(token, "[token]").replace(/\s+/g, " ").trim().slice(0, 200)}`;
}

/** A gzipped tar archive (ustar) of plain files at its root. */
export function tarGz(files: { name: string; data: Buffer }[]): Buffer {
  const blocks: Buffer[] = [];
  for (const file of files) {
    const header = Buffer.alloc(512);
    header.write(file.name, 0, 100, "utf8");
    header.write("0000644\0", 100, "ascii"); // mode
    header.write("0000000\0", 108, "ascii"); // uid
    header.write("0000000\0", 116, "ascii"); // gid
    header.write(`${file.data.length.toString(8).padStart(11, "0")}\0`, 124, "ascii");
    header.write("00000000000\0", 136, "ascii"); // mtime: fixed, so the same page makes the same archive
    header.write("        ", 148, "ascii"); // checksum, counted as spaces
    header.write("0", 156, "ascii"); // a regular file
    header.write("ustar\0", 257, "ascii");
    header.write("00", 263, "ascii");
    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
    blocks.push(header, file.data, Buffer.alloc((512 - (file.data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}
