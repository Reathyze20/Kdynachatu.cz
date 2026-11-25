/* ============================================================================
   utils/email.ts — Email services via Resend (SMTP)
   ============================================================================ */

import nodemailer from "nodemailer";
import logger from "./logger";
import { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM, FRONTEND_URL } from "../config/config";

// ─── Nodemailer transporter (Resend SMTP) ─────────────────────────────────────

const createTransporter = () => {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    logger.warn("EMAIL", "SMTP credentials are not fully configured. Emails will not be sent.");
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465, false for 587
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
};

const transporter = createTransporter();
const EMAIL_APP_NAME = "Kdy na chatu";
const EMAIL_APP_FOOTER = `${EMAIL_APP_NAME} — Rodinná aplikace pro správu chaty`;

function ensureEmailTransport(emailKind: string): void {
  if (transporter) {
    return;
  }

  if (process.env.NODE_ENV === "production") {
    logger.error("EMAIL", `${emailKind} email could not be sent because SMTP is not fully configured.`);
    throw new Error("SMTP_NOT_CONFIGURED");
  }
}

// ─── Legacy: Send verification email with PIN code ──────────────────────────

export const sendVerificationEmailWithPIN = async (email: string, code: string): Promise<void> => {
  ensureEmailTransport("Verification PIN");
  if (!transporter) {
    logger.warn("EMAIL", `[SIMULATION] Verification PIN email for ${email} with code ${code}`);
    return;
  }

  try {
    const htmlContent = `
<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', Arial, sans-serif;">
  <div style="background-color: #f3f4f6; padding: 40px 20px;">
    <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
      
      <div style="text-align: center; padding: 32px 32px 16px 32px;">
        <h1 style="margin: 0; color: #111827; font-size: 24px; font-weight: 600;">${EMAIL_APP_NAME}</h1>
      </div>

      <div style="padding: 0 32px 32px 32px;">
        <p style="color: #374151; font-size: 16px; line-height: 1.5; margin: 0 0 16px 0;">
          Ahoj,
        </p>
        <p style="color: #374151; font-size: 16px; line-height: 1.5; margin: 0 0 24px 0;">
          Tvůj ověřovací kód pro dokončení registrace je:
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 36px; font-weight: bold; color: #5d9b62; letter-spacing: 8px; padding: 16px 24px; border: 2px dashed #5d9b62; border-radius: 8px; display: inline-block;">
            ${code}
          </span>
        </div>

        <p style="color: #374151; font-size: 16px; line-height: 1.5; margin: 0 0 16px 0;">
          Zadej tento kód do příslušného pole v aplikaci.
        </p>

        <p style="color: #9ca3af; font-size: 13px; line-height: 1.4; margin: 20px 0 0 0;">
          Pokud registrace nebyla tvoje, tento e-mail ignoruj.
        </p>
      </div>
    </div>

    <div style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 16px; padding: 0 20px;">
      <p style="margin: 0;">${EMAIL_APP_FOOTER}</p>
    </div>
  </div>
</body>
</html>`;

    const textContent = `Ahoj,\n\nTvůj ověřovací kód je: ${code}\n\nZadej ho do příslušného pole v aplikaci.\n\nPokud registrace nebyla tvoje, tento e-mail ignoruj.`;

    const info = await transporter.sendMail({
      from: EMAIL_FROM,
      to: email,
      subject: `Ověření e-mailu — ${EMAIL_APP_NAME}`,
      text: textContent,
      html: htmlContent,
    });

    logger.info("EMAIL", `Verification PIN email sent to ${email}`, { messageId: info.messageId });
  } catch (error) {
    logger.error("EMAIL", `Failed to send verification PIN email to ${email}`, { error: String(error) });
    throw error;
  }
};

// ─── New SaaS: Send verification email with activation link ─────────────────

export const sendVerificationEmailWithToken = async (email: string, token: string): Promise<void> => {
  ensureEmailTransport("Verification token");
  const frontendBaseUrl = FRONTEND_URL.endsWith("/") ? FRONTEND_URL.slice(0, -1) : FRONTEND_URL;
  if (!transporter) {
    logger.warn("EMAIL", `[SIMULATION] Verification token email for ${email} — token: ${token}`);
    logger.info("EMAIL", `Verify URL (no SMTP): ${frontendBaseUrl}/verify?token=${token}`);
    return;
  }

  const verifyUrl = `${frontendBaseUrl}/verify?token=${token}`;

  try {
    const htmlContent = `
<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', Arial, sans-serif;">
  <div style="background-color: #f3f4f6; padding: 40px 20px;">
    
    <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
      
      <div style="text-align: center; padding: 32px 32px 16px 32px;">
        <h1 style="margin: 0; color: #111827; font-size: 24px; font-weight: 600;">${EMAIL_APP_NAME}</h1>
      </div>

      <div style="padding: 0 32px 32px 32px;">
        <p style="color: #374151; font-size: 16px; line-height: 1.5; margin: 0 0 16px 0;">
          Ahoj,
        </p>
        <p style="color: #374151; font-size: 16px; line-height: 1.5; margin: 0 0 24px 0;">
          Děkujeme za registraci do aplikace <strong style="color: #111827;">${EMAIL_APP_NAME}</strong>. 
          Účet aktivuješ tlačítkem níže:
        </p>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${verifyUrl}" 
             style="background-color: #5d9b62; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">
            Aktivovat účet
          </a>
        </div>

        <p style="color: #6b7280; font-size: 14px; line-height: 1.5; margin: 24px 0 8px 0;">
          Pokud tlačítko nefunguje, zkopíruj tento odkaz do prohlížeče:
        </p>
        <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin-top: 8px;">
          <a href="${verifyUrl}" style="color: #5d9b62; font-size: 13px; word-break: break-all; text-decoration: none;">${verifyUrl}</a>
        </div>

        <p style="color: #9ca3af; font-size: 13px; line-height: 1.4; margin: 20px 0 0 0;">
          Pokud registrace nebyla tvoje, tento e-mail ignoruj. Odkaz můžeš použít jen jednou.
        </p>
      </div>
    </div>

    <div style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 16px; padding: 0 20px;">
      <p style="margin: 0;">${EMAIL_APP_FOOTER}</p>
    </div>
  </div>
</body>
</html>`;

    const textContent = `Ahoj,\n\nÚčet v aplikaci ${EMAIL_APP_NAME} aktivuješ přes tento odkaz:\n${verifyUrl}\n\nPokud registrace nebyla tvoje, tento e-mail ignoruj.`;

    const info = await transporter.sendMail({
      from: EMAIL_FROM,
      to: email,
      subject: `Aktivace účtu — ${EMAIL_APP_NAME}`,
      text: textContent,
      html: htmlContent,
    });

    logger.info("EMAIL", `Verification token email sent to ${email}`, { messageId: info.messageId });
  } catch (error) {
    logger.error("EMAIL", `Failed to send verification token email to ${email}`, { error: String(error) });
    throw error;
  }
};

export const sendSuperadminOnboardingEmail = async (
  email: string,
  token: string,
  tempPassword: string
): Promise<{ delivered: boolean }> => {
  ensureEmailTransport("Superadmin onboarding");
  const frontendBaseUrl = FRONTEND_URL.endsWith("/") ? FRONTEND_URL.slice(0, -1) : FRONTEND_URL;
  const verifyUrl = `${frontendBaseUrl}/verify?token=${token}`;

  if (!transporter) {
    logger.warn("EMAIL", `[SIMULATION] Superadmin onboarding email for ${email}`);
    logger.info("EMAIL", `Superadmin onboarding verify URL (no SMTP): ${verifyUrl}`);
    return { delivered: false };
  }

  try {
    const htmlContent = `
<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', Arial, sans-serif;">
  <div style="background-color: #f3f4f6; padding: 40px 20px;">
    <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
      <div style="text-align: center; padding: 32px 32px 16px 32px;">
        <h1 style="margin: 0; color: #111827; font-size: 24px; font-weight: 600;">${EMAIL_APP_NAME}</h1>
      </div>

      <div style="padding: 0 32px 32px 32px;">
        <p style="color: #374151; font-size: 16px; line-height: 1.5; margin: 0 0 16px 0;">
          Ahoj,
        </p>
        <p style="color: #374151; font-size: 16px; line-height: 1.5; margin: 0 0 16px 0;">
          Backoffice ti vytvořil účet v aplikaci <strong style="color: #111827;">${EMAIL_APP_NAME}</strong>.
          Pro první přihlášení aktivuj účet a použij dočasné heslo níže.
        </p>

        <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0 0 8px 0; color: #111827; font-weight: 600; font-size: 14px;">Dočasné heslo</p>
          <code style="display: inline-block; background-color: #111827; color: #ffffff; padding: 10px 12px; border-radius: 6px; font-size: 16px; letter-spacing: 1px;">${tempPassword}</code>
        </div>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${verifyUrl}"
             style="background-color: #5d9b62; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">
            Aktivovat účet
          </a>
        </div>

        <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0 0 8px 0; color: #111827; font-weight: 600; font-size: 14px;">Jak pokračovat</p>
          <ol style="margin: 0; padding-left: 20px; color: #374151; font-size: 14px; line-height: 1.7;">
            <li>Klikni na tlačítko pro aktivaci účtu.</li>
            <li>Po ověření se přihlas svým e-mailem nebo uživatelským jménem a dočasným heslem.</li>
            <li>Po prvním přihlášení si heslo co nejdřív změň.</li>
          </ol>
        </div>

        <p style="color: #6b7280; font-size: 14px; line-height: 1.5; margin: 24px 0 8px 0;">
          Pokud tlačítko nefunguje, zkopíruj tento odkaz do prohlížeče:
        </p>
        <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin-top: 8px;">
          <a href="${verifyUrl}" style="color: #5d9b62; font-size: 13px; word-break: break-all; text-decoration: none;">${verifyUrl}</a>
        </div>

        <p style="color: #9ca3af; font-size: 13px; line-height: 1.4; margin: 20px 0 0 0;">
          Pokud účet nečekáš, tento e-mail ignoruj.
        </p>
      </div>
    </div>

    <div style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 16px; padding: 0 20px;">
      <p style="margin: 0;">${EMAIL_APP_FOOTER}</p>
    </div>
  </div>
</body>
</html>`;

    const textContent =
      `Ahoj,\n\n` +
      `Backoffice ti vytvořil účet v aplikaci ${EMAIL_APP_NAME}.\n\n` +
      `Dočasné heslo: ${tempPassword}\n\n` +
      `Nejdřív aktivuj účet na odkazu:\n${verifyUrl}\n\n` +
      `Pak se přihlas svým e-mailem nebo uživatelským jménem a tímto dočasným heslem. Po prvním přihlášení si heslo změň.`;

    const info = await transporter.sendMail({
      from: EMAIL_FROM,
      to: email,
      subject: `Aktivace účtu a dočasné heslo — ${EMAIL_APP_NAME}`,
      text: textContent,
      html: htmlContent,
    });

    logger.info("EMAIL", `Superadmin onboarding email sent to ${email}`, { messageId: info.messageId });
    return { delivered: true };
  } catch (error) {
    logger.error("EMAIL", `Failed to send superadmin onboarding email to ${email}`, { error: String(error) });
    throw error;
  }
};

export const sendPasswordResetEmail = async (email: string, token: string): Promise<void> => {
  ensureEmailTransport("Password reset");
  const frontendBaseUrl = FRONTEND_URL.endsWith("/") ? FRONTEND_URL.slice(0, -1) : FRONTEND_URL;
  const resetUrl = `${frontendBaseUrl}/reset-password?token=${token}`;

  if (!transporter) {
    logger.warn("EMAIL", `[SIMULATION] Password reset email for ${email}`);
    logger.info("EMAIL", `Password reset URL (no SMTP): ${resetUrl}`);
    return;
  }

  try {
    const htmlContent = `
<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', Arial, sans-serif;">
  <div style="background-color: #f3f4f6; padding: 40px 20px;">
    <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
      <div style="text-align: center; padding: 32px 32px 16px 32px;">
        <h1 style="margin: 0; color: #111827; font-size: 24px; font-weight: 600;">${EMAIL_APP_NAME}</h1>
      </div>

      <div style="padding: 0 32px 32px 32px;">
        <p style="color: #374151; font-size: 16px; line-height: 1.5; margin: 0 0 16px 0;">
          Ahoj,
        </p>
        <p style="color: #374151; font-size: 16px; line-height: 1.5; margin: 0 0 24px 0;">
          Přišla nám žádost o nové heslo k tvému účtu v aplikaci <strong style="color: #111827;">${EMAIL_APP_NAME}</strong>.
        </p>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${resetUrl}"
             style="background-color: #5d9b62; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">
            Nastavit nové heslo
          </a>
        </div>

        <p style="color: #6b7280; font-size: 14px; line-height: 1.5; margin: 24px 0 8px 0;">
          Pokud tlačítko nefunguje, zkopíruj tento odkaz do prohlížeče:
        </p>
        <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin-top: 8px;">
          <a href="${resetUrl}" style="color: #5d9b62; font-size: 13px; word-break: break-all; text-decoration: none;">${resetUrl}</a>
        </div>

        <p style="color: #9ca3af; font-size: 13px; line-height: 1.4; margin: 20px 0 0 0;">
          Odkaz platí 2 hodiny a můžeš ho použít jen jednou. Pokud žádost nebyla od tebe, tento e-mail ignoruj.
        </p>
      </div>
    </div>

    <div style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 16px; padding: 0 20px;">
      <p style="margin: 0;">${EMAIL_APP_FOOTER}</p>
    </div>
  </div>
</body>
</html>`;

    const textContent = `Ahoj,\n\nPřišla nám žádost o nové heslo k tvému účtu v aplikaci ${EMAIL_APP_NAME}. Pokračuj tady:\n${resetUrl}\n\nOdkaz platí 2 hodiny a můžeš ho použít jen jednou. Pokud žádost nebyla od tebe, tento e-mail ignoruj.`;

    const info = await transporter.sendMail({
      from: EMAIL_FROM,
      to: email,
      subject: `Obnova hesla — ${EMAIL_APP_NAME}`,
      text: textContent,
      html: htmlContent,
    });

    logger.info("EMAIL", `Password reset email sent to ${email}`, { messageId: info.messageId });
  } catch (error) {
    logger.error("EMAIL", `Failed to send password reset email to ${email}`, { error: String(error) });
    throw error;
  }
};

// ─── E-mail changed: notice to the old address (#475) ───────────────────────

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Upozornění na starou adresu, že se e-mail u účtu změnil (nebo byl odebrán, `newEmail: null`). */
export const sendEmailChangedNotice = async (
  oldEmail: string,
  change: { username: string; newEmail: string | null }
): Promise<void> => {
  ensureEmailTransport("E-mail changed notice");
  if (!transporter) {
    logger.warn("EMAIL", "[SIMULATION] E-mail changed notice to the old address");
    return;
  }

  const changeText = change.newEmail
    ? `E-mail u tvého účtu ${change.username} v aplikaci ${EMAIL_APP_NAME} se právě změnil na ${change.newEmail}.`
    : `E-mail u tvého účtu ${change.username} v aplikaci ${EMAIL_APP_NAME} byl právě odebrán.`;
  const changeHtml = change.newEmail
    ? `E-mail u tvého účtu <strong style="color: #111827;">${escapeHtml(change.username)}</strong> v aplikaci ${EMAIL_APP_NAME} se právě změnil na <strong style="color: #111827;">${escapeHtml(change.newEmail)}</strong>.`
    : `E-mail u tvého účtu <strong style="color: #111827;">${escapeHtml(change.username)}</strong> v aplikaci ${EMAIL_APP_NAME} byl právě odebrán.`;
  const warning =
    "Pokud o změně nevíš, někdo se mohl dostat k tvému účtu. Hned se ozvi správci své chaty, ať ti nastaví nové heslo a e-mail vrátí.";

  const htmlContent = `
<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', Arial, sans-serif;">
  <div style="background-color: #f3f4f6; padding: 40px 20px;">
    <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
      <div style="text-align: center; padding: 32px 32px 16px 32px;">
        <h1 style="margin: 0; color: #111827; font-size: 24px; font-weight: 600;">${EMAIL_APP_NAME}</h1>
      </div>

      <div style="padding: 0 32px 32px 32px;">
        <p style="color: #374151; font-size: 16px; line-height: 1.5; margin: 0 0 16px 0;">
          Ahoj,
        </p>
        <p style="color: #374151; font-size: 16px; line-height: 1.5; margin: 0 0 16px 0;">
          ${changeHtml}
        </p>
        <p style="color: #374151; font-size: 16px; line-height: 1.5; margin: 0;">
          ${warning}
        </p>
        <p style="color: #9ca3af; font-size: 13px; line-height: 1.4; margin: 20px 0 0 0;">
          Jestli je změna od tebe, nemusíš nic dělat.
        </p>
      </div>
    </div>

    <div style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 16px; padding: 0 20px;">
      <p style="margin: 0;">${EMAIL_APP_FOOTER}</p>
    </div>
  </div>
</body>
</html>`;

  const textContent = `Ahoj,\n\n${changeText}\n\n${warning}\n\nJestli je změna od tebe, nemusíš nic dělat.\n\n— ${EMAIL_APP_NAME}`;

  try {
    const info = await transporter.sendMail({
      from: EMAIL_FROM,
      to: oldEmail,
      subject: `E-mail u účtu byl změněn — ${EMAIL_APP_NAME}`,
      text: textContent,
      html: htmlContent,
    });

    logger.info("EMAIL", "E-mail changed notice sent to the old address", { messageId: info.messageId });
  } catch (error) {
    logger.error("EMAIL", "Failed to send e-mail changed notice", { error: String(error) });
    throw error;
  }
};

// ─── Frost alert email ──────────────────────────────────────────────────────

export const sendFrostAlertEmail = async (
  email: string,
  username: string,
  cabinName: string,
  lowestTemp: number,
  frostDatesFormatted: string
): Promise<void> => {
  ensureEmailTransport("Frost alert");
  if (!transporter) {
    logger.warn("EMAIL", `[SIMULATION] Frost alert for ${email} — cabin "${cabinName}", lowest ${lowestTemp} °C`);
    return;
  }

  const subject = `Varování před mrazem — ${cabinName}`;

  const htmlContent = `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8" /></head>
<body style="margin: 0; padding: 20px; background-color: #f4f7f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', Arial, sans-serif;">
  <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">

    <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a8e 100%); padding: 32px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 12px;">❄</div>
      <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">Pozor, hrozí mrazy!</h1>
    </div>

    <div style="padding: 32px;">
      <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
        Ahoj <strong>${username}</strong>,
      </p>
      <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
        Předpověď pro chatu <strong>${cabinName}</strong> ukazuje, že v příštích dnech klesne teplota pod bod mrazu:
      </p>

      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0 0 8px 0; font-weight: 700; color: #991b1b; font-size: 14px;">
          Nejnižší očekávaná teplota: <span style="font-size: 18px;">${lowestTemp} °C</span>
        </p>
        <p style="margin: 0; color: #991b1b; font-size: 13px;">
          Dny s mrazem: ${frostDatesFormatted}
        </p>
      </div>

      <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 16px 0;">
        Pokud na chatě není <strong>vypuštěná voda</strong> a zajištěné trubky, co nejdřív se postarej, aby potrubí nepraskalo.
      </p>

      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0 0 8px 0; font-weight: 700; color: #166534; font-size: 14px;">Co můžeš udělat:</p>
        <ul style="margin: 0; padding-left: 20px; color: #166534; font-size: 13px; line-height: 1.8;">
          <li>Vypustit vodu z potrubí a bojleru</li>
          <li>Zavřít hlavní uzávěr vody</li>
          <li>Otevřít kohoutky pro odvzdušnění</li>
          <li>Označit chatu jako „zazimovanou" v aplikaci</li>
        </ul>
      </div>

      <p style="color: #9ca3af; font-size: 13px; line-height: 1.4; margin: 20px 0 0 0;">
        Toto varování posíláme nejvýš jednou za 7 dní. Pokud je voda už vypuštěná,
        označ chatu v nastavení jako „zazimovanou" a upozornění přestanou chodit.
      </p>
    </div>
  </div>

  <div style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 16px; padding: 0 20px;">
    <p style="margin: 0;">${EMAIL_APP_FOOTER}</p>
  </div>
</body>
</html>`;

  const textContent =
    `Ahoj ${username},\n\n` +
    `Varování: Pro chatu „${cabinName}" předpověď ukazuje mrazy v příštích dnech.\n` +
    `Nejnižší teplota: ${lowestTemp} °C\n` +
    `Dny s mrazem: ${frostDatesFormatted}\n\n` +
    `Pokud na chatě není vypuštěná voda, postarej se, aby trubky nepraskly.\n\n` +
    `— ${EMAIL_APP_NAME}`;

  try {
    const info = await transporter.sendMail({
      from: EMAIL_FROM,
      to: email,
      subject,
      text: textContent,
      html: htmlContent,
    });

    logger.info("EMAIL", `Frost alert sent to ${email} for cabin "${cabinName}"`, { messageId: info.messageId });
  } catch (error) {
    logger.error("EMAIL", `Failed to send frost alert to ${email}`, { error: String(error) });
    throw error;
  }
};

// ─── Backward compatibility aliases ──────────────────────────────────────────

/**
 * @deprecated Use sendVerificationEmailWithPIN instead
 */
export const sendVerificationEmail = sendVerificationEmailWithPIN;

// ─── Generic send email ──────────────────────────────────────────────────────

export const sendEmail = async (opts: { to: string; subject: string; html: string }): Promise<void> => {
  ensureEmailTransport("Transactional");
  if (!transporter) {
    logger.warn("EMAIL", `[SIMULATION] Email to ${opts.to}: ${opts.subject}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    logger.info("EMAIL", `Email sent to ${opts.to}`, { subject: opts.subject });
  } catch (error) {
    logger.error("EMAIL", `Failed to send email to ${opts.to}`, { error: String(error) });
    throw error;
  }
};
