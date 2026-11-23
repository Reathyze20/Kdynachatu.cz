/**
 * Most do rodinné skupiny, dokud nepřijde bot (fáze 3): zpráva + odkaz do aplikace do schránky.
 */
import { showToast } from "@/lib/toast";

export async function copyForWhatsApp(message: string, href: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(`${message}\n${window.location.origin}${href}`);
    showToast("Zkopírováno pro WhatsApp", "success");
  } catch {
    showToast("Kopírování se nepodařilo", "error");
  }
}
