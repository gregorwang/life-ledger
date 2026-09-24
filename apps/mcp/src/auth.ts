import { createRemoteJWKSet, jwtVerify } from "jose";

export interface McpAuthBindings {
  AGENT_IP_ALLOWLIST?: string;
  POLICY_AUD?: string;
  TEAM_DOMAIN?: string;
}

export type AuthorizationResult =
  | { authorized: true; method: "access_jwt" | "agent_ip" }
  | {
      authorized: false;
      code: "ACCESS_DENIED";
      message: string;
    };

type ParsedAddress =
  | { family: 4; bytes: Uint8Array }
  | { family: 6; bytes: Uint8Array };

type AllowlistRule =
  | { kind: "exact"; address: ParsedAddress }
  | { kind: "ipv6_cidr_64"; prefix: Uint8Array };

const accessJwks = new Map<
  string,
  ReturnType<typeof createRemoteJWKSet>
>();

function parseIpv4(value: string): Uint8Array | null {
  const parts = value.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const bytes = new Uint8Array(4);
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!part || !/^(0|[1-9]\d{0,2})$/.test(part)) {
      return null;
    }
    const byte = Number(part);
    if (!Number.isInteger(byte) || byte > 255) {
      return null;
    }
    bytes[index] = byte;
  }
  return bytes;
}

function parseIpv6(value: string): Uint8Array | null {
  if (
    !value ||
    value.includes("%") ||
    value.includes(".") ||
    !/^[0-9a-fA-F:]+$/.test(value)
  ) {
    return null;
  }

  const compressionIndex = value.indexOf("::");
  if (
    compressionIndex !== -1 &&
    compressionIndex !== value.lastIndexOf("::")
  ) {
    return null;
  }

  const hasCompression = compressionIndex !== -1;
  const [leftRaw, rightRaw = ""] = hasCompression
    ? [value.slice(0, compressionIndex), value.slice(compressionIndex + 2)]
    : [value, ""];
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw ? rightRaw.split(":") : [];
  if (
    [...left, ...right].some(
      (part) => !/^[0-9a-fA-F]{1,4}$/.test(part),
    )
  ) {
    return null;
  }

  const explicitCount = left.length + right.length;
  if (
    (!hasCompression && explicitCount !== 8) ||
    (hasCompression && explicitCount >= 8)
  ) {
    return null;
  }

  const groups = hasCompression
    ? [
        ...left,
        ...Array.from({ length: 8 - explicitCount }, () => "0"),
        ...right,
      ]
    : left;
  if (groups.length !== 8) {
    return null;
  }

  const bytes = new Uint8Array(16);
  for (let index = 0; index < groups.length; index += 1) {
    const group = Number.parseInt(groups[index] ?? "", 16);
    if (!Number.isFinite(group)) {
      return null;
    }
    bytes[index * 2] = group >>> 8;
    bytes[index * 2 + 1] = group & 0xff;
  }
  return bytes;
}

function parseAddress(value: string): ParsedAddress | null {
  const ipv4 = parseIpv4(value);
  if (ipv4) {
    return { family: 4, bytes: ipv4 };
  }
  const ipv6 = parseIpv6(value);
  return ipv6 ? { family: 6, bytes: ipv6 } : null;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function parseAllowlistRule(value: string): AllowlistRule | null {
  const separator = value.indexOf("/");
  if (separator === -1) {
    const address = parseAddress(value);
    return address ? { kind: "exact", address } : null;
  }

  if (separator !== value.lastIndexOf("/")) {
    return null;
  }
  const address = parseIpv6(value.slice(0, separator));
  const prefixLength = value.slice(separator + 1);
  if (!address || prefixLength !== "64") {
    return null;
  }
  return {
    kind: "ipv6_cidr_64",
    prefix: address.slice(0, 8),
  };
}

function parseAllowlist(value: string | undefined): AllowlistRule[] {
  if (!value) {
    return [];
  }
  return value
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(parseAllowlistRule)
    .filter((rule): rule is AllowlistRule => rule !== null);
}

export function isAllowlistedAgentIp(
  clientIp: string | null,
  configuredAllowlist: string | undefined,
): boolean {
  if (!clientIp) {
    return false;
  }
  const address = parseAddress(clientIp.trim());
  if (!address) {
    return false;
  }

  return parseAllowlist(configuredAllowlist).some((rule) => {
    if (rule.kind === "exact") {
      return (
        rule.address.family === address.family &&
        equalBytes(rule.address.bytes, address.bytes)
      );
    }
    return (
      address.family === 6 &&
      equalBytes(rule.prefix, address.bytes.slice(0, 8))
    );
  });
}

function normalizeTeamDomain(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !url.hostname.endsWith(".cloudflareaccess.com")
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export async function verifyAccessJwt(
  request: Request,
  env: McpAuthBindings,
): Promise<boolean> {
  if (!env.TEAM_DOMAIN || !env.POLICY_AUD) {
    return false;
  }
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) {
    return false;
  }

  const issuer = normalizeTeamDomain(env.TEAM_DOMAIN);
  if (!issuer) {
    return false;
  }
  let jwks = accessJwks.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${issuer}/cdn-cgi/access/certs`),
    );
    accessJwks.set(issuer, jwks);
  }

  try {
    await jwtVerify(token, jwks, {
      issuer,
      audience: env.POLICY_AUD,
      algorithms: ["RS256"],
    });
    return true;
  } catch {
    return false;
  }
}

export async function authorizeRequest(
  request: Request,
  env: McpAuthBindings,
): Promise<AuthorizationResult> {
  // Cloudflare overwrites these headers on direct edge requests. The IPv6
  // variant preserves the real address when Pseudo IPv4 overwrites the primary
  // header. Deliberately ignore X-Forwarded-For/X-Real-IP.
  const trustedEdgeCandidates = [
    request.headers.get("cf-connecting-ip"),
    request.headers.get("cf-connecting-ipv6"),
  ];
  if (
    trustedEdgeCandidates.some((candidate) =>
      isAllowlistedAgentIp(candidate, env.AGENT_IP_ALLOWLIST),
    )
  ) {
    return { authorized: true, method: "agent_ip" };
  }

  if (await verifyAccessJwt(request, env)) {
    return { authorized: true, method: "access_jwt" };
  }

  return {
    authorized: false,
    code: "ACCESS_DENIED",
    message:
      "需要有效的 Cloudflare Access JWT，或从已配置的可信 Agent IP 访问。",
  };
}
