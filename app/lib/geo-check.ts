const NZ_IP_RANGES: { start: number; end: number }[] = [];

function ipToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return 0;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function isNzIp(ip: string): boolean {
  if (ip === "unknown" || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return true;
  }
  const intIp = ipToInt(ip);
  if (intIp === 0) return true;
  for (const range of NZ_IP_RANGES) {
    if (intIp >= range.start && intIp <= range.end) return false;
  }
  return false;
}

export function parseIpFromRequest(headers: Headers): string {
  const xForwardedFor = headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const first = xForwardedFor.split(",")[0].trim();
    if (first) return first;
  }
  const xRealIp = headers.get("x-real-ip");
  if (xRealIp) return xRealIp;
  return "unknown";
}
