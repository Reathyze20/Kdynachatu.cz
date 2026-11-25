import { test, describe, before, mock } from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";

// config.ts ukončí proces bez JWT_SECRET a DATABASE_URL; SMTP_* zapnou transporter.
// dotenv existující klíč nepřepíše, takže lokální .env test neovlivní.
process.env.JWT_SECRET ||= "test-secret-for-email-unit-tests-0123456789";
process.env.DATABASE_URL ||= "postgresql://unit:unit@127.0.0.1:1/unit_tests_never_connect";
process.env.SMTP_HOST = "smtp.example.test";
process.env.SMTP_USER = "test";
process.env.SMTP_PASS = "test";
process.env.EMAIL_FROM = "";

type SentMail = { to: string; subject: string; text: string; html: string };
const sent: SentMail[] = [];

let email: typeof import("./email");

before(async () => {
  // Transporter vzniká při importu email.ts, proto mock před dynamickým importem. Nic se neodesílá.
  mock.method(nodemailer, "createTransport", () => ({
    sendMail: async (mail: SentMail) => {
      sent.push(mail);
      return { messageId: "test" };
    },
  }));
  email = await import("./email");
});

describe("e-mails use the app name „Kdy na chatu“", () => {
  const cases: Array<[string, () => Promise<unknown>]> = [
    ["password reset", () => email.sendPasswordResetEmail("a@example.test", "tok")],
    ["account verification", () => email.sendVerificationEmailWithToken("a@example.test", "tok")],
    ["superadmin onboarding", () => email.sendSuperadminOnboardingEmail("a@example.test", "tok", "Temp-Pass-123")],
  ];

  for (const [name, send] of cases) {
    test(`${name}: subject and footer`, async () => {
      sent.length = 0;
      await send();
      assert.equal(sent.length, 1);
      assert.match(sent[0].subject, /— Kdy na chatu$/);
      assert.ok(sent[0].html.includes("Kdy na chatu — Rodinná aplikace pro správu chaty"));
      assert.ok(sent[0].text.includes("Kdy na chatu"));
    });
  }
});

describe("e-mail change notice to the old address (#475)", () => {
  test("goes to the old address, names the new one and the app", async () => {
    sent.length = 0;
    await email.sendEmailChangedNotice("stara@example.test", { username: "jana", newEmail: "nova@example.test" });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "stara@example.test");
    assert.match(sent[0].subject, /— Kdy na chatu$/);
    for (const body of [sent[0].html, sent[0].text]) {
      assert.ok(body.includes("nova@example.test"));
      assert.ok(body.includes("jana"));
      assert.match(body, /Pokud o změně nevíš/);
    }
    assert.ok(sent[0].html.includes("Kdy na chatu — Rodinná aplikace pro správu chaty"));
  });

  test("escapes interpolated values in the HTML", async () => {
    sent.length = 0;
    await email.sendEmailChangedNotice("stara@example.test", { username: "<img src=x onerror=alert(1)>", newEmail: "a\"<b>@example.test" });
    const { html } = sent[0];
    assert.ok(!html.includes("<img"), "jméno se nevloží jako HTML");
    assert.ok(!html.includes("<b>"), "adresa se nevloží jako HTML");
    assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
    assert.ok(html.includes("a&quot;&lt;b&gt;@example.test"));
  });

  test("a removed e-mail says the account has no address now", async () => {
    sent.length = 0;
    await email.sendEmailChangedNotice("stara@example.test", { username: "jana", newEmail: null });
    assert.match(sent[0].text, /odebr/);
    assert.ok(!sent[0].text.includes("null"));
  });
});
