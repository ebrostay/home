import { describe, expect, it } from "vitest";
import { loginUrl, logoutUrl, localeHome, PROVIDER } from "./auth";

describe("loginUrl", () => {
  it("targets the single Ebrostay provider", () => {
    expect(loginUrl("/es/")).toContain(`/.auth/login/${PROVIDER}`);
  });

  it("encodes the return path so query strings survive the round trip", () => {
    expect(loginUrl("/es/property?id=abc&x=1")).toBe(
      "/.auth/login/ebrostay?post_login_redirect_uri=%2Fes%2Fproperty%3Fid%3Dabc%26x%3D1",
    );
  });
});

describe("logoutUrl", () => {
  it("encodes the return path", () => {
    expect(logoutUrl("/en/")).toBe(
      "/.auth/logout?post_logout_redirect_uri=%2Fen%2F",
    );
  });
});

describe("localeHome", () => {
  // Sign-out must land somewhere public: the browser is anonymous by the time
  // it arrives, and every /host, /account and /admin route is behind
  // allowedRoles, which answers 403 rather than redirecting to login.
  it("returns a locale-prefixed root for each supported locale", () => {
    expect(localeHome("es")).toBe("/es/");
    expect(localeHome("en")).toBe("/en/");
  });
});
