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

type SentMail = { subject: string; text: string; html: string };
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
