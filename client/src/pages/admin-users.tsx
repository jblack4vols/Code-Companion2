import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, Shield } from "lucide-react";
import type { User } from "@shared/schema";

const roleLabels: Record<string, string> = {
  OWNER: "Owner",
  DIRECTOR: "Director",
  MARKETER: "Marketer",
  FRONT_DESK: "Front Desk",
  ANALYST: "Analyst",
};

const roleBadgeColor: Record<string, string> = {
  OWNER: "bg-chart-5/15 text-chart-5",
  DIRECTOR: "bg-chart-1/15 text-chart-1",
  MARKETER: "bg-chart-2/15 text-chart-2",
  FRONT_DESK: "bg-chart-3/15 text-chart-3",
  ANALYST: "bg-chart-4/15 text-chart-4",
};

export default function AdminUsersPage() {
  const { data: users, isLoading } = useQuery<User[]>({ queryKey: ["/api/users"] });

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-users-title">Users</h1>
        <p className="text-sm text-muted-foreground">Manage team members and roles</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {users?.map(u => {
            const initials = u.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
            return (
              <Card key={u.id} data-testid={`card-user-${u.id}`}>
                <CardContent className="p-4 flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${roleBadgeColor[u.role]}`}>
                    {roleLabels[u.role] || u.role}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
