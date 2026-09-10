import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, RefreshCw, AlertTriangle, DollarSign, Activity, Coins } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { getAdminDisplayName } from "@/lib/adminDisplayNames";
import { formatDateTime } from "@/lib/dateFormat";

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
  user_id: string | null;
}

const RANGE_OPTIONS = [
  { label: "Last 24h", hours: 24 },
  { label: "Last 7 days", hours: 24 * 7 },
  { label: "This month", hours: 24 * 30 },
  { label: "Last 90 days", hours: 24 * 90 },
];

// Approximate pricing per 1M tokens (USD). Adjust as needed.
const PRICE_INPUT_PER_M = 3;
const PRICE_OUTPUT_PER_M = 15;

const estimateCost = (prompt: number, completion: number) =>
  (prompt / 1_000_000) * PRICE_INPUT_PER_M + (completion / 1_000_000) * PRICE_OUTPUT_PER_M;

const fmtUSD = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export default function AiUsage() {
  const [rows, setRows] = useState<AiUsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeHours, setRangeHours] = useState(24 * 7);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  const fetchData = async () => {
    setLoading(true);
    const since = new Date(Date.now() - rangeHours * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from("ai_usage_logs")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) {
      console.error("Failed to load AI usage:", error);
      setRows([]);
    } else {
      const list = (data || []) as AiUsageRow[];
      setRows(list);
      // Resolve display names for unique user_ids
      const ids = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean))) as string[];
      const names: Record<string, string> = {};
      await Promise.all(
        ids.map(async (id) => {
          try {
            names[id] = await getAdminDisplayName(id);
          } catch {
            names[id] = id.slice(0, 8);
          }
        })
      );
      setUserNames(names);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeHours]);

  const filteredRows = useMemo(
    () => (showErrorsOnly ? rows.filter((r) => r.status === "error") : rows),
    [rows, showErrorsOnly]
  );

  const summary = useMemo(() => {
    const byFn: Record<string, { calls: number; promptTokens: number; completionTokens: number; tokens: number; errors: number; cost: number }> = {};
    const byUser: Record<string, { calls: number; tokens: number; cost: number }> = {};
    let totalCalls = 0;
    let totalTokens = 0;
    let totalPrompt = 0;
    let totalCompletion = 0;
    let totalErrors = 0;
    let nullTokenSuccess = 0;

    for (const r of rows) {
      totalCalls++;
      const p = r.prompt_tokens || 0;
      const c = r.completion_tokens || 0;
      const t = r.total_tokens || 0;
      totalPrompt += p;
      totalCompletion += c;
      totalTokens += t;
      if (r.status === "error") totalErrors++;
      if (r.status === "success" && (r.prompt_tokens == null || r.completion_tokens == null || r.total_tokens == null)) {
        nullTokenSuccess++;
      }

      const key = r.function_name || "(unknown)";
      if (!byFn[key]) byFn[key] = { calls: 0, promptTokens: 0, completionTokens: 0, tokens: 0, errors: 0, cost: 0 };
      byFn[key].calls++;
      byFn[key].promptTokens += p;
      byFn[key].completionTokens += c;
      byFn[key].tokens += t;
      byFn[key].cost += estimateCost(p, c);
      if (r.status === "error") byFn[key].errors++;

      const u = r.user_id || "system";
      if (!byUser[u]) byUser[u] = { calls: 0, tokens: 0, cost: 0 };
      byUser[u].calls++;
      byUser[u].tokens += t;
      byUser[u].cost += estimateCost(p, c);
    }

    const totalCost = estimateCost(totalPrompt, totalCompletion);
    const fnBreakdown = Object.entries(byFn)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);
    const userBreakdown = Object.entries(byUser)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.cost - a.cost || b.calls - a.calls);

    return { totalCalls, totalTokens, totalPrompt, totalCompletion, totalErrors, totalCost, nullTokenSuccess, fnBreakdown, userBreakdown };
  }, [rows]);

  const fmt = (n: number) => n.toLocaleString();

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Helmet>
        <title>AI Usage Dashboard | Admin</title>
        <meta name="description" content="Track AI Gateway usage, cost, and errors by function and user." />
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

      {summary.nullTokenSuccess > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{summary.nullTokenSuccess}</strong> successful call{summary.nullTokenSuccess === 1 ? "" : "s"} missing token data — those rows are not included in cost totals. Check the function logging code.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3.5">
        <StatCard
          accent="amber"
          icon={Activity}
          label="Total AI Calls"
          value={fmt(summary.totalCalls)}
        />
        <StatCard
          accent="amber"
          icon={Coins}
          label="Total Tokens"
          value={fmt(summary.totalTokens)}
          sublabel={`${fmt(summary.totalPrompt)} in · ${fmt(summary.totalCompletion)} out`}
        />
        <StatCard
          accent="amber"
          icon={DollarSign}
          label="Est. Total Cost"
          value={fmtUSD(summary.totalCost)}
          sublabel={`$${PRICE_INPUT_PER_M}/1M in · $${PRICE_OUTPUT_PER_M}/1M out`}
        />
        <StatCard
          accent="red"
          icon={AlertTriangle}
          label="Errors"
          value={fmt(summary.totalErrors)}
          sublabel={
            summary.totalErrors > 0 ? (
              <Button
                variant="link"
                size="sm"
                className="px-0 h-auto text-xs"
                onClick={() => setShowErrorsOnly((v) => !v)}
              >
                {showErrorsOnly ? "Show all" : "Show errors only"}
              </Button>
            ) : undefined
          }
        />
      </div>

      <Card>
        <CardHeader><CardTitle>Usage by Function (sorted by cost)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Function</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Total Tokens</TableHead>
                <TableHead className="text-right">Avg / Call</TableHead>
                <TableHead className="text-right">Est. Cost</TableHead>
                <TableHead className="text-right">Errors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.fnBreakdown.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No AI usage logged yet for this range.
                </TableCell></TableRow>
              ) : summary.fnBreakdown.map((b) => (
                <TableRow key={b.name}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="text-right">{fmt(b.calls)}</TableCell>
                  <TableCell className="text-right">{fmt(b.tokens)}</TableCell>
                  <TableCell className="text-right">{b.calls ? fmt(Math.round(b.tokens / b.calls)) : "—"}</TableCell>
                  <TableCell className="text-right font-medium">{fmtUSD(b.cost)}</TableCell>
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
        <CardHeader><CardTitle>Usage by User</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Est. Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.userBreakdown.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No data.</TableCell></TableRow>
              ) : summary.userBreakdown.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.id === "system" ? <span className="text-muted-foreground italic">System / unauthenticated</span> : (userNames[u.id] || u.id.slice(0, 8))}
                  </TableCell>
                  <TableCell className="text-right">{fmt(u.calls)}</TableCell>
                  <TableCell className="text-right">{fmt(u.tokens)}</TableCell>
                  <TableCell className="text-right font-medium">{fmtUSD(u.cost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Recent Calls {showErrorsOnly && <Badge variant="destructive" className="ml-2">errors only</Badge>}</span>
            <span className="text-xs text-muted-foreground font-normal">Showing {Math.min(filteredRows.length, 200)} of {filteredRows.length}</span>
          </CardTitle>
        </CardHeader>
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
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.slice(0, 200).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs whitespace-nowrap">{formatDateTime(r.created_at)}</TableCell>
                  <TableCell className="font-medium">{r.function_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.model || "—"}</TableCell>
                  <TableCell className="text-right">{r.prompt_tokens ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.completion_tokens ?? "—"}</TableCell>
                  <TableCell className="text-right font-medium">{r.total_tokens ?? "—"}</TableCell>
                  <TableCell className="text-right text-xs">
                    {r.prompt_tokens != null && r.completion_tokens != null
                      ? fmtUSD(estimateCost(r.prompt_tokens, r.completion_tokens))
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {r.status === "error" ? (
                      <Badge variant="destructive" title={r.error_message ?? undefined}>error</Badge>
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
