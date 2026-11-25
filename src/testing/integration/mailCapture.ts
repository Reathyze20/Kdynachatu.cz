// Zachytí odeslané e-maily místo SMTP (#475). Importovat hned po `./env`: transporter vzniká při importu
// `utils/email.ts`, takže SMTP proměnné a podvržený createTransport musí být dřív (jako v email.test.ts).
import { mock } from "node:test";
import nodemailer from "nodemailer";

export const sentEmails: { to: string; subject: string; text?: string; html: string }[] = [];

Object.assign(process.env, { SMTP_HOST: "smtp.example.test", SMTP_USER: "itest", SMTP_PASS: "itest" });
mock.method(nodemailer, "createTransport", () => ({
  sendMail: async (mail: (typeof sentEmails)[number]) => (sentEmails.push(mail), { messageId: "itest" }),
}));
