import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollText } from "lucide-react";
import type { AuditLog, User } from "@shared/schema";
import { format } from "date-fns";

const entityOptions = [
  { label: "All Entities", value: "all" },
  { label: "Physician", value: "Physician" },
  { label: "Interaction", value: "Interaction" },
  { label: "Referral", value: "Referral" },
  { label: "Location", value: "Location" },
  { label: "CalendarEvent", value: "CalendarEvent" },
  { label: "Task", value: "Task" },
];

const actionOptions = [
  { label: "All Actions", value: "all" },
  { label: "CREATE", value: "CREATE" },
  { label: "UPDATE", value: "UPDATE" },
  { label: "DELETE", value: "DELETE" },
  { label: "SYNC_OUTLOOK", value: "SYNC_OUTLOOK" },
];

const actionBadge: Record<string, string> = {
  CREATE: "bg-chart-4/15 text-chart-4",
  UPDATE: "bg-chart-1/15 text-chart-1",
  DELETE: "bg-chart-5/15 text-chart-5",
  SYNC_OUTLOOK: "bg-chart-3/15 text-chart-3",
};

export default function AuditLogPage() {
  const [entityFilter, setEntityFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  const queryParams = new URLSearchParams();
  if (entityFilter !== "all") queryParams.set("entity", entityFilter);
  if (actionFilter !== "all") queryParams.set("action", actionFilter);
  const qs = queryParams.toString();

  const { data: logs, isLoading } = useQuery<AuditLog[]>({
    queryKey: ["/api/audit-logs", entityFilter, actionFilter],
    queryFn: async () => {
      const url = qs ? `/api/audit-logs?${qs}` : "/api/audit-logs";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  const { data: users } = useQuery<User[]>({ queryKey: ["/api/users"] });

  const userMap = new Map(users?.map(u => [u.id, u.name]) || []);

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-audit-log-title">Audit Log</h1>
        <p className="text-sm text-muted-foreground">Chronological history of all system actions</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-filter-entity">
            <SelectValue placeholder="Entity" />
          </SelectTrigger>
          <SelectContent>
            {entityOptions.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-filter-action">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            {actionOptions.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !logs?.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ScrollText className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm text-muted-foreground">No audit logs found</p>
              <p className="text-xs text-muted-foreground mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[160px]">Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Entity ID</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map(log => (
                    <TableRow key={log.id} data-testid={`row-audit-log-${log.id}`}>
                      <TableCell className="text-sm text-muted-foreground" data-testid={`text-audit-timestamp-${log.id}`}>
                        {format(new Date(log.timestamp), "MMM d, yyyy h:mm a")}
                      </TableCell>
                      <TableCell className="text-sm" data-testid={`text-audit-user-${log.id}`}>
                        {log.userId ? userMap.get(log.userId) || log.userId : "System"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${actionBadge[log.action] || "bg-muted text-muted-foreground"}`}
                          data-testid={`badge-audit-action-${log.id}`}
                        >
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm" data-testid={`text-audit-entity-${log.id}`}>
                        {log.entity}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono text-xs" data-testid={`text-audit-entity-id-${log.id}`}>
                        {log.entityId}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate" data-testid={`text-audit-details-${log.id}`}>
                        {log.detailJson ? JSON.stringify(log.detailJson) : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-right" data-testid="text-audit-count">
        {logs?.length || 0} entries
      </p>
    </div>
  );
}
