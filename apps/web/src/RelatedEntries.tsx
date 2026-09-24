import { moodFromTags, type EntryLinkKind } from "@life-ledger/contracts";
import { MessageSquareText } from "lucide-react";
import { useEffect, useState } from "react";

import { loadLinkedEntries } from "./api";
import type { LedgerEntry } from "./models";
import "./related.css";

/** Every 日常 post linked to one book, record, place or game. */
export function RelatedEntries({
  kind,
  id,
  onOpenEntry,
  emptyText = "还没有相关动态。发动态时关联它，或让 Hermes 记的时候带上它。",
}: {
  kind: EntryLinkKind;
  id: string;
  onOpenEntry: (entryId: string) => void;
  emptyText?: string;
}) {
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setEntries(null);
    void loadLinkedEntries(kind, id, controller.signal)
      .then(setEntries)
      .catch(() => setEntries([]));
    return () => controller.abort();
  }, [kind, id]);

  return (
    <section className="related-entries" aria-label="相关动态">
      <h3>
        <MessageSquareText aria-hidden="true" size={15} />
        相关动态
        {entries?.length ? <span>{entries.length}</span> : null}
      </h3>
      {entries === null ? (
        <p className="related-empty">读取中…</p>
      ) : entries.length === 0 ? (
        <p className="related-empty">{emptyText}</p>
      ) : (
        <ol>
          {entries.map((entry) => {
            const mood = moodFromTags(entry.tags);
            return (
              <li key={entry.id}>
                <button type="button" onClick={() => onOpenEntry(entry.id)}>
                  <time dateTime={entry.occurredAt}>
                    {new Date(entry.occurredAt).toLocaleDateString("zh-CN", {
                      year: "numeric",
                      month: "numeric",
                      day: "numeric",
                    })}
                  </time>
                  <span>
                    {mood ? `${mood} ` : ""}
                    {entry.bodyRaw}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
