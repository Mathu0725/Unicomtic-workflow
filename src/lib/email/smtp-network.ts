import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { ProviderError } from "../errors/provider-error";

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const)
  blocked.addSubnet(network, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [network, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const)
  blocked.addSubnet(network, prefix, "ipv6");
export function publicSmtpAddress(address: string) {
  const family = isIP(address);
  return family === 4
    ? !blocked.check(address, "ipv4")
    : family === 6 &&
        globalV6.check(address, "ipv6") &&
        !blocked.check(address, "ipv6");
}
export async function resolveSmtpHost(host: string) {
  const denied = () =>
    new ProviderError(
      "SMTP_HOST_BLOCKED",
      "SMTP must use a public mail server. Internal, reserved and metadata addresses are not allowed.",
      "blocked",
    );
  if (
    !/^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z\d-]+$/i.test(host) ||
    /\.(?:localhost|local|internal|invalid|test)$/i.test(host)
  )
    throw denied();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([
      lookup(host, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new ProviderError(
                "SMTP_DNS_TIMEOUT",
                "SMTP hostname lookup timed out. Check the host and retry.",
                "temporary",
              ),
            ),
          5000,
        );
      }),
    ]);
    if (
      !addresses.length ||
      addresses.some((item) => !publicSmtpAddress(item.address))
    )
      throw denied();
    // Connect to this validated IP, not the hostname, to prevent DNS rebinding.
    return addresses[0].address;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(
      "SMTP_DNS_FAILED",
      "SMTP hostname could not be resolved. Check the public mail-server hostname.",
      "temporary",
    );
  } finally {
    clearTimeout(timer);
  }
}
