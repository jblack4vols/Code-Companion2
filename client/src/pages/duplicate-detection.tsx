import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Merge, AlertTriangle, CheckCircle2 } from "lucide-react";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Physician } from "@shared/schema";

interface DuplicatePair {
  id1: string;
  id2: string;
  first_name_1: string;
  last_name_1: string;
  npi_1: string;
  practice_1: string;
  city_1: string;
  status_1: string;
  first_name_2: string;
  last_name_2: string;
  npi_2: string;
  practice_2: string;
  city_2: string;
  status_2: string;
  match_reason: string;
}

function getMatchBadgeProps(reason: string) {
  if (reason === "NPI Match") {
    return { variant: "destructive" as const, className: "" };
  }
  if (reason === "Name + City Match") {
    return { variant: "outline" as const, className: "bg-chart-5/15 text-chart-5 border-chart-5/30" };
  }
  return { variant: "outline" as const, className: "" };
}

function PhysicianInfo({ label, name, npi, practice, city, status }: { label: string; name: string; npi: string; practice: string; city: string; status: string }) {
  return (
    <div className="flex-1 min-w-0 space-y-1.5">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="text-sm font-semibold truncate">{name}</p>
      <div className="space-y-0.5 text-xs text-muted-foreground">
        {npi && <p>NPI: {npi}</p>}
        {practice && <p className="truncate">{practice}</p>}
        {city && <p>{city}</p>}
      </div>
      <Badge variant="outline" className="text-[10px]">{status}</Badge>
    </div>
  );
}

export default function DuplicateDetectionPage() {
  const { toast } = useToast();

  const { data: duplicates, isLoading } = useQuery<DuplicatePair[]>({
    queryKey: ["/api/physicians/duplicates"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const mergeMutation = useMutation({
    mutationFn: async ({ keepId, removeId }: { keepId: string; removeId: string }) => {
      const res = await apiRequest("POST", "/api/physicians/merge", { keepId, removeId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/physicians/duplicates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/physicians"] });
      toast({ title: "Referring providers merged successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Merge failed", description: err.message, variant: "destructive" });
    },
  });

  const handleMerge = (keepId: string, removeId: string, keepName: string, removeName: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to keep "${keepName}" and remove "${removeName}"? This action cannot be undone.`
    );
    if (confirmed) {
      mergeMutation.mutate({ keepId, removeId });
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
        <div>
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-duplicate-detection-title">
              Duplicate Detection
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Review and merge potential duplicate referring provider records
            </p>
          </div>
        </div>
        {duplicates && duplicates.length > 0 && (
          <Badge variant="outline" className="text-xs" data-testid="badge-duplicate-count">
            {duplicates.length} pair{duplicates.length !== 1 ? "s" : ""} found
          </Badge>
        )}
      </div>

      {!duplicates || duplicates.length === 0 ? (
        <Card>
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <CheckCircle2 className="w-10 h-10 text-chart-4 mb-3" />
            <p className="text-sm font-medium" data-testid="text-no-duplicates">No duplicate referring providers found</p>
            <p className="text-xs text-muted-foreground mt-1">All records appear to be unique</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {duplicates.map((pair, index) => {
            const badgeProps = getMatchBadgeProps(pair.match_reason);
            const name1 = `Dr. ${pair.first_name_1} ${pair.last_name_1}`;
            const name2 = `Dr. ${pair.first_name_2} ${pair.last_name_2}`;

            return (
              <Card key={`${pair.id1}-${pair.id2}`} data-testid={`card-duplicate-${index}`}>
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">Potential Duplicate</span>
                  </div>
                  <Badge {...badgeProps} data-testid={`badge-match-reason-${index}`}>
                    {pair.match_reason}
                  </Badge>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <PhysicianInfo
                      label="Provider 1"
                      name={name1}
                      npi={pair.npi_1}
                      practice={pair.practice_1}
                      city={pair.city_1}
                      status={pair.status_1}
                    />
                    <PhysicianInfo
                      label="Provider 2"
                      name={name2}
                      npi={pair.npi_2}
                      practice={pair.practice_2}
                      city={pair.city_2}
                      status={pair.status_2}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleMerge(pair.id1, pair.id2, name1, name2)}
                      disabled={mergeMutation.isPending}
                      data-testid={`button-keep-left-${index}`}
                    >
                      <Merge className="w-4 h-4 mr-1" />
                      Keep Left
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleMerge(pair.id2, pair.id1, name2, name1)}
                      disabled={mergeMutation.isPending}
                      data-testid={`button-keep-right-${index}`}
                    >
                      <Merge className="w-4 h-4 mr-1" />
                      Keep Right
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}