"use client";

import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ImportResult {
  success: boolean;
  created: number;
  errors: Array<{ row: number; field: string; message: string }>;
}

interface UserImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
  companyId: string | null;
}

const CSV_TEMPLATE = `name,email,username,password,role,phone,identification,licenseNumber,licenseExpiry,licenseCategories,driverStatus
Pedro Ramirez,pedro@empresa.com,pedro_ramirez,Password123!,CONDUCTOR,+51999111111,12345678,LIC-001,2026-12-31,"A,B",AVAILABLE
Ana Torres,ana@empresa.com,ana_torres,Password123!,CONDUCTOR,+51999222222,87654321,LIC-002,2026-06-15,"B,C",AVAILABLE
Maria Garcia,maria@empresa.com,maria_garcia,Password123!,PLANIFICADOR,+51888888888,,,,,
Carlos Lopez,carlos@empresa.com,carlos_lopez,Password123!,ADMIN_FLOTA,+51777777777,,,,,
Luis Mendoza,luis@empresa.com,luis_mendoza,Password123!,MONITOR,,,,,,`;

export function UserImportDialog({
  open,
  onOpenChange,
  onImportComplete,
  companyId,
}: UserImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (
        droppedFile.type === "text/csv" ||
        droppedFile.name.endsWith(".csv")
      ) {
        setFile(droppedFile);
        setResult(null);
      }
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file || !companyId) return;

    setIsUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/users/import", {
        method: "POST",
        headers: {
          "x-company-id": companyId,
        },
        body: formData,
      });

      const data = await response.json();
      setResult(data);

      if (data.success && data.created > 0) {
        onImportComplete();
      }
    } catch (error) {
      setResult({
        success: false,
        created: 0,
        errors: [
          { row: 0, field: "file", message: "Error al procesar el archivo" },
        ],
      });
    } finally {
      setIsUploading(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "plantilla_usuarios.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleClose = () => {
    setFile(null);
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar Usuarios
          </DialogTitle>
          <DialogDescription>
            Sube un archivo CSV para crear usuarios de manera masiva
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template download */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div className="text-sm">
              <p className="font-medium">Plantilla CSV</p>
              <p className="text-muted-foreground text-xs">
                Descarga el formato requerido
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-1" />
              Descargar
            </Button>
          </div>

          {/* File upload area */}
          <div
            className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              dragActive
                ? "border-primary bg-primary/5"
                : file
                  ? "border-green-500 bg-green-50 dark:bg-green-900/10"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isUploading}
            />

            {file ? (
              <div className="space-y-2">
                <CheckCircle2 className="h-8 w-8 mx-auto text-green-500" />
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    setResult(null);
                  }}
                  disabled={isUploading}
                >
                  <X className="h-4 w-4 mr-1" />
                  Quitar
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm font-medium">
                  Arrastra un archivo CSV aquí
                </p>
                <p className="text-xs text-muted-foreground">
                  o haz clic para seleccionar
                </p>
              </div>
            )}
          </div>

          {/* Result display */}
          {result && (
            <div
              className={`p-3 rounded-lg text-sm ${
                result.success && result.errors.length === 0
                  ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300"
                  : result.errors.length > 0
                    ? "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300"
                    : "bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300"
              }`}
            >
              {result.success && result.created > 0 && (
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {result.created} usuario{result.created > 1 ? "s" : ""} creado
                  {result.created > 1 ? "s" : ""} exitosamente
                </p>
              )}
              {result.errors.length > 0 && (
                <div className="space-y-1">
                  <p className="flex items-center gap-2 font-medium">
                    <AlertCircle className="h-4 w-4" />
                    {result.errors.length} error
                    {result.errors.length > 1 ? "es" : ""}:
                  </p>
                  <ul className="list-disc list-inside text-xs max-h-32 overflow-y-auto">
                    {result.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>
                        Fila {err.row}: {err.field} - {err.message}
                      </li>
                    ))}
                    {result.errors.length > 10 && (
                      <li>...y {result.errors.length - 10} errores más</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Format info */}
          <div className="text-xs text-muted-foreground space-y-2 bg-muted/50 p-3 rounded-lg">
            <div>
              <p className="font-medium text-foreground">
                Campos requeridos (todos los usuarios):
              </p>
              <p>name, email, username, password, role</p>
            </div>
            <div>
              <p className="font-medium text-foreground">Roles disponibles:</p>
              <p>ADMIN_FLOTA, PLANIFICADOR, MONITOR, CONDUCTOR</p>
            </div>
            <div>
              <p className="font-medium text-foreground">
                Campos adicionales (solo CONDUCTOR):
              </p>
              <p>
                identification, licenseNumber, licenseExpiry, licenseCategories,
                driverStatus
              </p>
              <p className="text-xs italic mt-1">
                Los campos de conductor se ignoran para otros roles
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isUploading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || isUploading || !companyId}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Importar
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
