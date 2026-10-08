import { describe, it, expect } from "vitest";
import { MASK, isSecretName, looksSecret, maskSecrets } from "./mask.js";
import { jsonResult } from "./types.js";

const LIVE = "sk_live_" + "Ab1".repeat(30);

// The waldfreunde shape (2026-10-08): a live Stripe key nested in webhook_data.secret.
const stripeSettings = {
  enabled: "yes",
  testmode: "no",
  title: "Kreditkarte",
  publishable_key: "pk_live_abc",
  secret_key: LIVE,
  webhook_data: { id: "we_123", secret: LIVE },
  upe_json: JSON.stringify({ secret: "plainvalue-no-shape", mode: "live" }),
  cert: "-----BEGIN CERTIFICATE-----\nMIIBxx\n-----END CERTIFICATE-----",
  password: "",
};

describe("maskSecrets", () => {
  it("masks the nested Stripe key and keeps everything else", () => {
    const out = maskSecrets({ key: "woocommerce_stripe_settings", value: stripeSettings }) as {
      value: Record<string, unknown> & { webhook_data: Record<string, unknown> };
    };
    const json = JSON.stringify(out);
    expect(json).not.toContain("sk_live_");
    expect(json).not.toContain("plainvalue-no-shape");
    expect(json).not.toContain("MIIBxx");
    expect(out.value.webhook_data).toEqual({ id: "we_123", secret: MASK });
    expect(out.value.secret_key).toBe(MASK);
    expect(out.value.title).toBe("Kreditkarte");
    expect(out.value.publishable_key).toBe("pk_live_abc");
    expect(out.value.password).toBe("");
    expect(JSON.parse(out.value.upe_json as string)).toEqual({ secret: MASK, mode: "live" });
  });

  it("masks a credential shape under any name and leaves plain values", () => {
    expect(maskSecrets({ note: "ghp_" + "a".repeat(36), city: "Bonn" })).toEqual({ note: MASK, city: "Bonn" });
    expect(maskSecrets(["whsec_" + "z".repeat(24), "ok"])).toEqual([MASK, "ok"]);
  });

  it("keeps flag-like values under secret names visible", () => {
    expect(maskSecrets({ api_key: "yes", token: "0", secret: "abc123" })).toEqual({ api_key: "yes", token: "0", secret: MASK });
  });

  it("leaves a JSON string without secrets byte-identical", () => {
    const s = '{"a": 1,  "b": "x"}';
    expect(maskSecrets({ v: s })).toEqual({ v: s });
  });

  it("does not mutate its input", () => {
    const input = { secret: "abc123" };
    maskSecrets(input);
    expect(input.secret).toBe("abc123");
  });

  it.each([
    ["cvrt_legal_github_token", true],
    ["erecht24_api_key", true],
    ["smtp_password", true],
    ["client_secret", true],
    ["whsec", true],
    ["webhook_signing_key", true],
    ["auth_salt", true],
    ["key", false],
    ["api_version", false],
    ["publishable_key", false],
    ["blogname", false],
    ["active_plugins", false],
  ])("isSecretName(%s) = %s", (name, expected) => {
    expect(isSecretName(name)).toBe(expected);
  });

  it("recognises credential shapes", () => {
    expect(looksSecret(LIVE)).toBe(true);
    expect(looksSecret("rk_live_" + "x".repeat(20))).toBe(true);
    expect(looksSecret("-----BEGIN OPENSSH PRIVATE KEY-----")).toBe(true);
    expect(looksSecret("hello world")).toBe(false);
  });
});

describe("jsonResult masks every tool result", () => {
  it("never prints the nested Stripe key", () => {
    const text = jsonResult({ key: "woocommerce_stripe_settings", value: stripeSettings }).content[0].text;
    expect(text).not.toContain("sk_live_");
    expect(text).toContain('"secret":"[masked]"');
  });
});
