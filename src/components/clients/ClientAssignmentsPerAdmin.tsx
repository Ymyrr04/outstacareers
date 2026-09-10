import { useMemo, useState } from 'react';
import { getAdminDisplayName } from '@/lib/adminDisplayNames';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Briefcase, ChevronDown, ChevronRight, Users, Percent, Award, X } from 'lucide-react';
import { formatDate } from "@/lib/dateFormat";

export interface AssignmentRow {
  id: string;
  client_id: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  job_title: string | null;
  hired_by?: string | null;
  applicant?: { id: string; full_name: string | null } | null;
  client?: { id: string; company_name: string; industry: string | null } | null;
}

const ACTIVE_STATUSES = ['active', 'rendering', 'scheduled'];

const isActiveStatus = (s: string) => ACTIVE_STATUSES.includes(s);

const fmtDate = (d: string | null) =>
  d ? formatDate(d) : '—';

const durationDays = (start: string | null, end: string | null) => {
  if (!start) return null;
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  return Math.max(0, Math.floor((e - s) / 86400000));
};

const fmtDuration = (days: number | null) => {
  if (days === null) return '—';
  if (days < 31) return `${days}d`;
  const months = Math.floor(days / 30);
  const rem = days % 30;
  return rem > 0 ? `${months}mo ${rem}d` : `${months}mo`;
};

const rateColor = (pct: number) =>
  pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-amber-600' : 'text-red-600';

export const ClientAssignmentsPerAdmin = ({ contractors }: { contractors: AssignmentRow[] }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [adminFilter, setAdminFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startFrom, setStartFrom] = useState('');
  const [startTo, setStartTo] = useState('');
  const [drill, setDrill] = useState<{ admin: string; client: string } | null>(null);

  const withMeta = useMemo(
    () =>
      contractors.map((c) => ({
        ...c,
        adminName: c.hired_by ? getAdminDisplayName(c.hired_by) || 'Unassigned' : 'Unassigned',
        clientName: c.client?.company_name || 'Unknown Client',
        role: c.job_title || 'Unknown',
        active: isActiveStatus(c.status),
      })),
    [contractors]
  );

  const adminOptions = useMemo(
    () => Array.from(new Set(withMeta.map((c) => c.adminName))).sort(),
    [withMeta]
  );
  const clientOptions = useMemo(
    () => Array.from(new Set(withMeta.map((c) => c.clientName))).sort(),
    [withMeta]
  );
  const roleOptions = useMemo(
    () => Array.from(new Set(withMeta.map((c) => c.role))).sort(),
    [withMeta]
  );

  const filtered = useMemo(
    () =>
      withMeta.filter((c) => {
        if (adminFilter !== 'all' && c.adminName !== adminFilter) return false;
        if (clientFilter !== 'all' && c.clientName !== clientFilter) return false;
        if (roleFilter !== 'all' && c.role !== roleFilter) return false;
        if (statusFilter === 'active' && !c.active) return false;
        if (statusFilter === 'terminated' && c.active) return false;
        if (startFrom && (!c.start_date || c.start_date < startFrom)) return false;
        if (startTo && (!c.start_date || c.start_date > startTo)) return false;
        return true;
      }),
    [withMeta, adminFilter, clientFilter, roleFilter, statusFilter, startFrom, startTo]
  );

  const grouped = useMemo(() => {
    const admins: Record<
      string,
      {
        admin: string;
        hired: number;
        active: number;
        terminated: number;
        clients: Record<
          string,
          { client: string; roles: Set<string>; hired: number; active: number; terminated: number }
        >;
      }
    > = {};

    filtered.forEach((c) => {
      if (!admins[c.adminName]) {
        admins[c.adminName] = { admin: c.adminName, hired: 0, active: 0, terminated: 0, clients: {} };
      }
      const a = admins[c.adminName];
      a.hired += 1;
      if (c.active) a.active += 1;
      else a.terminated += 1;

      if (!a.clients[c.clientName]) {
        a.clients[c.clientName] = {
          client: c.clientName,
          roles: new Set<string>(),
          hired: 0,
          active: 0,
          terminated: 0,
        };
      }
      const cl = a.clients[c.clientName];
      cl.roles.add(c.role);
      cl.hired += 1;
      if (c.active) cl.active += 1;
      else cl.terminated += 1;
    });

    return Object.values(admins)
      .map((a) => ({
        ...a,
        rate: a.hired > 0 ? Math.round((a.active / a.hired) * 100) : 0,
        clientRows: Object.values(a.clients)
          .map((cl) => ({
            ...cl,
            roleList: Array.from(cl.roles).sort(),
            rate: cl.hired > 0 ? Math.round((cl.active / cl.hired) * 100) : 0,
          }))
          .sort((x, y) => y.hired - x.hired),
      }))
      .sort((x, y) => y.hired - x.hired);
  }, [filtered]);

  const stats = useMemo(() => {
    const pairs = new Set(filtered.map((c) => `${c.adminName}|||${c.clientName}`));
    const total = filtered.length;
    const activeCount = filtered.filter((c) => c.active).length;
    const activeByAdmin: Record<string, number> = {};
    filtered.forEach((c) => {
      if (c.active) activeByAdmin[c.adminName] = (activeByAdmin[c.adminName] || 0) + 1;
    });
    const top = Object.entries(activeByAdmin).sort((a, b) => b[1] - a[1])[0];
    return {
      relationships: pairs.size,
      rate: total > 0 ? Math.round((activeCount / total) * 100) : 0,
      topAdmin: top ? top[0] : '—',
      topAdminCount: top ? top[1] : 0,
    };
  }, [filtered]);

  const drillRows = useMemo(() => {
    if (!drill) return [];
    return filtered
      .filter((c) => c.adminName === drill.admin && c.clientName === drill.client)
      .map((c) => ({
        id: c.id,
        name: c.applicant?.full_name || 'Unknown',
        role: c.role,
        start: c.start_date,
        end: c.end_date,
        status: c.status,
        active: c.active,
        days: durationDays(c.start_date, c.end_date),
      }))
      .sort((a, b) => (b.start || '').localeCompare(a.start || ''));
  }, [filtered, drill]);

  const resetFilters = () => {
    setAdminFilter('all');
    setClientFilter('all');
    setRoleFilter('all');
    setStatusFilter('all');
    setStartFrom('');
    setStartTo('');
  };

  const hasFilters =
    adminFilter !== 'all' ||
    clientFilter !== 'all' ||
    roleFilter !== 'all' ||
    statusFilter !== 'all' ||
    !!startFrom ||
    !!startTo;

  const RolePills = ({ roles }: { roles: string[] }) => {
    const shown = roles.slice(0, 4);
    const extra = roles.slice(4);
    return (
      <div className="flex flex-wrap gap-1 items-center">
        {shown.map((r) => (
          <button
            key={r}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setRoleFilter(r);
            }}
            className="px-1.5 py-0.5 rounded text-[10px] bg-muted hover:bg-primary/15 hover:text-primary transition-colors max-w-[140px] truncate"
            title={`Filter by ${r}`}
          >
            {r}
          </button>
        ))}
        {extra.length > 0 && (
          <span
            className="px-1.5 py-0.5 rounded text-[10px] bg-muted/60 text-muted-foreground cursor-help"
            title={extra.join(', ')}
          >
            +{extra.length} more
          </span>
        )}
      </div>
    );
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 pl-5">
          <Briefcase className="w-4 h-4" />
          Client Assignments per Admin
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Users className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xl font-bold">{stats.relationships}</p>
              <p className="text-xs text-muted-foreground">Total client relationships</p>
            </div>
          </div>
          <div className="rounded-lg border p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <Percent className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className={`text-xl font-bold ${rateColor(stats.rate)}`}>{stats.rate}%</p>
              <p className="text-xs text-muted-foreground">Overall retention rate</p>
            </div>
          </div>
          <div className="rounded-lg border p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <Award className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-xl font-bold">{stats.topAdmin}</p>
              <p className="text-xs text-muted-foreground">
                Most active admin ({stats.topAdminCount} active)
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={adminFilter} onValueChange={setAdminFilter}>
            <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="Admin" /></SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value="all">All admins</SelectItem>
              {adminOptions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-[190px] h-8 text-xs"><SelectValue placeholder="Client" /></SelectTrigger>
            <SelectContent className="bg-popover z-50 max-h-[300px]">
              <SelectItem value="all">All clients</SelectItem>
              {clientOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent className="bg-popover z-50 max-h-[300px]">
              <SelectItem value="all">All roles</SelectItem>
              {roleOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={startFrom}
            onChange={(e) => setStartFrom(e.target.value)}
            className="w-[145px] h-8 text-xs"
            title="Start date from"
          />
          <Input
            type="date"
            value={startTo}
            onChange={(e) => setStartTo(e.target.value)}
            className="w-[145px] h-8 text-xs"
            title="Start date to"
          />
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={resetFilters}>
              <X className="w-3 h-3 mr-1" /> Clear
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Admin</TableHead>
                <TableHead className="whitespace-nowrap">Client / Company</TableHead>
                <TableHead>Roles Assigned</TableHead>
                <TableHead className="text-right whitespace-nowrap">Total Hired</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="text-right">Terminated</TableHead>
                <TableHead className="text-right whitespace-nowrap">Retention Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map((a) => {
                const isOpen = expanded[a.admin] ?? true;
                return (
                  <>
                    <TableRow
                      key={a.admin}
                      className="bg-muted/40 cursor-pointer"
                      onClick={() => setExpanded((p) => ({ ...p, [a.admin]: !isOpen }))}
                    >
                      <TableCell className="font-semibold whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          {a.admin}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {a.clientRows.length} client{a.clientRows.length === 1 ? '' : 's'}
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-right font-semibold">{a.hired}</TableCell>
                      <TableCell className="text-right font-semibold">{a.active}</TableCell>
                      <TableCell className="text-right font-semibold">{a.terminated}</TableCell>
                      <TableCell className={`text-right font-semibold ${rateColor(a.rate)}`}>{a.rate}%</TableCell>
                    </TableRow>
                    {isOpen &&
                      a.clientRows.map((cl) => (
                        <TableRow key={`${a.admin}-${cl.client}`}>
                          <TableCell />
                          <TableCell className="whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setDrill({ admin: a.admin, client: cl.client })}
                              className="text-left hover:underline underline-offset-2 hover:text-primary transition-colors"
                            >
                              {cl.client}
                            </button>
                          </TableCell>
                          <TableCell><RolePills roles={cl.roleList} /></TableCell>
                          <TableCell className="text-right">{cl.hired}</TableCell>
                          <TableCell className="text-right">{cl.active}</TableCell>
                          <TableCell className="text-right">{cl.terminated}</TableCell>
                          <TableCell className={`text-right font-medium ${rateColor(cl.rate)}`}>{cl.rate}%</TableCell>
                        </TableRow>
                      ))}
                  </>
                );
              })}
              {grouped.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-4">
                    No assignments match the current filters
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Retention rate = active ÷ total hired. Click an admin row to collapse, a client name for details, or a role pill to filter.
        </p>
      </CardContent>

      <Sheet open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-none sm:w-[92vw] lg:w-[75vw] overflow-y-auto"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <SheetHeader>
            <SheetTitle>
              {drill?.client} — hired by {drill?.admin}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contractor Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drillRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium whitespace-nowrap">{r.name}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.role}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(r.start)}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.active ? '—' : fmtDate(r.end)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          r.active
                            ? 'border-green-500/50 text-green-600 bg-green-500/10'
                            : 'border-red-500/50 text-red-600 bg-red-500/10'
                        }
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                      {fmtDuration(r.days)}
                      {r.active && r.days !== null && <span className="text-[10px] ml-1">so far</span>}
                    </TableCell>
                  </TableRow>
                ))}
                {drillRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-4">
                      No contractors found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
};

export default ClientAssignmentsPerAdmin;
