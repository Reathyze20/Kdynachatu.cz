import { Search, SearchX } from "lucide-react";
import type { NoteThread } from "@/api/notes";
import { AnimalAvatar } from "@/components/shared/AnimalAvatar";
import { EmptyState } from "@/components/shared/EmptyState";
import { Input } from "@/components/ui/input";
import { formatDate, formatShortDate, formatTime } from "@/lib/format";

interface UserMap {
  [username: string]: { color?: string; animalIcon?: string | null };
}

interface Props {
  threads: NoteThread[];
  activeThreadId: string | null;
  searchQuery: string;
  userMap: UserMap;
  onSearchChange: (q: string) => void;
  onSelectThread: (id: string | null) => void;
}

/**
 * Odstraní markdown syntaxi z náhledu poslední zprávy — v jednořádkovém
 * preview by hvězdičky a checkboxy působily jako rozbitý text.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')          // code blocks
    .replace(/`([^`]*)`/g, '$1')              // inline code
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // links
    .replace(/^#{1,6}\s+/gm, '')              // headings
    .replace(/(\*\*|__)(.*?)\1/g, '$2')       // bold
    .replace(/(\*|_)(.*?)\1/g, '$2')          // italic
    .replace(/~~(.*?)~~/g, '$1')              // strikethrough
    .replace(/^\s*-\s*\[[ xX]\]\s*/gm, '')    // task list checkboxes
    .replace(/^\s*[-*+]\s+/gm, '')            // bullet markers
    .replace(/^\s*\d+\.\s+/gm, '')            // ordered list markers
    .replace(/^\s*>\s?/gm, '')                // blockquotes
    .replace(/\s+/g, ' ')
    .trim()
}

/** Dnes „9:40“, jindy „21. 3.“; den v pražském čase jako formátování. */
function formatThreadTime(isoStr: string): string {
  return formatDate(isoStr) === formatDate(Date.now()) ? formatTime(isoStr) : formatShortDate(isoStr);
}

export function ThreadList({
  threads,
  activeThreadId,
  searchQuery,
  userMap,
  onSearchChange,
  onSelectThread,
}: Props) {
  // Hlavní (id null) je připnuté nahoře, ostatní témata podle poslední zprávy.
  const filtered = threads
    .filter((t) =>
      !searchQuery ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .sort((a, b) => {
      if (a.id === null || b.id === null) return a.id === null ? -1 : 1;
      const timeA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const timeB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return timeB - timeA;
    });

  return (
    <>
      <div className="relative mt-4 shrink-0">
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-(--text-muted)" />
        <Input
          id="thread-search-input"
          type="search"
          className="pl-10"
          placeholder="Hledat téma"
          aria-label="Hledat téma"
          autoComplete="off"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          data-testid="notes-thread-search-input"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={SearchX} message="Žádné téma neodpovídá hledání." />
      ) : (
        <ul className="-mx-2 mt-2 min-h-0 flex-1 overflow-y-auto" data-testid="notes-thread-list">
          {filtered.map((t) => {
            const isActive = activeThreadId === t.id;
            const isUnread = !isActive && !!t.hasUnread;
            const lastText = t.lastMessage ? stripMarkdown(t.lastMessage) : "Žádné zprávy";
            const lastTime = t.lastMessage && t.lastMessageAt ? formatThreadTime(t.lastMessageAt) : "";
            const lastAuthor = t.lastMessageBy ?? null;
            const authorInfo = lastAuthor ? userMap[lastAuthor] : undefined;

            return (
              <li key={t.id ?? "__main__"}>
                <button
                  type="button"
                  className="flex min-h-(--touch-target-min) w-full items-center gap-3 rounded-(--radius-md) px-2 py-3 text-left hover:bg-(--bg-hover) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-[current=true]:bg-accent"
                  aria-current={isActive || undefined}
                  onClick={() => onSelectThread(t.id ?? null)}
                  data-testid="notes-thread-item"
                  data-thread-id={t.id ?? "__main__"}
                >
                  <AnimalAvatar
                    icon={authorInfo?.animalIcon ?? null}
                    username={lastAuthor ?? t.name}
                    color={authorInfo?.color}
                    size={40}
                    className="shrink-0"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-body text-(--text-main) ${isUnread || isActive ? "font-bold" : "font-semibold"}`}>
                        {t.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-meta text-(--text-muted)">
                        {lastTime}
                        {isUnread && (
                          <>
                            <span aria-hidden="true" className="size-3 rounded-full bg-primary" />
                            <span className="sr-only">, nepřečtené</span>
                          </>
                        )}
                      </span>
                    </span>
                    <span className={`truncate text-meta ${isUnread ? "font-semibold text-(--text-main)" : "text-(--text-muted)"}`}>
                      {lastText}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
