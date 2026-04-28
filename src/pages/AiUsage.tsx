import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RefreshCw } from "lucide-react";

interface AiUsageRow {
  id: string;
  function_name: string;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  status: string | null;
  error_message: string | null;
  created_at: string;
  context: any;
}

const RANGE_OPTIONS = [
  { label: "Last 24h", hours: 24 },
  { label: "Last 7 days", hours: 24 * 7 },
  { label: "Last 30 days", hours: 24 * 30 },
];

export default function AiUsage() {
  const [rows, setRows] = useState<AiUsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeHours, setRangeHours] = useState(24 * 7);

  const fetchData = async () => {
    setLoading(true);
    const since = new Date(Date.now() - rangeHours * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from("ai_usage_logs")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) {
      console.error("Failed to load AI usage:", error);
      setRows([]);
    } else {
      setRows((data || []) as AiUsageRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeHours]);

  const summary = useMemo(() => {
    const byFn: Record<string, { calls: number; tokens: number; errors: number }> = {};
    let totalCalls = 0;
    let totalTokens = 0;
    let totalErrors = 0;
    for (const r of rows) {
      totalCalls++;
      totalTokens += r.total_tokens || 0;
      if (r.status === "error") totalErrors++;
      const key = r.function_name;
      if (!byFn[key]) byFn[key] = { calls: 0, tokens: 0, errors: 0 };
      byFn[key].calls++;
      byFn[key].tokens += r.total_tokens || 0;
      if (r.status === "error") byFn[key].errors++;
    }
    const breakdown = Object.entries(byFn)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.tokens - a.tokens || b.calls - a.calls);
    return { totalCalls, totalTokens, totalErrors, breakdown };
  }, [rows]);

  const fmt = (n: number) => n.toLocaleString();

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Helmet>
        <title>AI Usage Dashboard | Admin</title>
        <meta name="description" content="Track AI Gateway usage by edge function, model, and token consumption." />
      </Helmet>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin"><ArrowLeft className="w-4 h-4 mr-1" />Back</Link>
          </Button>
          <h1 className="text-3xl font-bold">AI Usage Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(rangeHours)} onValueChange={(v) => setRangeHours(Number(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.hours} value={String(o.hours)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total AI Calls</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{fmt(summary.totalCalls)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Tokens</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{fmt(summary.totalTokens)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Errors</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-destructive">{fmt(summary.totalErrors)}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Usage by Function</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Function</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Total Tokens</TableHead>
                <TableHead className="text-right">Avg Tokens / Call</TableHead>
                <TableHead className="text-right">Errors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.breakdown.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No AI usage logged yet for this range. Logging starts on the next AI call.
                </TableCell></TableRow>
              ) : summary.breakdown.map((b) => (
                <TableRow key={b.name}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="text-right">{fmt(b.calls)}</TableCell>
                  <TableCell className="text-right">{fmt(b.tokens)}</TableCell>
                  <TableCell className="text-right">{b.calls ? fmt(Math.round(b.tokens / b.calls)) : "—"}</TableCell>
                  <TableCell className="text-right">
                    {b.errors > 0 ? <Badge variant="destructive">{b.errors}</Badge> : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent Calls</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Function</TableHead>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Prompt</TableHead>
                <TableHead className="text-right">Completion</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 100).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-medium">{r.function_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.model || "—"}</TableCell>
                  <TableCell className="text-right">{r.prompt_tokens ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.completion_tokens ?? "—"}</TableCell>
                  <TableCell className="text-right font-medium">{r.total_tokens ?? "—"}</TableCell>
                  <TableCell>
                    {r.status === "error" ? (
                      <Badge variant="destructive">error</Badge>
                    ) : (
                      <Badge variant="secondary">ok</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
