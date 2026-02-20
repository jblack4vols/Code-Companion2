import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, ArrowRight, CheckCircle2, AlertTriangle, Loader2, X, ArrowLeft, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const [preview, setPreview] = useState<{ headers: string[]; sampleRows: any[]; totalRows: number; sheetName: string } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ inserted: number; updated: number; errors: string[] } | null>(null);

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
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
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
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
      setStep("map");
    } finally {
      setLoading(false);
    }
  }, [file, mapping, importType, fields, toast]);

  const reset = () => {
    setStep("select");
    setFile(null);
    setPreview(null);
    setMapping({});
    setResult(null);
  };

  const mappedCount = Object.keys(mapping).length;
  const requiredMapped = fields.filter(f => f.required && mapping[f.key]).length;
  const requiredTotal = fields.filter(f => f.required).length;

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
              <Button variant="ghost" size="icon" onClick={() => setStep("select")} data-testid="button-back-select">
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
            </CardContent>
          </Card>
        )}

        {step === "map" && preview && (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setStep("upload")} data-testid="button-back-upload">
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
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-chart-2" data-testid="text-inserted-count">{result.inserted}</div>
                    <div className="text-sm text-muted-foreground">New Records</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-chart-3" data-testid="text-updated-count">{result.updated}</div>
                    <div className="text-sm text-muted-foreground">Updated Records</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-chart-5" data-testid="text-error-count">{result.errors.length}</div>
                    <div className="text-sm text-muted-foreground">Errors / Skipped</div>
                  </CardContent>
                </Card>
              </div>

              {result.errors.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-chart-5" />
                    Import Warnings ({result.errors.length})
                  </h3>
                  <div className="max-h-48 overflow-auto rounded-md bg-muted/50 p-3 text-sm space-y-1">
                    {result.errors.slice(0, 50).map((err, i) => (
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
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
