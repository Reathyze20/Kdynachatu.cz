// Zachytí odeslané e-maily místo SMTP (#475). Importovat hned po `./env`: transporter vzniká při importu
// `utils/email.ts`, takže SMTP proměnné a podvržený createTransport musí být dřív (jako v email.test.ts).
import { mock } from "node:test";
import nodemailer from "nodemailer";

export const sentEmails: { to: string; subject: string; text?: string; html: string; replyTo?: string }[] = [];

/** Výpadek SMTP (#696): dokud je `fail` true, odeslání e-mailu vyhodí chybu. */
export const mailOutage = { fail: false };

Object.assign(process.env, { SMTP_HOST: "smtp.example.test", SMTP_USER: "itest", SMTP_PASS: "itest" });
mock.method(nodemailer, "createTransport", () => ({
  sendMail: async (mail: (typeof sentEmails)[number]) => {
    if (mailOutage.fail) throw new Error("SMTP je nedostupné (itest)");
    sentEmails.push(mail);
    return { messageId: "itest" };
  },
}));
