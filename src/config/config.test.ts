import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// config.ts ukončí proces bez JWT_SECRET a DATABASE_URL – nastavit před dynamickým importem.
process.env.JWT_SECRET ||= "test-secret-for-config-unit-tests-0123456789";
process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
// Prázdná hodnota = výchozí odesílatel. dotenv existující klíč nepřepíše, takže lokální .env test neovlivní.
process.env.EMAIL_FROM = "";

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OLD_DOMAIN = "chataceskestredohori.cz";

let config: typeof import("./config");

before(async () => {
  config = await import("./config");
});

describe("e-mail sender", () => {
  test("default EMAIL_FROM sends from noreply@kdynachatu.cz", () => {
    assert.equal(config.EMAIL_FROM, '"Kdy na chatu" <noreply@kdynachatu.cz>');
  });

  for (const file of ["config/config.ts", "utils/email.ts"]) {
    test(`${file} does not mention the expired domain ${OLD_DOMAIN}`, () => {
      const source = readFileSync(path.join(srcDir, file), "utf8");
      assert.equal(source.includes(OLD_DOMAIN), false);
    });
  }
});

describe("CABIN_SIGNUP_ENABLED", () => {
  test("outside production signup is open when the variable is not set", () => {
    assert.equal(config.resolveCabinSignupEnabled(undefined, "development"), true);
    assert.equal(config.resolveCabinSignupEnabled(undefined, undefined), true);
    assert.equal(config.resolveCabinSignupEnabled("", "test"), true);
  });

  test("outside production an explicit false closes signup", () => {
    assert.equal(config.resolveCabinSignupEnabled("false", "development"), false);
    assert.equal(config.resolveCabinSignupEnabled("0", undefined), false);
  });

  test("in production signup is closed unless explicitly enabled", () => {
    assert.equal(config.resolveCabinSignupEnabled(undefined, "production"), false);
    assert.equal(config.resolveCabinSignupEnabled("", "production"), false);
    assert.equal(config.resolveCabinSignupEnabled("false", "production"), false);
    assert.equal(config.resolveCabinSignupEnabled("nonsense", "production"), false);
  });

  test("in production an explicit true opens signup", () => {
    assert.equal(config.resolveCabinSignupEnabled("true", "production"), true);
    assert.equal(config.resolveCabinSignupEnabled(" TRUE ", "production"), true);
  });
});
