/**
 * CopyForWhatsAppButton — jedna akce „Zkopírovat pro WhatsApp“ všude, kde jde text poslat
 * rodině (#264): tlačítko s textem, po zkopírování „Zkopírováno“ na tlačítku a hláška pro čtečku.
 */
import { useEffect, useRef, useState } from "react";
import { Check, MessageCircle } from "lucide-react";
import { showToast } from "@/lib/toast";

const CONFIRM_MS = 2000;

interface Props {
  /** Celý text, jak se vloží do WhatsAppu (odkaz do aplikace přidá `whatsAppMessage`). */
  text: string;
  className?: string;
  /** Prohlížeč kopírování nepovolil; bez handleru se ukáže chybový toast. */
  onError?: () => void;
  testId?: string;
}

export function CopyForWhatsAppButton({ text, className = "btn btn-secondary btn-sm", onError, testId }: Props) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      if (onError) onError();
      else showToast("Kopírování se nepodařilo. Zkus to znovu.", "error");
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setCopied(true);
    timerRef.current = setTimeout(() => setCopied(false), CONFIRM_MS);
  }

  const Icon = copied ? Check : MessageCircle;
  return (
    <>
      <button type="button" className={className} onClick={() => void copy()} data-testid={testId}>
        <Icon className="w-4 h-4" aria-hidden="true" />
        {copied ? "Zkopírováno" : "Zkopírovat pro WhatsApp"}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Zkopírováno pro WhatsApp" : ""}
      </span>
    </>
  );
}
