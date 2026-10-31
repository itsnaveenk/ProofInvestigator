import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// SSRF guard: public http(s) hosts on default ports only.
function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
    return (
      v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") ||
      v.startsWith("fe80") || v.startsWith("ff")
    );
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

export async function assertPublicUrl(raw: string, label: string): Promise<string> {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error(`${label} is not a valid URL.`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`${label} must use http or https.`);
  if (u.username || u.password) throw new Error(`${label} must not contain credentials.`);
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error(`${label} must use a standard port.`);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local") || !host.includes(".") && !isIP(host)) {
    throw new Error(`${label} points to a private or internal address.`);
  }
  let addrs: string[];
  try {
    addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  } catch {
    throw new Error(`${label}: could not resolve host "${host}".`);
  }
  if (addrs.length === 0 || addrs.some(isPrivateIp)) throw new Error(`${label} points to a private or internal address.`);
  return u.toString();
}
