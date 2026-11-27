/**
 * CopyForWhatsAppButton — jedna akce „Zkopírovat pro WhatsApp“ všude, kde jde text poslat
 * rodině (#264): jeden vzhled (`Button` secondary), tlačítko s textem, po zkopírování „Zkopírováno“ na tlačítku a hláška pro čtečku.
 */
import { useEffect, useRef, useState } from "react";
import { Check, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showToast } from "@/lib/toast";

const CONFIRM_MS = 2000;

interface Props {
  /** Celý text, jak se vloží do WhatsAppu (odkaz do aplikace přidá `whatsAppMessage`). */
  text: string;
  /** Prohlížeč kopírování nepovolil; bez handleru se ukáže chybový toast. */
  onError?: () => void;
  /** Text je ve schránce (např. schovat dřívější chybu). */
  onCopied?: () => void;
  testId?: string;
}

export function CopyForWhatsAppButton({ text, onError, onCopied, testId }: Props) {
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
    onCopied?.();
    if (timerRef.current) clearTimeout(timerRef.current);
    setCopied(true);
    timerRef.current = setTimeout(() => setCopied(false), CONFIRM_MS);
  }

  const Icon = copied ? Check : MessageCircle;
  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => void copy()} data-testid={testId}>
        <Icon aria-hidden="true" />
        {copied ? "Zkopírováno" : "Zkopírovat pro WhatsApp"}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Zkopírováno pro WhatsApp" : ""}
      </span>
    </>
  );
}
