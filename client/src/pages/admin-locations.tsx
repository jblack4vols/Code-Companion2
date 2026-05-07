import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, MapPin } from "lucide-react";
import { useAuth, hasPermission } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Location } from "@shared/schema";

export default function AdminLocationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);

  const { data: locations, isLoading } = useQuery<Location[]>({ queryKey: ["/api/locations"] });

  const canEdit = user ? hasPermission(user.role, "edit", "location") : false;
  const canCreate = user ? hasPermission(user.role, "create", "location") : false;
  const canDelete = user?.role === "OWNER";

  const saveMutation = useMutation({
    mutationFn: async (data: { name: FormDataEntryValue | null; address: FormDataEntryValue | null; city: FormDataEntryValue | null; state: FormDataEntryValue | null; zip?: FormDataEntryValue | null; phone?: FormDataEntryValue | null; fax?: FormDataEntryValue | null; isActive: boolean }) => {
      if (editingLocation) {
        const res = await apiRequest("PATCH", `/api/locations/${editingLocation.id}`, data);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/locations", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setShowDialog(false);
      setEditingLocation(null);
      toast({ title: editingLocation ? "Location updated" : "Location added" });
    },
    onError: (err: unknown) => toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/locations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      toast({ title: "Location deleted" });
    },
    onError: (err: unknown) => toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/locations/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      toast({ title: "Status updated" });
    },
    onError: (err: unknown) => toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    saveMutation.mutate({
      name: fd.get("name"),
      address: fd.get("address"),
      city: fd.get("city"),
      state: fd.get("state"),
      zip: fd.get("zip") || undefined,
      phone: fd.get("phone") || undefined,
      fax: fd.get("fax") || undefined,
      isActive: editingLocation ? editingLocation.isActive : true,
    });
  };

  const openEdit = (loc: Location) => {
    setEditingLocation(loc);
    setShowDialog(true);
  };

  const openAdd = () => {
    setEditingLocation(null);
    setShowDialog(true);
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-locations-title">Locations</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Manage clinic locations</p>
        </div>
        {canCreate && (
          <Dialog open={showDialog} onOpenChange={(open) => { setShowDialog(open); if (!open) setEditingLocation(null); }}>
            <DialogTrigger asChild>
              <Button onClick={openAdd} data-testid="button-add-location">
                <Plus className="w-4 h-4 mr-2" />Add Location
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingLocation ? "Edit Location" : "Add New Location"}</DialogTitle>
                <DialogDescription>
                  {editingLocation ? "Update clinic location details" : "Add a new clinic location"}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    required
                    defaultValue={editingLocation?.name || ""}
                    data-testid="input-location-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="address">Address *</Label>
                  <Input
                    id="address"
                    name="address"
                    required
                    defaultValue={editingLocation?.address || ""}
                    data-testid="input-location-address"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      name="city"
                      required
                      defaultValue={editingLocation?.city || ""}
                      data-testid="input-location-city"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="state">State *</Label>
                    <Input
                      id="state"
                      name="state"
                      required
                      maxLength={2}
                      placeholder="TN"
                      defaultValue={editingLocation?.state || ""}
                      data-testid="input-location-state"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="zip">ZIP</Label>
                    <Input
                      id="zip"
                      name="zip"
                      placeholder="37813"
                      maxLength={10}
                      defaultValue={editingLocation?.zip || ""}
                      data-testid="input-location-zip"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      defaultValue={editingLocation?.phone || ""}
                      data-testid="input-location-phone"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fax">Fax</Label>
                  <Input
                    id="fax"
                    name="fax"
                    type="tel"
                    defaultValue={editingLocation?.fax || ""}
                    data-testid="input-location-fax"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => { setShowDialog(false); setEditingLocation(null); }}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending} data-testid="button-submit-location">
                    {saveMutation.isPending ? "Saving..." : editingLocation ? "Update Location" : "Add Location"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !locations?.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <MapPin className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm text-muted-foreground">No locations found</p>
              <p className="text-xs text-muted-foreground mt-1">Add your first clinic location to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[160px]">Name</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {locations.map(loc => (
                    <TableRow key={loc.id} data-testid={`row-location-${loc.id}`}>
                      <TableCell className="text-sm font-medium" data-testid={`text-location-name-${loc.id}`}>
                        {loc.name}
                      </TableCell>
                      <TableCell className="text-sm" data-testid={`text-location-address-${loc.id}`}>
                        {loc.address}
                      </TableCell>
                      <TableCell className="text-sm">{loc.city}</TableCell>
                      <TableCell className="text-sm">{loc.state}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{loc.phone || "-"}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] cursor-pointer ${loc.isActive ? "bg-chart-4/15 text-chart-4" : "bg-muted text-muted-foreground"}`}
                          onClick={() => canEdit && toggleMutation.mutate({ id: loc.id, isActive: !loc.isActive })}
                          data-testid={`badge-location-status-${loc.id}`}
                        >
                          {loc.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEdit(loc)}
                              aria-label={`Edit ${loc.name}`}
                              data-testid={`button-edit-location-${loc.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label={`Delete ${loc.name}`}
                                  data-testid={`button-delete-location-${loc.id}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Location</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "{loc.name}"? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteMutation.mutate(loc.id)}
                                    data-testid={`button-confirm-delete-location-${loc.id}`}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
