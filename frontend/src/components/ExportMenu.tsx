import { Download, FileText, Printer } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EXPORT_FORMATS, type ExportFormat } from "@/lib/export";

type ExportMenuProps = {
  onExport: (format: ExportFormat) => void;
  disabled?: boolean;
  compact?: boolean;
  label?: string;
};

export function ExportMenu({ onExport, disabled = false, compact = false, label = "Export" }: ExportMenuProps) {
  const [format, setFormat] = useState<ExportFormat>("md");
  return (
    <div className="export-menu">
      <label className="sr-only" htmlFor={`export-format-${label.replace(/[^a-z0-9]/gi, "-")}`}>Export format</label>
      <select
        id={`export-format-${label.replace(/[^a-z0-9]/gi, "-")}`}
        aria-label="Export format"
        value={format}
        onChange={(event) => setFormat(event.target.value as ExportFormat)}
        className="select-control select-small"
        disabled={disabled}
      >
        {EXPORT_FORMATS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
      <Button variant={compact ? "ghost" : "outline"} size="sm" disabled={disabled} className="gap-2" onClick={() => onExport(format)}>
        {format === "pdf" ? <Printer className="h-3.5 w-3.5" /> : compact ? <FileText className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
        {label}
      </Button>
    </div>
  );
}
