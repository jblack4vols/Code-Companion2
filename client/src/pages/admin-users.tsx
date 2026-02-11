import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Users, Plus, Pencil, Trash2 } from "lucide-react";
import { useAuth, hasPermission } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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

const roles = ["OWNER", "DIRECTOR", "MARKETER", "FRONT_DESK", "ANALYST"] as const;

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const { data: users, isLoading } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);

  const isOwner = currentUser?.role === "OWNER";

  if (!isOwner) {
    return (
      <div className="p-4 sm:p-6 flex flex-col items-center justify-center min-h-[50vh]">
        <p className="text-sm text-muted-foreground">You don't have permission to view this page.</p>
      </div>
    );
  }

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setShowAdd(false);
      toast({ title: "User created successfully" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/users/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditUser(null);
      toast({ title: "User updated successfully" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/users/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setDeleteUser(null);
      toast({ title: "User deleted" });
    },
    onError: (err: any) => {
      setDeleteUser(null);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = fd.get("password") as string;
    if (password.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    addMutation.mutate({
      name: fd.get("name"),
      email: fd.get("email"),
      password,
      role: fd.get("role"),
    });
  };

  const handleEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editUser) return;
    const fd = new FormData(e.currentTarget);
    const password = fd.get("password") as string;
    const data: any = {
      name: fd.get("name"),
      email: fd.get("email"),
      role: fd.get("role"),
    };
    if (password && password.length > 0) {
      if (password.length < 6) {
        toast({ title: "Password must be at least 6 characters", variant: "destructive" });
        return;
      }
      data.password = password;
    }
    updateMutation.mutate({ id: editUser.id, data });
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-users-title">Users</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Manage team members and roles</p>
        </div>
        {isOwner && (
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-user"><Plus className="w-4 h-4 mr-2" />Add User</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
                <DialogDescription>Create a new team member account</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Full Name *</Label>
                  <Input name="name" required placeholder="Jane Smith" data-testid="input-user-name" />
                </div>
                <div className="space-y-1.5">
                  <Label>Email *</Label>
                  <Input name="email" type="email" required placeholder="jane@tristar360.com" data-testid="input-user-email" />
                </div>
                <div className="space-y-1.5">
                  <Label>Password *</Label>
                  <Input name="password" type="password" required placeholder="Min 6 characters" data-testid="input-user-password" />
                </div>
                <div className="space-y-1.5">
                  <Label>Role *</Label>
                  <select name="role" className="w-full rounded-md border bg-background px-3 py-2 text-sm" required data-testid="select-user-role">
                    {roles.map(r => (
                      <option key={r} value={r}>{roleLabels[r]}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                  <Button type="submit" disabled={addMutation.isPending} data-testid="button-submit-user">
                    {addMutation.isPending ? "Creating..." : "Create User"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {users?.map(u => {
            const initials = u.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
            const isSelf = u.id === currentUser?.id;
            return (
              <Card key={u.id} data-testid={`card-user-${u.id}`}>
                <CardContent className="p-4 flex items-center gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}{isSelf ? " (You)" : ""}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${roleBadgeColor[u.role]}`}>
                    {roleLabels[u.role] || u.role}
                  </Badge>
                  {isOwner && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditUser(u)}
                        data-testid={`button-edit-user-${u.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {!isSelf && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteUser(u)}
                          data-testid={`button-delete-user-${u.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user details and role</DialogDescription>
          </DialogHeader>
          {editUser && (
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Full Name *</Label>
                <Input name="name" required defaultValue={editUser.name} data-testid="input-edit-user-name" />
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input name="email" type="email" required defaultValue={editUser.email} data-testid="input-edit-user-email" />
              </div>
              <div className="space-y-1.5">
                <Label>New Password (leave blank to keep current)</Label>
                <Input name="password" type="password" placeholder="Leave blank to keep unchanged" data-testid="input-edit-user-password" />
              </div>
              <div className="space-y-1.5">
                <Label>Role *</Label>
                <select name="role" className="w-full rounded-md border bg-background px-3 py-2 text-sm" required defaultValue={editUser.role} data-testid="select-edit-user-role">
                  {roles.map(r => (
                    <option key={r} value={r}>{roleLabels[r]}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
                <Button type="submit" disabled={updateMutation.isPending} data-testid="button-submit-edit-user">
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deleteUser?.name}? This action cannot be undone. Users with existing interactions or tasks cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-user">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteUser && deleteMutation.mutate(deleteUser.id)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-user"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
