/**
 * Zachytí e-maily, které aplikace odešle, místo SMTP (#475). Importuje se hned po `./env` a před
 * harnessem: transporter vzniká při importu `utils/email.ts`, takže SMTP proměnné a podvržený
 * `nodemailer.createTransport` musí existovat dřív (stejně jako v `utils/email.test.ts`).
 * Nic se neodesílá. Soubory bez tohoto importu e-maily dál jen simulují (prázdné SMTP z runneru).
 */
import { mock } from "node:test";
import nodemailer from "nodemailer";

export interface CapturedEmail {
  to: string;
  subject: string;
  text?: string;
  html: string;
}

export const sentEmails: CapturedEmail[] = [];

process.env.SMTP_HOST = "smtp.example.test";
process.env.SMTP_USER = "itest";
process.env.SMTP_PASS = "itest";

mock.method(nodemailer, "createTransport", () => ({
  sendMail: async (mail: CapturedEmail) => {
    sentEmails.push(mail);
    return { messageId: "itest" };
  },
}));
