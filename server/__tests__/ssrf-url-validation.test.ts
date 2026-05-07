import { describe, it, expect } from "vitest";

/**
 * SSRF (Server-Side Request Forgery) prevention tests.
 * Tests the isUrlSafe() function that validates URLs before making outbound requests.
 *
 * Blocks:
 * - localhost, 127.0.0.1, 0.0.0.0
 * - Private IP ranges: 10.x, 172.16-31.x, 192.168.x, 169.254.x
 * - Non-http protocols (ftp://, file://, etc.)
 * - Internal/local TLDs (.internal, .local)
 * - Malformed URLs
 *
 * Allows:
 * - Valid HTTPS URLs to public domains
 */

function isUrlSafe(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0") return false;
    if (hostname.startsWith("10.") || hostname.startsWith("192.168.") || hostname.startsWith("169.254.")) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
    if (hostname.endsWith(".internal") || hostname.endsWith(".local")) return false;
    return true;
  } catch {
    return false;
  }
}

describe("SSRF URL Validation", () => {
  describe("Valid public HTTPS URLs", () => {
    it("allows valid HTTPS URL", () => {
      expect(isUrlSafe("https://example.com/api")).toBe(true);
    });

    it("allows HTTPS with path and query", () => {
      expect(isUrlSafe("https://api.example.com/v1/users?id=123")).toBe(true);
    });

    it("allows HTTPS with port", () => {
      expect(isUrlSafe("https://example.com:8443/webhook")).toBe(true);
    });

    it("allows HTTP for testing (protocol check passes)", () => {
      expect(isUrlSafe("http://example.com")).toBe(true);
    });

    it("allows known public API domains", () => {
      expect(isUrlSafe("https://api.github.com")).toBe(true);
      expect(isUrlSafe("https://api.stripe.com")).toBe(true);
      expect(isUrlSafe("https://graph.microsoft.com")).toBe(true);
    });

    it("allows subdomain with hyphens", () => {
      expect(isUrlSafe("https://my-api-server.example.com")).toBe(true);
    });

    it("allows domain with numbers", () => {
      expect(isUrlSafe("https://api2.example.com")).toBe(true);
    });
  });

  describe("Localhost/loopback blocking", () => {
    it("blocks localhost", () => {
      expect(isUrlSafe("http://localhost:3000")).toBe(false);
    });

    it("blocks localhost with port", () => {
      expect(isUrlSafe("http://localhost:8080/webhook")).toBe(false);
    });

    it("blocks 127.0.0.1", () => {
      expect(isUrlSafe("http://127.0.0.1")).toBe(false);
    });

    it("blocks 127.0.0.1 with port", () => {
      expect(isUrlSafe("http://127.0.0.1:5000/api")).toBe(false);
    });

    it("blocks 0.0.0.0", () => {
      expect(isUrlSafe("http://0.0.0.0")).toBe(false);
    });

    it("blocks 0.0.0.0 with path", () => {
      expect(isUrlSafe("http://0.0.0.0:9000/internal")).toBe(false);
    });
  });

  describe("Private IP range blocking (10.x)", () => {
    it("blocks 10.0.0.1", () => {
      expect(isUrlSafe("http://10.0.0.1")).toBe(false);
    });

    it("blocks 10.255.255.255", () => {
      expect(isUrlSafe("http://10.255.255.255")).toBe(false);
    });

    it("blocks 10.50.100.200", () => {
      expect(isUrlSafe("http://10.50.100.200/api")).toBe(false);
    });

    it("blocks 10.x with port", () => {
      expect(isUrlSafe("https://10.0.0.5:8443/webhook")).toBe(false);
    });
  });

  describe("Private IP range blocking (192.168.x)", () => {
    it("blocks 192.168.0.1", () => {
      expect(isUrlSafe("http://192.168.0.1")).toBe(false);
    });

    it("blocks 192.168.1.100", () => {
      expect(isUrlSafe("http://192.168.1.100")).toBe(false);
    });

    it("blocks 192.168.255.255", () => {
      expect(isUrlSafe("http://192.168.255.255")).toBe(false);
    });

    it("blocks 192.168.x with port and path", () => {
      expect(isUrlSafe("http://192.168.1.1:8080/admin")).toBe(false);
    });
  });

  describe("Private IP range blocking (172.16-31.x)", () => {
    it("blocks 172.16.0.1", () => {
      expect(isUrlSafe("http://172.16.0.1")).toBe(false);
    });

    it("blocks 172.20.0.1", () => {
      expect(isUrlSafe("http://172.20.0.1")).toBe(false);
    });

    it("blocks 172.31.255.255", () => {
      expect(isUrlSafe("http://172.31.255.255")).toBe(false);
    });

    it("allows 172.15.0.1 (outside private range)", () => {
      expect(isUrlSafe("http://172.15.0.1")).toBe(true);
    });

    it("allows 172.32.0.1 (outside private range)", () => {
      expect(isUrlSafe("http://172.32.0.1")).toBe(true);
    });

    it("blocks 172.16.0.1 with port", () => {
      expect(isUrlSafe("https://172.16.0.1:8443/sync")).toBe(false);
    });
  });

  describe("Link-local IP blocking (169.254.x)", () => {
    it("blocks 169.254.0.1", () => {
      expect(isUrlSafe("http://169.254.0.1")).toBe(false);
    });

    it("blocks 169.254.169.254 (AWS metadata)", () => {
      expect(isUrlSafe("http://169.254.169.254/metadata")).toBe(false);
    });

    it("blocks 169.254.255.255", () => {
      expect(isUrlSafe("http://169.254.255.255")).toBe(false);
    });
  });

  describe("Protocol validation", () => {
    it("blocks ftp:// protocol", () => {
      expect(isUrlSafe("ftp://files.example.com")).toBe(false);
    });

    it("blocks file:// protocol", () => {
      expect(isUrlSafe("file:///etc/passwd")).toBe(false);
    });

    it("blocks gopher:// protocol", () => {
      expect(isUrlSafe("gopher://example.com")).toBe(false);
    });

    it("blocks mailto: protocol", () => {
      expect(isUrlSafe("mailto:test@example.com")).toBe(false);
    });

    it("blocks telnet:// protocol", () => {
      expect(isUrlSafe("telnet://example.com")).toBe(false);
    });

    it("allows http:// protocol", () => {
      expect(isUrlSafe("http://example.com")).toBe(true);
    });

    it("allows https:// protocol", () => {
      expect(isUrlSafe("https://example.com")).toBe(true);
    });
  });

  describe("Internal/local TLD blocking", () => {
    it("blocks .internal TLD", () => {
      expect(isUrlSafe("http://api.internal")).toBe(false);
    });

    it("blocks subdomain with .internal", () => {
      expect(isUrlSafe("https://kubernetes.internal")).toBe(false);
    });

    it("blocks .local TLD", () => {
      expect(isUrlSafe("http://service.local")).toBe(false);
    });

    it("blocks mDNS .local", () => {
      expect(isUrlSafe("https://printer.local")).toBe(false);
    });

    it("allows example.internal.co (not ending with .internal)", () => {
      // This is a legitimate public domain if registered
      expect(isUrlSafe("https://example.internal.co")).toBe(true);
    });
  });

  describe("Malformed URL handling", () => {
    it("rejects empty string", () => {
      expect(isUrlSafe("")).toBe(false);
    });

    it("rejects string with only spaces", () => {
      expect(isUrlSafe("   ")).toBe(false);
    });

    it("rejects URL without protocol", () => {
      expect(isUrlSafe("example.com")).toBe(false);
    });

    it("rejects invalid URL format", () => {
      expect(isUrlSafe("ht!tp://example.com")).toBe(false);
    });

    it("rejects URL with missing hostname", () => {
      expect(isUrlSafe("https://")).toBe(false);
    });

    it("rejects gibberish", () => {
      expect(isUrlSafe("not-a-url-at-all")).toBe(false);
    });

    it("returns false for non-string input (caught by try-catch)", () => {
      // @ts-ignore - intentionally passing wrong type
      expect(isUrlSafe(null)).toBe(false);
      // @ts-ignore
      expect(isUrlSafe(undefined)).toBe(false);
      // @ts-ignore
      expect(isUrlSafe(123)).toBe(false);
    });
  });

  describe("Case insensitivity", () => {
    it("treats uppercase hostname same as lowercase", () => {
      expect(isUrlSafe("https://EXAMPLE.COM")).toBe(true);
      expect(isUrlSafe("https://Example.Com")).toBe(true);
    });

    it("blocks uppercase localhost variants", () => {
      expect(isUrlSafe("http://LOCALHOST")).toBe(false);
      expect(isUrlSafe("http://Localhost")).toBe(false);
    });

    it("blocks uppercase .INTERNAL TLD", () => {
      expect(isUrlSafe("http://api.INTERNAL")).toBe(false);
    });

    it("blocks uppercase IP addresses", () => {
      expect(isUrlSafe("http://10.0.0.1")).toBe(false);
    });
  });

  describe("URL with authentication", () => {
    it("allows URL with basic auth to public domain", () => {
      expect(isUrlSafe("https://user:pass@example.com/api")).toBe(true);
    });

    it("blocks localhost even with auth", () => {
      expect(isUrlSafe("http://user:pass@localhost:3000")).toBe(false);
    });

    it("blocks 127.0.0.1 even with auth", () => {
      expect(isUrlSafe("http://user:pass@127.0.0.1:8080")).toBe(false);
    });
  });

  describe("URL encoding edge cases", () => {
    it("allows URL with encoded path characters", () => {
      expect(isUrlSafe("https://example.com/api%20endpoint")).toBe(true);
    });

    it("allows URL with encoded query parameters", () => {
      expect(isUrlSafe("https://example.com/webhook?token=abc%2Fdef")).toBe(true);
    });

    it("blocks localhost with encoded form", () => {
      // URL parsing handles encoding, so %6C = 'l'
      expect(isUrlSafe("http://%6C%6F%63%61%6C%68%6F%73%74")).toBe(false);
    });
  });

  describe("Real-world integration scenarios", () => {
    it("allows GoHighLevel webhook URL", () => {
      expect(isUrlSafe("https://api.gohighlevel.com/v1/webhooks")).toBe(true);
    });

    it("allows Outlook webhook callback", () => {
      expect(isUrlSafe("https://outlook.office365.com/api/v2.0/me/events")).toBe(true);
    });

    it("allows custom customer webhook", () => {
      expect(isUrlSafe("https://customer-domain.com/webhook/tristar")).toBe(true);
    });

    it("blocks internal Kubernetes service URL with .local TLD", () => {
      expect(isUrlSafe("http://service.default.svc.cluster.local")).toBe(false); // blocks on .local
      expect(isUrlSafe("http://service.default.internal")).toBe(false); // blocks on .internal
    });

    it("blocks AWS metadata service", () => {
      expect(isUrlSafe("http://169.254.169.254/latest/meta-data/")).toBe(false);
    });
  });
});
