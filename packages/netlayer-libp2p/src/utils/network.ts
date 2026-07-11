const isIPv4Address = (host: string): boolean => {
  return /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.test(host);
};

const isIPv6Address = (host: string): boolean => {
  // IPv6 addresses consist only of hex digits and colons, and always contain
  // at least one colon. DNS hostnames never contain colons, so requiring one
  // prevents an all-hex hostname like 'fdcafe' from matching the fc/fd prefix
  // checks in isPrivateAddress.
  return /^[0-9a-f]*:[0-9a-f:]+$/u.test(host);
};

/**
 * Returns true if the given host is a private/loopback address.
 * Covers IPv4 loopback per RFC 1122 §3.2.1.3 (127.0.0.0/8), IPv4 private
 * ranges per RFC 1918, IPv6 loopback per RFC 4291 §2.5.3 (::1), IPv6
 * unique-local per RFC 4193 (fc00::/7), and IPv6 link-local (fe80::/64 —
 * the practical subset of the RFC 4291 §2.5.6 fe80::/10 range).
 *
 * @param host - The hostname or IP address to check.
 * @returns True if the host is a private or loopback address.
 */
export function isPrivateAddress(host: string): boolean {
  if (host === 'localhost' || host === '::1') {
    return true; // ::1 loopback per RFC 4291 §2.5.3
  }
  const lower = host.toLowerCase();
  if (
    isIPv6Address(lower) &&
    (lower.startsWith('fc') ||
      lower.startsWith('fd') || // fc00::/7 unique-local per RFC 4193
      lower.startsWith('fe80:')) // fe80::/64 link-local (RFC 4291 §2.5.6 defines /10 but bits 11-64 are always zero in practice)
  ) {
    return true;
  }
  if (!isIPv4Address(host)) {
    return false;
  }
  const octets = host.split('.').map(Number);
  if (octets.some((octet) => octet > 255)) {
    return false;
  }
  const [p0, p1] = octets as [number, number, number, number];
  return (
    p0 === 127 || // 127.0.0.0/8  loopback per RFC 1122 §3.2.1.3
    p0 === 10 || // 10.0.0.0/8   private per RFC 1918
    (p0 === 172 && p1 >= 16 && p1 <= 31) || // 172.16.0.0/12 private per RFC 1918
    (p0 === 192 && p1 === 168) // 192.168.0.0/16 private per RFC 1918
  );
}
