import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Upload, FileSpreadsheet, ArrowRight, CheckCircle2, AlertTriangle, Loader2, X, ArrowLeft, Info, Plus, Trash2, ShieldCheck, ShieldX, Shield, Sparkles, Download } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function ensureCsrfToken(): Promise<string | null> {
  let token = getCsrfToken();
  if (!token) {
    try {
      const res = await fetch("/api/csrf-token", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        token = data.token;
      }
    } catch {}
  }
  return token;
}

type ImportType = "physicians" | "referrals";
type Step = "select" | "upload" | "map" | "importing" | "result";

const PHYSICIAN_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "firstName", label: "First Name", required: true },
  { key: "lastName", label: "Last Name", required: true },
  { key: "credentials", label: "Credentials" },
  { key: "npi", label: "NPI" },
  { key: "practiceName", label: "Practice / Company Name" },
  { key: "address1", label: "Street Address 1" },
  { key: "address2", label: "Street Address 2" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "Zip Code" },
  { key: "phone", label: "Phone" },
  { key: "fax", label: "Fax" },
  { key: "email", label: "Email" },
  { key: "specialty", label: "Specialty" },
];

const REFERRAL_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "patientAccountNumber", label: "Patient Account Number" },
  { key: "patientName", label: "Patient Name" },
  { key: "caseTitle", label: "Case Title" },
  { key: "caseTherapist", label: "Case Therapist" },
  { key: "facility", label: "Facility / Clinic", required: true },
  { key: "caseStatus", label: "Case Status" },
  { key: "dateOfInitialEval", label: "Date of Initial Eval" },
  { key: "primaryInsurance", label: "Primary Insurance" },
  { key: "primaryPayerType", label: "Primary Payer Type" },
  { key: "referringDoctor", label: "Referring Doctor" },
  { key: "referringDoctorNpi", label: "Referring Doctor NPI" },
  { key: "referralSource", label: "Referral Source" },
  { key: "dischargeDate", label: "Discharge Date" },
  { key: "dischargeReason", label: "Discharge Reason" },
  { key: "scheduledVisits", label: "Scheduled Visits" },
  { key: "arrivedVisits", label: "Arrived Visits" },
  { key: "createdDate", label: "Created Date", required: true },
  { key: "dateOfFirstScheduledVisit", label: "Date of First Scheduled Visit" },
  { key: "dateOfFirstArrivedVisit", label: "Date of First Arrived Visit" },
  { key: "createdToArrived", label: "Created to Arrived (days)" },
  { key: "discipline", label: "Discipline (PT/OT/ST)" },
  { key: "diagnosisCategory", label: "Diagnosis Category" },
];

const PHYSICIAN_AUTO_MAP: Record<string, string> = {
  "Contact First Name": "firstName",
  "First Name": "firstName",
  "Contact Last Name": "lastName",
  "Last Name": "lastName",
  "Contact Credentials": "credentials",
  "Credentials": "credentials",
  "Contact NPI": "npi",
  "NPI": "npi",
  "Business/Company Name": "practiceName",
  "Practice Name": "practiceName",
  "Company Name": "practiceName",
  "Default Contact Street 1": "address1",
  "Street 1": "address1",
  "Address": "address1",
  "Default Contact Street 2": "address2",
  "Street 2": "address2",
  "Default Contact City": "city",
  "City": "city",
  "Default Contact State": "state",
  "State": "state",
  "Default Contact Zip": "zip",
  "Zip": "zip",
  "Zip Code": "zip",
  "Default Contact Phone": "phone",
  "Phone": "phone",
  "Default Contact Fax": "fax",
  "Fax": "fax",
  "Default Contact Email": "email",
  "Email": "email",
  "Specialty": "specialty",
};

const REFERRAL_AUTO_MAP: Record<string, string> = {
  "Patient Account Number": "patientAccountNumber",
  "Patient Name": "patientName",
  "Case Title": "caseTitle",
  "Case Therapist": "caseTherapist",
  "Case Facility": "facility",
  "Facility": "facility",
  "Case Status": "caseStatus",
  "Date of Initial Eval": "dateOfInitialEval",
  "Primary Insurance": "primaryInsurance",
  "Primary Payer Type": "primaryPayerType",
  "Referring Doctor": "referringDoctor",
  "Referring Doctor NPI": "referringDoctorNpi",
  "Referral Source": "referralSource",
  "Discharge Date": "dischargeDate",
  "Discharge Reason": "dischargeReason",
  "Scheduled Visits": "scheduledVisits",
  "Arrived Visits": "arrivedVisits",
  "Created Date": "createdDate",
  "Date of First Scheduled Visit": "dateOfFirstScheduledVisit",
  "Date of First Arrived Visit": "dateOfFirstArrivedVisit",
  "Created to Arrived": "createdToArrived",
  "Discipline": "discipline",
  "Patient Diagnosis Category": "diagnosisCategory",
  "Diagnosis Category": "diagnosisCategory",
};

export default function ImportPage() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("select");
  const [importType, setImportType] = useState<ImportType>("physicians");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; sampleRows: Record<string, string>[]; totalRows: number; sheetName: string } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [customFieldMappings, setCustomFieldMappings] = useState<{ csvHeader: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [showEnrichmentStats, setShowEnrichmentStats] = useState(true);
  const [result, setResult] = useState<{
    inserted: number; updated: number; errors: string[];
    totalRows?: number; unmatchedFacilityCount?: number; unmatchedDoctorCount?: number;
    invalidDateCount?: number; unmatchedFacilities?: string[]; unmatchedDoctors?: string[];
    unlinkedCount?: number; enriched?: number; enrichmentFailed?: number;
  } | null>(null);
  const [npiVerifying, setNpiVerifying] = useState(false);
  const [npiResults, setNpiResults] = useState<{
    total: number; valid: number; invalid: number;
    results: Array<{ npi: string; valid: boolean; name?: string; specialty?: string; address?: string; city?: string; state?: string; zip?: string }>;
  } | null>(null);

  const fields = importType === "physicians" ? PHYSICIAN_FIELDS : REFERRAL_FIELDS;
  const autoMap = importType === "physicians" ? PHYSICIAN_AUTO_MAP : REFERRAL_AUTO_MAP;

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const csrfToken = await ensureCsrfToken();
      const headers: Record<string, string> = {};
      if (csrfToken) headers["x-csrf-token"] = csrfToken;
      const res = await fetch("/api/import/preview", { method: "POST", body: formData, credentials: "include", headers });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      const data = await res.json();
      setPreview(data);

      const autoMapping: Record<string, string> = {};
      for (const header of data.headers) {
        const fieldKey = autoMap[header];
        if (fieldKey) {
          autoMapping[fieldKey] = header;
        }
      }
      setMapping(autoMapping);
      setStep("map");
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [importType, autoMap, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.name.endsWith(".xlsx") || droppedFile.name.endsWith(".xls") || droppedFile.name.endsWith(".csv"))) {
      handleFileSelect(droppedFile);
    } else {
      toast({ title: "Invalid file", description: "Please upload an Excel (.xlsx, .xls) or CSV file", variant: "destructive" });
    }
  }, [handleFileSelect, toast]);

  const handleImport = useCallback(async () => {
    if (!file) return;
    const requiredFields = fields.filter(f => f.required);
    const missingRequired = requiredFields.filter(f => !mapping[f.key]);
    if (missingRequired.length > 0) {
      toast({
        title: "Missing required mappings",
        description: `Please map: ${missingRequired.map(f => f.label).join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    setStep("importing");
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const reverseMapping: Record<string, string> = {};
      for (const [field, header] of Object.entries(mapping)) {
        reverseMapping[field] = header;
      }
      formData.append("mapping", JSON.stringify(reverseMapping));
      if (customFieldMappings.length > 0) {
        const cfMap: Record<string, string> = {};
        for (const cf of customFieldMappings) {
          cfMap[cf.label] = cf.csvHeader;
        }
        formData.append("customFieldMapping", JSON.stringify(cfMap));
      }

      const endpoint = importType === "physicians" ? "/api/import/physicians" : "/api/import/referrals";
      const csrfToken = await ensureCsrfToken();
      const importHeaders: Record<string, string> = {};
      if (csrfToken) importHeaders["x-csrf-token"] = csrfToken;
      const res = await fetch(endpoint, { method: "POST", body: formData, credentials: "include", headers: importHeaders });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      const data = await res.json();
      setResult(data);
      setStep("result");
    } catch (err: unknown) {
      toast({ title: "Import failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
      setStep("map");
    } finally {
      setLoading(false);
    }
  }, [file, mapping, importType, fields, toast]);

  const handleVerifyNpis = useCallback(async () => {
    if (!preview) return;
    const npiColumn = importType === "physicians" ? mapping["npi"] : mapping["referringDoctorNpi"];
    if (!npiColumn) {
      toast({ title: "No NPI column mapped", description: "Map the NPI column first to verify NPIs.", variant: "destructive" });
      return;
    }

    if (!file) return;
    setNpiVerifying(true);
    setNpiResults(null);
    try {
      const csrfToken = await ensureCsrfToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (csrfToken) headers["x-csrf-token"] = csrfToken;

      const previewRes = await fetch("/api/import/preview", {
        method: "POST",
        body: (() => { const fd = new FormData(); fd.append("file", file); return fd; })(),
        credentials: "include",
        headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
      });
      if (!previewRes.ok) throw new Error("Failed to read file for NPI extraction");
      const fullData = await previewRes.json();

      const allRows = fullData.sampleRows || preview.sampleRows;
      const npiSet = new Set<string>();
      for (const row of allRows) {
        const val = row[npiColumn];
        if (val != null && String(val).trim() !== "") {
          npiSet.add(String(val).trim());
        }
      }
      const allUniqueNpis = Array.from(npiSet);

      const res = await apiRequest("POST", "/api/import/verify-npis", { npis: allUniqueNpis.slice(0, 200) });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      const data = await res.json();
      setNpiResults(data);
      toast({
        title: "NPI Verification Complete",
        description: `${data.valid} valid, ${data.invalid} invalid out of ${data.total} NPIs checked.`,
      });
    } catch (err: unknown) {
      toast({ title: "NPI Verification Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setNpiVerifying(false);
    }
  }, [preview, mapping, importType, file, toast]);

  const reset = () => {
    setStep("select");
    setFile(null);
    setPreview(null);
    setMapping({});
    setCustomFieldMappings([]);
    setResult(null);
    setNpiResults(null);
  };

  const mappedCount = Object.keys(mapping).length;
  const requiredMapped = fields.filter(f => f.required && mapping[f.key]).length;
  const requiredTotal = fields.filter(f => f.required).length;

  const mappedHeaders = new Set(Object.values(mapping));
  const customMappedHeaders = new Set(customFieldMappings.map(cf => cf.csvHeader));
  const unmappedHeaders = preview?.headers.filter(h => !mappedHeaders.has(h) && !customMappedHeaders.has(h)) || [];

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-import-title">Import Data</h1>
          <p className="text-sm text-muted-foreground mt-1">Upload Excel spreadsheets to import referring providers or referrals</p>
        </div>

        <div className="flex items-center gap-2">
          {["select", "upload", "map", "importing", "result"].map((s, i) => {
            const labels = ["Select Type", "Upload File", "Map Columns", "Importing", "Results"];
            const stepIndex = ["select", "upload", "map", "importing", "result"].indexOf(step);
            const isActive = i === stepIndex;
            const isDone = i < stepIndex;
            return (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <ArrowRight className="w-4 h-4 text-muted-foreground" />}
                <Badge
                  variant={isActive ? "default" : isDone ? "secondary" : "outline"}
                  className={isDone ? "bg-chart-2/15 text-chart-2" : ""}
                >
                  {isDone ? <CheckCircle2 className="w-3 h-3 mr-1" /> : null}
                  {labels[i]}
                </Badge>
              </div>
            );
          })}
        </div>

        {step === "select" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card
              className={`cursor-pointer hover-elevate ${importType === "physicians" ? "ring-2 ring-primary" : ""}`}
              onClick={() => { setImportType("physicians"); setStep("upload"); }}
              data-testid="card-import-physicians"
            >
              <CardContent className="p-6 text-center">
                <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-chart-1" />
                <h3 className="font-semibold text-lg">Referring Providers</h3>
                <p className="text-sm text-muted-foreground mt-2">Import referring providers from a provider list spreadsheet</p>
              </CardContent>
            </Card>
            <Card
              className={`cursor-pointer hover-elevate ${importType === "referrals" ? "ring-2 ring-primary" : ""}`}
              onClick={() => { setImportType("referrals"); setStep("upload"); }}
              data-testid="card-import-referrals"
            >
              <CardContent className="p-6 text-center">
                <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-chart-2" />
                <h3 className="font-semibold text-lg">Created Cases / Referrals</h3>
                <p className="text-sm text-muted-foreground mt-2">Import referral cases from a report spreadsheet</p>
              </CardContent>
            </Card>
          </div>
        )}

        {step === "upload" && (
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setStep("select")} aria-label="Back to import type selection" data-testid="button-back-select">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h2 className="font-semibold">Upload {importType === "physicians" ? "Referring Provider" : "Referral"} File</h2>
                <p className="text-sm text-muted-foreground">Select an Excel (.xlsx) or CSV file</p>
              </div>
            </CardHeader>
            <CardContent>
              <div
                className="border-2 border-dashed rounded-md p-12 text-center cursor-pointer hover-elevate"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".xlsx,.xls,.csv";
                  input.onchange = (e) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (f) handleFileSelect(f);
                  };
                  input.click();
                }}
                data-testid="dropzone-upload"
              >
                {loading ? (
                  <Loader2 className="w-10 h-10 mx-auto mb-3 animate-spin text-muted-foreground" />
                ) : (
                  <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                )}
                <p className="font-medium">{loading ? "Reading file..." : "Drop file here or click to browse"}</p>
                <p className="text-sm text-muted-foreground mt-1">Supports .xlsx, .xls, .csv files up to 50MB</p>
              </div>
              <div className="flex items-center justify-center pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(`/api/import/template/${importType}`, "_blank");
                  }}
                  data-testid="button-download-template"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download {importType === "physicians" ? "Provider" : "Referral"} CSV Template
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "map" && preview && (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setStep("upload")} aria-label="Back to upload step" data-testid="button-back-upload">
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <div>
                    <h2 className="font-semibold">Map Columns</h2>
                    <p className="text-sm text-muted-foreground">
                      {file?.name} - {preview.totalRows.toLocaleString()} rows - Sheet: {preview.sheetName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline">
                    {mappedCount} of {fields.length} mapped
                  </Badge>
                  <Badge variant={requiredMapped === requiredTotal ? "default" : "destructive"}>
                    {requiredMapped}/{requiredTotal} required
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50 text-sm">
                  <Info className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span>We auto-detected column mappings. Review and adjust if needed. Required fields are marked with *</span>
                </div>
                <div className="space-y-2 max-h-[500px] overflow-auto">
                  {fields.map(field => (
                    <div key={field.key} className="flex items-center gap-3">
                      <span className="w-56 text-sm shrink-0 truncate">
                        {field.label}{field.required ? <span className="text-destructive ml-0.5">*</span> : null}
                      </span>
                      <ArrowLeft className="w-4 h-4 text-muted-foreground shrink-0" />
                      <Select
                        value={mapping[field.key] || "__none__"}
                        onValueChange={(val) => {
                          setMapping(prev => {
                            const next = { ...prev };
                            if (val === "__none__") {
                              delete next[field.key];
                            } else {
                              next[field.key] = val;
                            }
                            return next;
                          });
                        }}
                      >
                        <SelectTrigger
                          className="flex-1"
                          data-testid={`select-map-${field.key}`}
                        >
                          <SelectValue placeholder="Select column..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">-- Not mapped --</SelectItem>
                          {preview.headers.map(h => (
                            <SelectItem key={h} value={h}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {(unmappedHeaders.length > 0 || customFieldMappings.length > 0) && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h2 className="font-semibold">Unmapped Columns</h2>
                    <p className="text-sm text-muted-foreground">
                      These columns from your file aren't mapped to any standard field. Add them as custom fields to keep the data.
                    </p>
                  </div>
                  {customFieldMappings.length > 0 && (
                    <Badge variant="outline" data-testid="badge-custom-count">
                      {customFieldMappings.length} custom field{customFieldMappings.length !== 1 ? "s" : ""}
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {customFieldMappings.map((cf, idx) => (
                    <div key={cf.csvHeader} className="flex items-center gap-3">
                      <span className="w-56 text-sm shrink-0 truncate text-muted-foreground">{cf.csvHeader}</span>
                      <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      <Input
                        value={cf.label}
                        onChange={(e) => {
                          setCustomFieldMappings(prev => prev.map((item, i) =>
                            i === idx ? { ...item, label: e.target.value } : item
                          ));
                        }}
                        placeholder="Custom field name..."
                        className="flex-1"
                        data-testid={`input-custom-label-${idx}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setCustomFieldMappings(prev => prev.filter((_, i) => i !== idx))}
                        aria-label="Remove custom field mapping"
                        data-testid={`button-remove-custom-${idx}`}
                      >
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                  {unmappedHeaders.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <p className="text-xs text-muted-foreground font-medium">Available columns:</p>
                      <div className="flex flex-wrap gap-2">
                        {unmappedHeaders.map(h => (
                          <Button
                            key={h}
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => setCustomFieldMappings(prev => [...prev, { csvHeader: h, label: h }])}
                            data-testid={`button-add-custom-${h}`}
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            {h}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {importType === "physicians" && mapping["npi"] && (
              <Card>
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <Sparkles className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Auto-enrich with NPI Registry</p>
                    <p className="text-xs text-muted-foreground">Fill missing fields (specialty, address, credentials) using NPPES data during import</p>
                  </div>
                  <Checkbox
                    id="enrichment-toggle"
                    checked={showEnrichmentStats}
                    onCheckedChange={(v) => setShowEnrichmentStats(!!v)}
                    data-testid="checkbox-enrich-npi"
                  />
                </CardContent>
              </Card>
            )}

            {(mapping["npi"] || mapping["referringDoctorNpi"]) && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <h2 className="font-semibold">NPI Verification</h2>
                      <p className="text-sm text-muted-foreground">
                        Validate NPIs against the NPPES registry before importing
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleVerifyNpis}
                    disabled={npiVerifying}
                    data-testid="button-verify-npis"
                  >
                    {npiVerifying ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 mr-2" />
                    )}
                    {npiVerifying ? "Verifying..." : "Verify NPIs"}
                  </Button>
                </CardHeader>
                {npiResults && (
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                      <Badge variant="outline" data-testid="badge-npi-total">
                        {npiResults.total} checked
                      </Badge>
                      <Badge variant="default" className="bg-chart-2/15 text-chart-2" data-testid="badge-npi-valid">
                        <ShieldCheck className="w-3 h-3 mr-1" />
                        {npiResults.valid} valid
                      </Badge>
                      {npiResults.invalid > 0 && (
                        <Badge variant="destructive" data-testid="badge-npi-invalid">
                          <ShieldX className="w-3 h-3 mr-1" />
                          {npiResults.invalid} invalid
                        </Badge>
                      )}
                    </div>
                    {npiResults.results.length > 0 && (
                      <div className="max-h-[300px] overflow-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">NPI</TableHead>
                              <TableHead className="text-xs">Status</TableHead>
                              <TableHead className="text-xs">Name</TableHead>
                              <TableHead className="text-xs">Specialty</TableHead>
                              <TableHead className="text-xs">Location</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {npiResults.results.map((r) => (
                              <TableRow key={r.npi}>
                                <TableCell className="text-xs font-mono" data-testid={`text-npi-${r.npi}`}>{r.npi}</TableCell>
                                <TableCell>
                                  {r.valid ? (
                                    <Badge variant="default" className="bg-chart-2/15 text-chart-2" data-testid={`badge-npi-status-${r.npi}`}>
                                      <ShieldCheck className="w-3 h-3 mr-1" />
                                      Valid
                                    </Badge>
                                  ) : (
                                    <Badge variant="destructive" data-testid={`badge-npi-status-${r.npi}`}>
                                      <ShieldX className="w-3 h-3 mr-1" />
                                      Invalid
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs" data-testid={`text-npi-name-${r.npi}`}>{r.name || "-"}</TableCell>
                                <TableCell className="text-xs" data-testid={`text-npi-specialty-${r.npi}`}>{r.specialty || "-"}</TableCell>
                                <TableCell className="text-xs" data-testid={`text-npi-location-${r.npi}`}>
                                  {r.city && r.state ? `${r.city}, ${r.state}` : r.city || r.state || "-"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )}

            <Card>
              <CardHeader>
                <h3 className="font-semibold">Data Preview (first 5 rows)</h3>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {preview.headers.map(h => (
                        <TableHead key={h} className="whitespace-nowrap text-xs">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.sampleRows.map((row, i) => (
                      <TableRow key={i}>
                        {preview.headers.map(h => (
                          <TableCell key={h} className="whitespace-nowrap text-xs max-w-[200px] truncate">
                            {row[h] != null ? String(row[h]) : ""}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={reset} data-testid="button-cancel">Cancel</Button>
              <Button onClick={handleImport} disabled={requiredMapped < requiredTotal} data-testid="button-start-import">
                Import {preview.totalRows.toLocaleString()} {importType === "physicians" ? "Referring Providers" : "Referrals"}
              </Button>
            </div>
          </>
        )}

        {step === "importing" && (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
              <h2 className="text-lg font-semibold">Importing {importType === "physicians" ? "referring providers" : "referrals"}...</h2>
              <p className="text-sm text-muted-foreground mt-2">
                Processing {preview?.totalRows.toLocaleString()} rows. This may take a moment for large files.
              </p>
            </CardContent>
          </Card>
        )}

        {step === "result" && result && (
          <Card>
            <CardContent className="p-8 space-y-6">
              <div className="text-center">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-chart-2" />
                <h2 className="text-lg font-semibold">Import Complete</h2>
                {result.totalRows && <p className="text-sm text-muted-foreground mt-1">{result.totalRows} total rows processed</p>}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-chart-2" data-testid="text-inserted-count">{result.inserted}</div>
                    <div className="text-sm text-muted-foreground">New Records</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-chart-3" data-testid="text-updated-count">{result.updated}</div>
                    <div className="text-sm text-muted-foreground">Updated</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-chart-5" data-testid="text-error-count">{result.errors.length}</div>
                    <div className="text-sm text-muted-foreground">Skipped</div>
                  </CardContent>
                </Card>
                {result.unlinkedCount != null && (
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-amber-500" data-testid="text-unlinked-count">{result.unlinkedCount}</div>
                      <div className="text-sm text-muted-foreground">Unlinked</div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {showEnrichmentStats && result.enriched != null && result.enriched > 0 && (
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3 flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-primary">NPI Registry Enrichment</p>
                    <p className="text-xs text-muted-foreground">
                      {result.enriched} provider{result.enriched !== 1 ? "s" : ""} enriched with NPPES data
                      {result.enrichmentFailed ? ` · ${result.enrichmentFailed} failed` : ""}
                    </p>
                  </div>
                </div>
              )}

              {((result.unmatchedFacilities && result.unmatchedFacilities.length > 0) || (result.unmatchedDoctors && result.unmatchedDoctors.length > 0)) && (
                <div className="space-y-3">
                  {result.unmatchedFacilities && result.unmatchedFacilities.length > 0 && (
                    <div className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3">
                      <h4 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">
                        Unmatched Facilities ({result.unmatchedFacilityCount || 0} rows skipped)
                      </h4>
                      <p className="text-xs text-muted-foreground mb-2">These facility names didn't match any location in the system. Add the locations first, then re-import.</p>
                      <div className="flex flex-wrap gap-1.5">
                        {result.unmatchedFacilities.map((f: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs bg-red-100 dark:bg-red-900/30">{f}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.unmatchedDoctors && result.unmatchedDoctors.length > 0 && (
                    <div className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3">
                      <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-1">
                        Unmatched Doctors ({result.unmatchedDoctorCount || 0} referrals imported unlinked)
                      </h4>
                      <p className="text-xs text-muted-foreground mb-2">These referrals were imported but couldn't be linked to a provider. You can link them on the Unlinked Referrals page.</p>
                      <div className="flex flex-wrap gap-1.5">
                        {result.unmatchedDoctors.slice(0, 20).map((d: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs bg-amber-100 dark:bg-amber-900/30">{d}</Badge>
                        ))}
                        {result.unmatchedDoctors.length > 20 && (
                          <Badge variant="outline" className="text-xs">+{result.unmatchedDoctors.length - 20} more</Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-chart-5" />
                    Row-Level Details ({result.errors.length})
                  </h3>
                  <div className="max-h-48 overflow-auto rounded-md bg-muted/50 p-3 text-sm space-y-1">
                    {result.errors.slice(0, 50).map((err: string, i: number) => (
                      <div key={i} className="text-muted-foreground">{err}</div>
                    ))}
                    {result.errors.length > 50 && (
                      <div className="text-muted-foreground italic">...and {result.errors.length - 50} more</div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={reset} data-testid="button-import-another">
                  Import Another File
                </Button>
                {(result.unlinkedCount ?? 0) > 0 && (
                  <Button variant="default" onClick={() => window.location.href = "/admin/unlinked-referrals"} data-testid="button-view-unlinked">
                    View Unlinked Referrals
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
