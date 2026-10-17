import { describe, expect, it } from "vitest";
import { checkBetaAccess, parseBetaUsers } from "@/lib/beta-access";

const basic = (login: string, password: string) => `Basic ${btoa(`${login}:${password}`)}`;

describe("beta access", () => {
  const users = parseBetaUsers("alice:s3cret, bob:pa:ss ,broken,:nologin");

  it("parses login:password pairs and skips malformed ones", () => {
    expect([...users.entries()]).toEqual([
      ["alice", "s3cret"],
      ["bob", "pa:ss"],
    ]);
  });

  it("allows known testers with the right password", () => {
    expect(checkBetaAccess(basic("alice", "s3cret"), users, true)).toBe("allow");
    expect(checkBetaAccess(basic("bob", "pa:ss"), users, true)).toBe("allow");
  });

  it("challenges everyone else", () => {
    expect(checkBetaAccess(null, users, true)).toBe("challenge");
    expect(checkBetaAccess(basic("alice", "wrong"), users, true)).toBe("challenge");
    expect(checkBetaAccess(basic("mallory", "s3cret"), users, true)).toBe("challenge");
    expect(checkBetaAccess("Basic !!!", users, true)).toBe("challenge");
  });

  it("is open in development and closed in production without testers", () => {
    const none = parseBetaUsers(undefined);
    expect(checkBetaAccess(null, none, false)).toBe("allow");
    expect(checkBetaAccess(null, none, true)).toBe("closed");
  });
});
