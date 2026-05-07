/**
 * Unit Economics Data Import Wizard.
 * Step-by-step wizard for importing QuickBooks revenue, payroll/cost data, and Prompt BI visit data.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Upload, FileSpreadsheet, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// --- CSRF helper ---
function getCsrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

// --- Field definitions per import type ---
type FieldDef = { key: string; label: string; required?: boolean };

const IMPORT_TYPES = [
  {
    id: "quickbooks",
    label: "QuickBooks Revenue Export",
    description: "Import gross revenue by location from QuickBooks",
  },
  {
    id: "payroll",
    label: "Payroll & Cost Data",
    description: "Import labor, rent, supplies and other fixed costs by location",
  },
  {
    id: "promptbi",
    label: "Prompt BI Visit Data",
    description: "Import provider visit counts, units, and hours worked",
  },
];

const FIELDS_BY_TYPE: Record<string, FieldDef[]> = {
  quickbooks: [
    { key: "locationName", label: "Location Name", required: true },
    { key: "periodDate", label: "Period Date", required: true },
    { key: "grossRevenue", label: "Gross Revenue", required: true },
  ],
  payroll: [
    { key: "locationName", label: "Location Name", required: true },
    { key: "periodDate", label: "Period Date", required: true },
    { key: "laborCost", label: "Labor Cost" },
    { key: "rentCost", label: "Rent Cost" },
    { key: "suppliesCost", label: "Supplies Cost" },
    { key: "otherFixedCosts", label: "Other Fixed Costs" },
  ],
  promptbi: [
    { key: "providerName", label: "Provider Name", required: true },
    { key: "locationName", label: "Location Name", required: true },
    { key: "weekStartDate", label: "Week Start Date", required: true },
    { key: "totalVisits", label: "Total Visits" },
    { key: "totalUnits", label: "Total Units" },
    { key: "hoursWorked", label: "Hours Worked" },
  ],
};

const PERIOD_TYPES = ["WEEKLY", "MONTHLY", "QUARTERLY"];

// --- Main page component ---
export default function UnitEconomicsDataImportPage() {
  const { toast } = useToast();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [importType, setImportType] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<{ headers: string[]; sampleRows: Record<string, unknown>[]; totalRows: number; suggestedMapping: Record<string, string | null> } | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [periodType, setPeriodType] = useState<string>("WEEKLY");
  const [importResult, setImportResult] = useState<{ imported: number; updated: number; errors: string[]; alertsTriggered: number } | null>(null);

  // --- Preview mutation: upload file to get headers + sample rows ---
  const previewMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("file", file!);
      formData.append("importType", importType);
      const res = await fetch("/api/unit-economics/financials/preview", {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: { "x-csrf-token": getCsrfToken() },
      });
      if (!res.ok) throw new Error((await res.json()).message || "Preview failed");
      return res.json();
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setColumnMapping(
        Object.fromEntries(
          Object.entries(data.suggestedMapping || {}).filter(([, v]) => v != null) as [string, string][]
        )
      );
      setStep(3);
    },
    onError: (err: unknown) => {
      toast({ title: "Preview failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    },
  });

  // --- Import mutation: commit rows to DB ---
  const importMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("file", file!);
      formData.append("importType", importType);
      formData.append("columnMapping", JSON.stringify(columnMapping));
      formData.append("periodType", periodType);
      const res = await fetch("/api/unit-economics/financials/import", {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: { "x-csrf-token": getCsrfToken() },
      });
      if (!res.ok) throw new Error((await res.json()).message || "Import failed");
      return res.json();
    },
    onSuccess: (data) => {
      setImportResult(data);
      setStep(4);
      queryClient.invalidateQueries({ queryKey: ["/api/unit-economics"] });
      toast({ title: "Import complete", description: `${data.imported} records imported` });
    },
    onError: (err: unknown) => {
      toast({ title: "Import failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    },
  });

  // --- Reset wizard state ---
  function resetWizard() {
    setStep(1);
    setImportType("");
    setFile(null);
    setPreviewData(null);
    setColumnMapping({});
    setPeriodType("WEEKLY");
    setImportResult(null);
  }

  // --- Step 1: Select import type ---
  function renderStep1() {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Step 1 — Select Import Type
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={importType} onValueChange={setImportType} className="space-y-3">
            {IMPORT_TYPES.map((t) => (
              <div
                key={t.id}
                className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                  importType === t.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                }`}
                onClick={() => setImportType(t.id)}
              >
                <RadioGroupItem value={t.id} id={t.id} className="mt-0.5" />
                <Label htmlFor={t.id} className="cursor-pointer space-y-0.5">
                  <span className="font-medium">{t.label}</span>
                  <p className="text-sm text-muted-foreground font-normal">{t.description}</p>
                </Label>
              </div>
            ))}
          </RadioGroup>
          <div className="flex justify-end pt-2">
            <Button
              onClick={() => setStep(2)}
              disabled={!importType}
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Step 2: Upload file ---
  function renderStep2() {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Step 2 — Upload File
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload a CSV or Excel file (.csv, .xlsx, .xls). Max 50 MB.
          </p>
          <div
            className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => document.getElementById("ue-file-input")?.click()}
          >
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <FileSpreadsheet className="w-10 h-10 text-primary" />
                <span className="font-medium">{file.name}</span>
                <span className="text-sm text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Upload className="w-10 h-10" />
                <span>Click to select file</span>
                <span className="text-xs">CSV, XLSX, XLS supported</span>
              </div>
            )}
          </div>
          <Input
            id="ue-file-input"
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files?.[0] || null;
              setFile(selected);
            }}
          />
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button
              onClick={() => previewMutation.mutate()}
              disabled={!file || previewMutation.isPending}
            >
              {previewMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4 mr-2" />
              )}
              Preview File
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Step 3: Column mapping + sample preview ---
  function renderStep3() {
    const fields = FIELDS_BY_TYPE[importType] || [];
    const headers: string[] = previewData?.headers || [];
    const sampleRows: Record<string, unknown>[] = previewData?.sampleRows || [];

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Step 3 — Map Columns
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              File has {previewData?.totalRows ?? 0} data rows. Map your file columns to the required fields.
            </p>

            {/* Period type selector for all import types */}
            <div className="grid grid-cols-2 gap-4 pb-2 border-b">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Period Type</Label>
                <Select value={periodType} onValueChange={setPeriodType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIOD_TYPES.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Column mapping rows */}
            <div className="space-y-3">
              {fields.map((field) => (
                <div key={field.key} className="grid grid-cols-2 gap-3 items-center">
                  <Label className="text-sm">
                    {field.label}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <Select
                    value={columnMapping[field.key] || ""}
                    onValueChange={(val) =>
                      setColumnMapping((prev) => ({ ...prev, [field.key]: val }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="— not mapped —" />
                    </SelectTrigger>
                    <SelectContent>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Sample rows preview */}
        {sampleRows.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Sample Data (first {sampleRows.length} rows)
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.map((h) => (
                      <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sampleRows.map((row, i) => (
                    <TableRow key={i}>
                      {headers.map((h) => (
                        <TableCell key={h} className="text-xs whitespace-nowrap">
                          {row[h] != null ? String(row[h]) : "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep(2)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <Button
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending}
          >
            {importMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Import Data
          </Button>
        </div>
      </div>
    );
  }

  // --- Step 4: Results summary ---
  function renderStep4() {
    const errList: string[] = importResult?.errors || [];
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            Import Complete
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Badge variant="secondary" className="text-sm px-3 py-1">
              Imported: {importResult?.imported ?? 0}
            </Badge>
            <Badge variant="secondary" className="text-sm px-3 py-1">
              Updated: {importResult?.updated ?? 0}
            </Badge>
            {errList.length > 0 && (
              <Badge variant="destructive" className="text-sm px-3 py-1">
                Errors: {errList.length}
              </Badge>
            )}
            {(importResult?.alertsTriggered ?? 0) > 0 && (
              <Badge className="text-sm px-3 py-1 bg-yellow-500 text-white">
                Alerts triggered: {importResult?.alertsTriggered}
              </Badge>
            )}
          </div>

          {errList.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium flex items-center gap-1.5 text-destructive">
                <AlertTriangle className="w-4 h-4" />
                Row errors (first {errList.length})
              </p>
              <div className="bg-destructive/5 rounded-md p-3 space-y-1 max-h-48 overflow-auto">
                {errList.map((e, i) => (
                  <p key={i} className="text-xs text-destructive">{e}</p>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2">
            <Button onClick={resetWizard} variant="outline">
              Import Another File
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Step indicator ---
  const steps = ["Select Type", "Upload", "Map Columns", "Results"];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Import Financial Data</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Import QuickBooks revenue, payroll/cost data, or Prompt BI visit data.
        </p>
      </div>

      {/* Step progress indicator */}
      <div className="flex items-center gap-2">
        {steps.map((label, idx) => {
          const num = idx + 1;
          const active = step === num;
          const done = step > num;
          return (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  done
                    ? "bg-primary text-primary-foreground"
                    : active
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {done ? <CheckCircle2 className="w-4 h-4" /> : num}
              </div>
              <span className={`text-xs hidden sm:inline ${active ? "font-medium" : "text-muted-foreground"}`}>
                {label}
              </span>
              {idx < steps.length - 1 && (
                <div className="w-6 h-px bg-border mx-1" />
              )}
            </div>
          );
        })}
      </div>

      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}
    </div>
  );
}
