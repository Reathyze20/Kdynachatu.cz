import "./env"; // musí zůstat první import
import { mailOutage, sentEmails } from "./mailCapture"; // před harnessem, aby e-mail.ts dostal zachytávací transport
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import request from "supertest";
import prisma from "../../utils/prisma";
import logger from "../../utils/logger";
import { setupIntegrationFile, teardownIntegrationFile } from "./harness";

// Waitlist z landing page (#696, spec #692): veřejný zápis bez přihlášení. Duplicitní e-mail ani vyplněný
// honeypot neprozradí nic jiného než úspěch, výpadek e-mailu ani chybějící adresy zápis neshodí.

const CONTACT = "ahoj@example.test";
const NOTIFY = "spravce@example.test";

let app: Express;
let counter = 0;
const warnings: string[] = [];
const originalWarn = logger.warn;

before(async () => {
  ({ app } = await setupIntegrationFile());
  logger.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
});

beforeEach(async () => {
  sentEmails.length = 0;
  warnings.length = 0;
  mailOutage.fail = false;
  process.env.WAITLIST_CONTACT_EMAIL = CONTACT;
  process.env.WAITLIST_NOTIFY_EMAIL = NOTIFY;
  await prisma.waitlistSignup.deleteMany();
});

after(async () => {
  logger.warn = originalWarn;
  await teardownIntegrationFile();
});

const uniqueEmail = () => `zajemce-${++counter}@example.test`;
const signUp = (body: Record<string, unknown>) => request(app).post("/api/waitlist").send(body);
const validBody = (extra: Record<string, unknown> = {}) => ({ email: uniqueEmail(), segment: "rodina", consent: true, ...extra });
const rows = () => prisma.waitlistSignup.findMany();

describe("POST /api/waitlist: signing up", () => {
  test("saves the signup without login, e-mail lower-cased, ref trimmed and cleaned", async () => {
    const res = await signUp({ email: "  Jana.Novak@Example.TEST ", segment: "spolek", consent: true, ref: "  fb-skupina<b> " });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    const [signup] = await rows();
    assert.equal(signup.email, "jana.novak@example.test");
    assert.equal(signup.segment, "spolek");
    assert.equal(signup.ref, "fb-skupinab");
    assert.ok(signup.consentedAt instanceof Date);
  });

  test("only the required fields: optional answers stay empty", async () => {
    assert.equal((await signUp(validBody())).status, 200);
    const [signup] = await rows();
    assert.equal(signup.ref, null);
    assert.equal(signup.households, null);
    assert.equal(signup.willingnessToPay, null);
    assert.equal(signup.painPoint, null);
    assert.equal(signup.rentalIntent, null);
    assert.deepEqual(signup.rentalNeeds, []);
  });

  test("ref is cut to 64 characters, an empty ref is not saved", async () => {
    assert.equal((await signUp(validBody({ ref: "x".repeat(5000) }))).status, 200);
    assert.equal((await signUp(validBody({ ref: "  <>  " }))).status, 200);
    const refs = (await rows()).map((row) => row.ref).sort();
    assert.deepEqual(refs, ["x".repeat(64), null].sort());
  });
});

describe("POST /api/waitlist: validation", () => {
  const consentMessage = "Bez souhlasu tě na seznam zapsat nemůžeme.";
  const invalid: [string, Record<string, unknown>, string, string][] = [
    ["an invalid e-mail", { email: "neni-email", segment: "rodina", consent: true }, "email", "Zadej platný e-mail."],
    ["a missing consent", { email: "a@example.test", segment: "rodina" }, "consent", consentMessage],
    ["a refused consent", { email: "a@example.test", segment: "rodina", consent: false }, "consent", consentMessage],
    ["an unknown segment", { email: "a@example.test", segment: "skola", consent: true }, "segment", "Vyber, kdo jsi."],
  ];

  for (const [name, body, field, message] of invalid) {
    test(`${name} → 400 with a Czech message at the field, nothing saved or sent`, async () => {
      const res = await signUp(body);
      assert.equal(res.status, 400);
      const issue = res.body.errors.find((e: { path: string }) => e.path === field);
      assert.equal(issue?.message, message, `chyba u pole ${field}`);
      assert.equal((await rows()).length, 0);
      assert.equal(sentEmails.length, 0);
    });
  }
});

describe("POST /api/waitlist: duplicates and bots", () => {
  test("a duplicate e-mail gets the same answer, keeps the first signup and sends nothing", async () => {
    const first = await signUp({ email: "dvakrat@example.test", segment: "rodina", consent: true });
    sentEmails.length = 0;
    const second = await signUp({ email: "DvaKrat@example.test", segment: "firma", consent: true, ref: "jinde" });

    assert.equal(second.status, first.status);
    assert.deepEqual(second.body, first.body);
    const all = await rows();
    assert.equal(all.length, 1);
    assert.equal(all[0].segment, "rodina");
    assert.equal(all[0].ref, null);
    assert.equal(sentEmails.length, 0);
  });

  test("a filled honeypot gets the same answer, nothing is saved or sent", async () => {
    const res = await signUp(validBody({ website: "https://spam.example.test" }));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal((await rows()).length, 0);
    assert.equal(sentEmails.length, 0);
  });

  test("a filled honeypot gets the same answer even with otherwise invalid input", async () => {
    const res = await signUp({ email: "neni-email", website: "https://spam.example.test" });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal((await rows()).length, 0);
  });
});

describe("POST /api/waitlist: e-mails", () => {
  test("the visitor gets one confirmation with reply-to the contact address, the admin gets all fields and the ref", async () => {
    const email = uniqueEmail();
    assert.equal((await signUp({ email, segment: "pronajimatel", consent: true, ref: "pronajimatele" })).status, 200);

    assert.equal(sentEmails.length, 2);
    const confirmation = sentEmails.find((mail) => mail.to === email);
    assert.ok(confirmation, "potvrzení návštěvníkovi");
    assert.equal(confirmation.replyTo, CONTACT);
    assert.match(confirmation.text ?? "", /Díky, jsi na seznamu\. Odpověz mi na tenhle e-mail, jak to u tebe na chatě funguje\./);
    assert.match(confirmation.text ?? "", /smaž/i, "informace o smazání na žádost");

    const notice = sentEmails.find((mail) => mail.to === NOTIFY);
    assert.ok(notice, "upozornění správci");
    for (const value of [email, "Pronajímám chatu", "pronajimatele"]) {
      assert.ok(notice.text?.includes(value), `upozornění obsahuje ${value}`);
    }
  });

  test("without configured addresses the signup is saved, e-mails are skipped with a warning", async () => {
    delete process.env.WAITLIST_CONTACT_EMAIL;
    delete process.env.WAITLIST_NOTIFY_EMAIL;
    const res = await signUp(validBody());

    assert.equal(res.status, 200);
    assert.equal((await rows()).length, 1);
    assert.equal(sentEmails.length, 0);
    assert.ok(warnings.some((msg) => /WAITLIST_CONTACT_EMAIL/.test(msg)), "varování o chybějící kontaktní adrese");
    assert.ok(warnings.some((msg) => /WAITLIST_NOTIFY_EMAIL/.test(msg)), "varování o chybějící adrese pro upozornění");
  });

  test("a mailer failure does not fail the signup, the signup stays saved", async () => {
    mailOutage.fail = true;
    const res = await signUp(validBody());
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal((await rows()).length, 1);
  });
});

// #699: dobrovolné otázky (domácnosti, ochota platit, co štve, pronájem). Potřeby pronájmu se uloží jen při
// „Občas“ nebo „Ano“, jinak je server zahodí.
describe("POST /api/waitlist: optional questions (#699)", () => {
  test("saves all optional answers, pain point trimmed, rental needs deduplicated", async () => {
    const res = await signUp(validBody({
      households: "3-4",
      willingnessToPay: "500-1000",
      painPoint: "  Nikdo neví, kdo má klíče.  ",
      rentalIntent: "obcas",
      rentalNeeds: ["zalohy-platby", "rezervace-hostu", "zalohy-platby"],
    }));

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    const [signup] = await rows();
    assert.equal(signup.households, "3-4");
    assert.equal(signup.willingnessToPay, "500-1000");
    assert.equal(signup.painPoint, "Nikdo neví, kdo má klíče.");
    assert.equal(signup.rentalIntent, "obcas");
    assert.deepEqual([...signup.rentalNeeds].sort(), ["rezervace-hostu", "zalohy-platby"]);
  });

  test("every rental need is accepted with intent „ano“, a 1000-character pain point too", async () => {
    const needs = ["rezervace-hostu", "zalohy-platby", "predani-klicu", "uklid-mezi-hosty", "kalendar-booking-airbnb", "rozpocitani-prijmu"];
    const res = await signUp(validBody({ rentalIntent: "ano", rentalNeeds: needs, painPoint: "x".repeat(1000) }));

    assert.equal(res.status, 200);
    const [signup] = await rows();
    assert.deepEqual([...signup.rentalNeeds].sort(), [...needs].sort());
    assert.equal(signup.painPoint?.length, 1000);
  });

  test("rental needs are dropped when the intent is „ne“ or missing", async () => {
    const needs = ["zalohy-platby"];
    assert.equal((await signUp(validBody({ rentalIntent: "ne", rentalNeeds: needs }))).status, 200);
    assert.equal((await signUp(validBody({ rentalNeeds: needs }))).status, 200);

    const all = await rows();
    assert.equal(all.length, 2);
    for (const signup of all) assert.deepEqual(signup.rentalNeeds, []);
    assert.deepEqual(all.map((s) => s.rentalIntent).sort(), ["ne", null].sort());
  });

  test("empty or null optional answers are saved as unanswered", async () => {
    const res = await signUp(validBody({ households: null, willingnessToPay: "", painPoint: "   ", rentalIntent: "", rentalNeeds: [] }));

    assert.equal(res.status, 200);
    const [signup] = await rows();
    assert.equal(signup.households, null);
    assert.equal(signup.willingnessToPay, null);
    assert.equal(signup.painPoint, null);
    assert.equal(signup.rentalIntent, null);
    assert.deepEqual(signup.rentalNeeds, []);
  });

  const invalid: [string, Record<string, unknown>, string, string][] = [
    ["an unknown household count", { households: "10" }, "households", "Vyber počet domácností z nabídky."],
    ["an unknown willingness to pay", { willingnessToPay: "milion" }, "willingnessToPay", "Vyber částku z nabídky."],
    ["an unknown rental intent", { rentalIntent: "mozna" }, "rentalIntent", "Vyber odpověď z nabídky."],
    ["an unknown rental need", { rentalIntent: "ano", rentalNeeds: ["sauna"] }, "rentalNeeds", "Vyber jen z nabízených možností."],
    ["a too long pain point", { painPoint: "x".repeat(1001) }, "painPoint", "Text může mít nejvýš 1000 znaků."],
  ];

  for (const [name, extra, field, message] of invalid) {
    test(`${name} → 400 with a Czech message at the field, nothing saved or sent`, async () => {
      const res = await signUp(validBody(extra));
      assert.equal(res.status, 400);
      const issue = res.body.errors.find((e: { path: string }) => e.path.split(".")[0] === field);
      assert.equal(issue?.message, message, `chyba u pole ${field}`);
      assert.equal((await rows()).length, 0);
      assert.equal(sentEmails.length, 0);
    });
  }

  test("the admin notice lists every filled optional answer incl. rental needs, in words", async () => {
    const res = await signUp(validBody({
      households: "5+",
      willingnessToPay: "nad-1000",
      painPoint: "Dohadování o víkendy",
      rentalIntent: "ano",
      rentalNeeds: ["predani-klicu", "kalendar-booking-airbnb"],
    }));
    assert.equal(res.status, 200);

    const notice = sentEmails.find((mail) => mail.to === NOTIFY);
    assert.ok(notice, "upozornění správci");
    for (const value of [
      "5 a víc",
      "Přes 1 000 Kč",
      "Dohadování o víkendy",
      "Ano, hlavně kvůli pronájmu",
      "Instrukce a předání klíčů hostům",
      "Propojení s kalendářem Booking/Airbnb",
    ]) {
      assert.ok(notice.text?.includes(value), `upozornění obsahuje ${value}`);
    }
  });

  test("the admin notice leaves out rental needs dropped with intent „ne“", async () => {
    assert.equal((await signUp(validBody({ rentalIntent: "ne", rentalNeeds: ["zalohy-platby"] }))).status, 200);

    const notice = sentEmails.find((mail) => mail.to === NOTIFY);
    assert.ok(notice, "upozornění správci");
    assert.ok(notice.text?.includes("Pronájem cizím: Ne"), "záměr pronájmu Ne");
    assert.ok(!notice.text?.includes("Zálohy a platby"), "zahozené potřeby v upozornění nejsou");
  });
});
