import { useMemo, useState } from 'react';
import { HelpCircle, X, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HELP_ARTICLES, HELP_TOPICS, HelpArticle, searchHelp } from '@/lib/helpArticles';

export default function HelpDeskWidget() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<string | null>(null);
  const [article, setArticle] = useState<HelpArticle | null>(null);

  const results = useMemo(() => {
    if (query.trim()) return searchHelp(query);
    if (topic) return HELP_ARTICLES.filter((a) => a.topic === topic);
    return [];
  }, [query, topic]);

  const related = useMemo(
    () => (article ? HELP_ARTICLES.filter((a) => a.topic === article.topic && a.id !== article.id).slice(0, 3) : []),
    [article],
  );

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-5 z-50 flex max-h-[70vh] w-[360px] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl">
          <div className="flex items-center justify-between border-b bg-primary px-4 py-3 text-primary-foreground">
            <div>
              <div className="text-sm font-semibold">Help desk</div>
              <div className="text-[11px] opacity-90">How does something work? Ask here.</div>
            </div>
            <button aria-label="Close help" onClick={() => setOpen(false)} className="rounded p-1 hover:bg-primary-foreground/15">
              <X className="h-4 w-4" />
            </button>
          </div>

          {article ? (
            <div className="flex-1 overflow-y-auto p-4">
              <button onClick={() => setArticle(null)} className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ChevronLeft className="h-3 w-3" /> Back
              </button>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{article.topic}</div>
              <h3 className="mb-3 text-sm font-semibold">{article.question}</h3>
              <div className="space-y-2 text-sm leading-relaxed">
                {article.answer.map((p, i) => <p key={i}>{p}</p>)}
              </div>
              {related.length > 0 && (
                <div className="mt-5 border-t pt-3">
                  <div className="mb-2 text-xs font-medium text-muted-foreground">Related</div>
                  {related.map((r) => (
                    <button key={r.id} onClick={() => setArticle(r)} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-muted">
                      {r.question} <ChevronRight className="h-3 w-3 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="border-b p-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. how do I send a contract?" className="pl-8" />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {HELP_TOPICS.map((t) => (
                    <button
                      key={t}
                      onClick={() => { setTopic(topic === t ? null : t); setQuery(''); }}
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] ${topic === t && !query ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {results.map((a) => (
                  <button key={a.id} onClick={() => setArticle(a)} className="flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted">
                    <span>{a.question}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                ))}
                {query.trim() && results.length === 0 && (
                  <p className="p-3 text-center text-xs text-muted-foreground">No answer found. Try different words or pick a topic above.</p>
                )}
                {!query.trim() && !topic && (
                  <p className="p-3 text-center text-xs text-muted-foreground">Type a question or pick a topic.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <Button
        size="icon"
        aria-label="Help"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-50 h-12 w-12 rounded-full shadow-lg"
      >
        {open ? <X className="h-5 w-5" /> : <HelpCircle className="h-6 w-6" />}
      </Button>
    </>
  );
}
