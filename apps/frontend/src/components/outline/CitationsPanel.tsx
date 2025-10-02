import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Copy, Pencil, Check, X } from 'lucide-react';
import {
  canonicalizeCitation,
  dedupeCitations,
  deriveFootnoteLabel,
  NormalizedCitation,
} from '@/utils/citations';

export type Citation = { title?: string; source?: string; url?: string };

interface CitationsPanelProps {
  citations?: Citation[];
  editable?: boolean;
  onChange?: (next: Citation[]) => void;
  className?: string;
  footnotes?: Array<{ index: number; label: string; url: string }>; // Ordered list of domains/labels with index
}

const CitationsPanel: React.FC<CitationsPanelProps> = ({ citations = [], editable = false, onChange, className, footnotes }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<Citation | null>(null);
  const normalizedCitations = useMemo(() => dedupeCitations(citations), [citations]);

  const grouped = useMemo(() => {
    const counts = new Map<string, number>();
    citations.forEach((citation) => {
      const normalized = canonicalizeCitation(citation || {});
      const key = normalized.normalizedKey || normalized.label;
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return normalizedCitations.map<NormalizedCitation & { count: number }>((citation) => ({
      ...citation,
      count: counts.get(citation.normalizedKey || citation.label) || 1,
    }));
  }, [citations, normalizedCitations]);

  if ((!citations || citations.length === 0) && (!footnotes || footnotes.length === 0)) return null;

  return (
    <div className={cn('mt-2 border rounded bg-zinc-50/60 dark:bg-zinc-900/30', className)}>
      <div className="px-2 py-1 flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wide text-zinc-600 dark:text-zinc-400">Sources</div>
        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setCollapsed(v => !v)}>
          {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {!collapsed && (
        <div className="px-2 pb-1.5">
          {footnotes && footnotes.length > 0 ? (
            <ol className="space-y-0.5 list-decimal list-inside">
              {footnotes.sort((a, b) => a.index - b.index).map((f) => {
                const normalizedFootnote = f.url ? canonicalizeCitation({ url: f.url }) : null;
                const matched = normalizedFootnote
                  ? normalizedCitations.find((c) => c.normalizedKey === normalizedFootnote.normalizedKey)
                  : null;
                const label = deriveFootnoteLabel({ label: f.label, url: f.url }, citations);
                const host = matched?.host || normalizedFootnote?.host || '';
                return (
                  <li key={`fn-${f.index}`} id={`cite-${f.index}`} className="text-[11px] text-zinc-700 dark:text-zinc-300">
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="truncate font-medium text-zinc-800 dark:text-zinc-100">{label}</div>
                        {host && host.toLowerCase() !== label.toLowerCase() && (
                          <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{host}</div>
                        )}
                        {f.url && (
                          <a
                            href={f.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-0.5 block text-[10px] text-blue-600 dark:text-blue-400 break-all"
                          >
                            {f.url}
                          </a>
                        )}
                      </div>
                      {f.url && (
                        <button
                          className="h-5 w-5 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 flex items-center justify-center flex-shrink-0"
                          onClick={() => { if (f.url) navigator.clipboard.writeText(f.url); }}
                          title="Copy URL"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
          <ul className="space-y-0.5">
            {grouped.map((c, idx) => {
              const title = c.title || c.label;
              const showSource = c.source && c.source.trim().length > 0 && c.source.trim().toLowerCase() !== title.trim().toLowerCase();
              return (
                <li key={`${(c.url || 'no-url')}-${idx}`} className="flex items-center justify-between gap-1.5 text-[11px] text-zinc-700 dark:text-zinc-300">
                  {editable && editIndex === idx ? (
                    <div className="flex-1 grid grid-cols-[1fr_auto] gap-1.5 items-center">
                      <div className="flex flex-col gap-1">
                        <input
                          className="px-1.5 py-1 rounded border bg-white dark:bg-zinc-950 text-[11px]"
                          placeholder="Title or Source"
                          value={draft?.title || draft?.source || ''}
                          onChange={(e) => setDraft(prev => ({ ...(prev || { url: c.url || '' }), title: e.target.value, source: undefined }))}
                        />
                        <input
                          className="px-1.5 py-1 rounded border bg-white dark:bg-zinc-950 text-[11px]"
                          placeholder="URL (optional)"
                          value={draft?.url || ''}
                          onChange={(e) => setDraft(prev => ({ ...(prev || { title: c.title, source: c.source }), url: e.target.value }))}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-emerald-600 hover:text-emerald-700"
                          onClick={() => {
                            if (!onChange || !draft) { setEditIndex(null); return; }
                            const next = citations.map((orig) => {
                              const keyOrig = canonicalizeCitation(orig || {}).normalizedKey;
                              const keyCurrent = canonicalizeCitation(c).normalizedKey;
                              if (keyOrig === keyCurrent) {
                                return { ...(draft as Citation) };
                              }
                              return orig;
                            });
                            onChange(next);
                            setEditIndex(null);
                          }}
                          title="Save"
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-red-600 hover:text-red-700"
                          onClick={() => { setEditIndex(null); setDraft(null); }}
                          title="Cancel"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="truncate font-medium text-zinc-800 dark:text-zinc-100">
                          {title}
                          {c.count > 1 && <span className="ml-1 text-[10px] text-zinc-500">×{c.count}</span>}
                        </div>
                        {showSource && (
                          <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{c.source}</div>
                        )}
                        {c.url && (
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-0.5 block text-[10px] text-blue-600 dark:text-blue-400 break-all"
                          >
                            {c.url}
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {editable && onChange && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
                            onClick={() => { setEditIndex(idx); setDraft({ title: c.title, source: c.source, url: c.url }); }}
                            title="Edit"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        )}
                        {c.url && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
                            onClick={() => { if (c.url) navigator.clipboard.writeText(c.url); }}
                            title="Copy URL"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          )}
          {/* Remove the extra editable hint per request */}
        </div>
      )}
    </div>
  );
};

export default CitationsPanel;
