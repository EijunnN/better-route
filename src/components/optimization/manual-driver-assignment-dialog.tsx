"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  User,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  Shield,
  Wrench,
  Clock,
  Users,
  Loader2,
} from "lucide-react";

export interface DriverOption {
  driverId: string;
  driverName: string;
  score: number;
  factors: {
    skillsMatch: number;
    availability: number;
    licenseValid: number;
    fleetMatch: number;
    workload: number;
  };
  warnings: string[];
  errors: string[];
  details: {
    identification: string;
    status: string;
    fleetId: string;
    fleetName: string;
    licenseNumber: string;
    licenseExpiry: string;
  };
}

export interface ManualDriverAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routeId: string;
  vehicleId: string;
  vehiclePlate: string;
  currentDriverId?: string;
  currentDriverName?: string;
  onAssign: (
    driverId: string,
    overrideWarnings: boolean,
    reason?: string
  ) => Promise<void>;
  onRemove?: () => Promise<void>;
}

export function ManualDriverAssignmentDialog({
  open,
  onOpenChange,
  routeId,
  vehicleId,
  vehiclePlate,
  currentDriverId,
  currentDriverName,
  onAssign,
  onRemove,
}: ManualDriverAssignmentDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(
    currentDriverId || null
  );
  const [overrideWarnings, setOverrideWarnings] = useState(false);
  const [reason, setReason] = useState("");
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [validation, setValidation] = useState<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } | null>(null);
  const [removing, setRemoving] = useState(false);

  // Load drivers when dialog opens
  useEffect(() => {
    if (open) {
      loadDrivers();
      setSelectedDriverId(currentDriverId || null);
    }
  }, [open, currentDriverId]);

  // Validate selected driver
  useEffect(() => {
    if (selectedDriverId && open) {
      validateDriver(selectedDriverId);
    } else {
      setValidation(null);
    }
  }, [selectedDriverId, overrideWarnings, open]);

  async function loadDrivers() {
    setLoading(true);
    try {
      // Get driver suggestions for this vehicle
      const response = await fetch("/api/driver-assignment/suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // In production, these would come from auth context
          "x-company-id": localStorage.getItem("companyId") || "",
          "x-user-id": localStorage.getItem("userId") || "",
        },
        body: JSON.stringify({
          companyId: localStorage.getItem("companyId"),
          vehicleId,
          routeStops: [], // We may need to pass actual route stops
          strategy: "BALANCED",
          limit: 20,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setDrivers(result.data || []);
      }
    } catch (error) {
      console.error("Error loading drivers:", error);
    } finally {
      setLoading(false);
    }
  }

  async function validateDriver(driverId: string) {
    try {
      const response = await fetch("/api/driver-assignment/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": localStorage.getItem("companyId") || "",
          "x-user-id": localStorage.getItem("userId") || "",
        },
        body: JSON.stringify({
          companyId: localStorage.getItem("companyId"),
          driverId,
          vehicleId,
          routeStops: [],
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setValidation(result.data);
      }
    } catch (error) {
      console.error("Error validating driver:", error);
    }
  }

  async function handleAssign() {
    if (!selectedDriverId) return;

    setAssigning(true);
    try {
      await onAssign(selectedDriverId, overrideWarnings, reason);
      onOpenChange(false);
    } catch (error) {
      console.error("Error assigning driver:", error);
    } finally {
      setAssigning(false);
    }
  }

  async function handleRemove() {
    if (!onRemove) return;

    setRemoving(true);
    try {
      await onRemove();
      onOpenChange(false);
    } catch (error) {
      console.error("Error removing driver:", error);
    } finally {
      setRemoving(false);
    }
  }

  const selectedDriver = drivers.find((d) => d.driverId === selectedDriverId);
  const hasBlockingErrors = validation?.errors && validation.errors.length > 0;
  const canProceed =
    selectedDriverId &&
    (!hasBlockingErrors || overrideWarnings) &&
    !assigning;

  const filteredDrivers = drivers.filter(
    (d) =>
      d.driverName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.details.identification.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Manual Driver Assignment</DialogTitle>
          <DialogDescription>
            Assign a driver to vehicle {vehiclePlate}. Changes will be logged for audit purposes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search drivers by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Driver List */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              {filteredDrivers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No drivers found
                </p>
              ) : (
                filteredDrivers.map((driver) => (
                  <DriverCard
                    key={driver.driverId}
                    driver={driver}
                    selected={selectedDriverId === driver.driverId}
                    onClick={() => setSelectedDriverId(driver.driverId)}
                  />
                ))
              )}
            </div>
          )}

          {/* Validation Results */}
          {validation && selectedDriver && (
            <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
              <h4 className="text-sm font-semibold">Assignment Validation</h4>

              {/* Errors */}
              {validation.errors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-red-700">Errors:</p>
                  <ul className="space-y-1">
                    {validation.errors.map((error, idx) => (
                      <li
                        key={idx}
                        className="text-xs text-red-600 flex items-start gap-1"
                      >
                        <XCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span>{error}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {validation.warnings.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-yellow-700">Warnings:</p>
                  <ul className="space-y-1">
                    {validation.warnings.map((warning, idx) => (
                      <li
                        key={idx}
                        className="text-xs text-yellow-600 flex items-start gap-1"
                      >
                        <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span>{warning}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* No Issues */}
              {validation.errors.length === 0 &&
                validation.warnings.length === 0 && (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-xs">
                      All requirements met - driver is suitable for assignment
                    </span>
                  </div>
                )}

              {/* Override Warnings */}
              {hasBlockingErrors && (
                <div className="flex items-start gap-2 pt-2 border-t">
                  <Checkbox
                    id="override"
                    checked={overrideWarnings}
                    onCheckedChange={(checked) =>
                      setOverrideWarnings(checked as boolean)
                    }
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor="override"
                      className="text-sm font-medium cursor-pointer"
                    >
                      Override warnings and assign anyway
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      This will be logged as a manual override
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reason Input */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              placeholder="Provide a reason for this assignment change..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {onRemove && currentDriverId && (
            <Button
              type="button"
              variant="outline"
              className="sm:mr-auto text-destructive hover:text-destructive"
              onClick={handleRemove}
              disabled={removing}
            >
              {removing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                <>
                  <User className="h-4 w-4 mr-2" />
                  Remove Assignment
                </>
              )}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={assigning}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleAssign}
            disabled={!canProceed}
          >
            {assigning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Assigning...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Assign Driver
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DriverCardProps {
  driver: DriverOption;
  selected: boolean;
  onClick: () => void;
}

function DriverCard({ driver, selected, onClick }: DriverCardProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-green-50 border-green-200";
    if (score >= 60) return "bg-yellow-50 border-yellow-200";
    return "bg-red-50 border-red-200";
  };

  const hasErrors = driver.errors.length > 0;
  const hasWarnings = driver.warnings.length > 0;

  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
        selected
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : "border-border hover:border-primary/50"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-sm">{driver.driverName}</p>
            <p className="text-xs text-muted-foreground">
              {driver.details.identification} • {driver.details.fleetName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`${getScoreColor(driver.score)} border-current`}
          >
            {driver.score}/100
          </Badge>
          {hasErrors && (
            <Badge variant="destructive" className="text-xs">
              {driver.errors.length}
            </Badge>
          )}
          {hasWarnings && (
            <Badge variant="outline" className="text-xs border-yellow-300 text-yellow-700">
              {driver.warnings.length}
            </Badge>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mt-2 grid grid-cols-4 gap-2">
        <StatItem icon={Shield} label="License" value={driver.factors.licenseValid} />
        <StatItem icon={Wrench} label="Skills" value={driver.factors.skillsMatch} />
        <StatItem icon={Clock} label="Available" value={driver.factors.availability} />
        <StatItem icon={Users} label="Fleet" value={driver.factors.fleetMatch} />
      </div>
    </div>
  );
}

function StatItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
}) {
  const getColor = (value: number) => {
    if (value >= 80) return "text-green-600";
    if (value >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="flex items-center gap-1">
      <Icon className={`h-3 w-3 ${getColor(value)}`} />
      <span className={`text-xs font-medium ${getColor(value)}`}>{value}%</span>
    </div>
  );
}
