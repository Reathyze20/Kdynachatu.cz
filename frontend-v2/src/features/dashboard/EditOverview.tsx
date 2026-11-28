/**
 * EditOverview — odkaz „Upravit Přehled“ dole na Přehledu a jeho sheet s přepínači (#686, spec #677).
 * SimplifiedNote — jednorázová tichá poznámka pro stávající uživatele, že Přehled je jednodušší.
 * Host ani jedno nevidí (rozhoduje DashboardPage).
 */
import { useState } from "react";
import { PenLine, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shared/Card";
import { Modal } from "@/components/shared/Modal";
import { OverviewToggles } from "./OverviewToggles";
import { useUpdateDashboardPrefs } from "./overviewBlocks";

interface EditOverviewProps {
  /** „Napsat vzkaz“: otevře nástěnku, i když karta Nástěnka zapnutá není. */
  onWriteNote: () => void;
}

export function EditOverview({ onWriteNote }: EditOverviewProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex justify-center">
        <Button variant="ghost" className="text-primary" onClick={() => setOpen(true)}>
          <SlidersHorizontal size={16} aria-hidden="true" />
          Upravit Přehled
        </Button>
      </div>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Upravit Přehled" maxWidth="max-w-md">
        <p className="mb-2 text-label text-(--text-muted)">Na chatě teď, Důležité a Visí na tobě uvidíš vždy. Co dalšího chceš vidět?</p>
        <OverviewToggles />
        <Button
          variant="secondary"
          className="mt-4 w-full"
          onClick={() => {
            setOpen(false);
            onWriteNote();
          }}
        >
          <PenLine size={16} aria-hidden="true" />
          Napsat vzkaz
        </Button>
      </Modal>
    </>
  );
}

export function SimplifiedNote() {
  const update = useUpdateDashboardPrefs();
  return (
    <Card className="flex items-center gap-3 py-2 md:py-2">
      <p className="flex-1 text-body text-(--text-muted)">Přehled je jednodušší. Co chceš vidět, si zapneš v Upravit Přehled.</p>
      <Button variant="ghost" size="icon" aria-label="Zavřít poznámku" onClick={() => update.mutate({ simplifiedNoteDismissed: true })}>
        <X size={20} aria-hidden="true" />
      </Button>
    </Card>
  );
}
