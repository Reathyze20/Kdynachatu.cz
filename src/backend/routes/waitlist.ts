/**
 * POST /api/waitlist — veřejný zápis zájemce z landing page (#696, spec #692). Bez přihlášení, není to data
 * chaty (žádné cabinId). Vstup validuje `waitlistSignupSchema`, rate limit na IP nastavuje app.ts.
 *
 * Odpověď je vždy stejná `{ ok: true }`: duplicitní e-mail ani vyplněný honeypot nesmí prozradit, že se
 * nic neuložilo. E-maily jsou vedlejší: chybějící adresa nebo výpadek maileru zápis neshodí, jen se zaloguje.
 */
import type { Request, Response } from "express";
import type { z } from "zod";
import prisma from "../../utils/prisma";
import logger from "../../utils/logger";
import { waitlistEmails } from "../../config/config";
import { sendWaitlistAdminNotice, sendWaitlistConfirmationEmail, type WaitlistSignupEmailData } from "../../utils/email";
import type { waitlistSignupSchema } from "../../validators/schemas";
import type { WaitlistSignupResponse } from "../../types";

const OK: WaitlistSignupResponse = { ok: true };

/** Pošle jeden e-mail k zápisu; bez adresy ho přeskočí s varováním, chybu maileru jen zaloguje. */
async function trySend(kind: string, address: string, variable: string, signupId: string, send: (address: string) => Promise<void>) {
  if (!address) {
    logger.warn("WAITLIST", `Waitlist ${kind} skipped: ${variable} is not set`, { signupId });
    return;
  }
  try {
    await send(address);
  } catch (error) {
    logger.error("WAITLIST", `Waitlist ${kind} could not be sent, the signup is saved`, { signupId, error: String(error) });
  }
}

async function sendWaitlistEmails(signup: WaitlistSignupEmailData, signupId: string): Promise<void> {
  const { contactEmail, notifyEmail } = waitlistEmails();
  await trySend("confirmation", contactEmail, "WAITLIST_CONTACT_EMAIL", signupId, (contact) =>
    sendWaitlistConfirmationEmail(signup.email, contact));
  await trySend("admin notice", notifyEmail, "WAITLIST_NOTIFY_EMAIL", signupId, (notify) =>
    sendWaitlistAdminNotice(notify, signup));
}

export async function waitlistSignupHandler(req: Request, res: Response) {
  const { email, segment, ref, website } = req.body as z.infer<typeof waitlistSignupSchema>;

  if (website) {
    logger.info("WAITLIST", "Honeypot filled, signup ignored");
    return res.json(OK);
  }

  try {
    const now = new Date();
    const signup = { email, segment, ref, consentedAt: now, createdAt: now };
    // ON CONFLICT DO NOTHING: první zápis zůstává beze změny, i když dva dorazí naráz.
    const created = await prisma.waitlistSignup.createManyAndReturn({ data: [signup], skipDuplicates: true, select: { id: true } });
    if (created.length === 0) {
      logger.info("WAITLIST", "Duplicate waitlist e-mail, nothing saved or sent");
      return res.json(OK);
    }

    logger.info("WAITLIST", "New waitlist signup", { signupId: created[0].id, segment, ref });
    await sendWaitlistEmails(
      { ...signup, households: null, willingnessToPay: null, painPoint: null, rentalIntent: null, rentalNeeds: [] },
      created[0].id,
    );
    return res.json(OK);
  } catch (error) {
    logger.prismaError("Waitlist signup failed", error);
    return res.status(500).json({ message: "Zápis se nepodařil. Zkus to znovu." });
  }
}
