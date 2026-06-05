"use client";

import {
  AlertTriangle,
  Eraser,
  FlaskConical,
  KeyRound,
  Loader2,
  Trash2,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiData } from "@/hooks/use-api";
import { useCompanyContext } from "@/hooks/use-company-context";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_CAPS,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAX_ORDERS,
  DEFAULT_WORKDAY_END,
  DEFAULT_WORKDAY_START,
  type GeoPoint,
  scatterAround,
} from "@/lib/playground/fake-data";
import { PlaygroundMap } from "./playground-map";

const MAX_VEHICLES = 200;

interface PlaygroundSummary {
  vehicles: number;
  drivers: number;
  fleets: number;
  driverPassword: string;
  profile: {
    enableWeight: boolean;
    enableVolume: boolean;
    enableUnits: boolean;
    enableOrderValue: boolean;
  };
}

type PlacementMode = "manual" | "scatter";

export function PlaygroundView() {
  const { effectiveCompanyId, isReady } = useCompanyContext();
  const { toast } = useToast();

  const {
    data: summary,
    isLoading: isLoadingSummary,
    mutate: refreshSummary,
  } = useApiData<PlaygroundSummary>("/api/playground", effectiveCompanyId);

  const [mode, setMode] = useState<PlacementMode>("manual");
  const [manualOrigins, setManualOrigins] = useState<GeoPoint[]>([]);
  const [scatterCount, setScatterCount] = useState(20);
  const [scatterRadiusKm, setScatterRadiusKm] = useState(5);
  const [mapCenter, setMapCenter] = useState<GeoPoint>(DEFAULT_MAP_CENTER);

  const [fleets, setFleets] = useState(3);
  const [driverCountTouched, setDriverCountTouched] = useState(false);
  const [drivers, setDrivers] = useState(20);

  // Vehicle parameters — set by the user, applied to every generated vehicle.
  const [maxOrders, setMaxOrders] = useState(DEFAULT_MAX_ORDERS);
  const [workdayStart, setWorkdayStart] = useState(DEFAULT_WORKDAY_START);
  const [workdayEnd, setWorkdayEnd] = useState(DEFAULT_WORKDAY_END);
  const [weightCapacity, setWeightCapacity] = useState(DEFAULT_CAPS.weight);
  const [volumeCapacity, setVolumeCapacity] = useState(DEFAULT_CAPS.volume);
  const [unitsCapacity, setUnitsCapacity] = useState(DEFAULT_CAPS.units);
  const [valueCapacity, setValueCapacity] = useState(DEFAULT_CAPS.value);

  const dims = summary?.profile;

  const [isGenerating, setIsGenerating] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [confirmCleanupOpen, setConfirmCleanupOpen] = useState(false);

  // Scatter is a pure function of count/radius/center, so derive it in render.
  const scatterOrigins = useMemo<GeoPoint[]>(
    () =>
      scatterAround(
        mapCenter,
        Math.min(Math.max(scatterCount, 0), MAX_VEHICLES),
        Math.max(scatterRadiusKm, 0.1),
      ),
    [mapCenter, scatterCount, scatterRadiusKm],
  );

  const activeOrigins = mode === "manual" ? manualOrigins : scatterOrigins;
  const originCount = activeOrigins.length;
  // When the user hasn't overridden it, drivers tracks the vehicle count.
  const effectiveDrivers = driverCountTouched ? drivers : originCount || 1;

  const handlePlace = useCallback((point: GeoPoint) => {
    setManualOrigins((prev) =>
      prev.length >= MAX_VEHICLES ? prev : [...prev, point],
    );
  }, []);

  const noCompany = !effectiveCompanyId || !isReady;
  const canGenerate =
    !noCompany &&
    !isGenerating &&
    originCount > 0 &&
    originCount <= MAX_VEHICLES;

  const handleGenerate = async () => {
    if (!effectiveCompanyId || !canGenerate) return;
    setIsGenerating(true);
    try {
      const response = await fetch("/api/playground", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": effectiveCompanyId,
        },
        body: JSON.stringify({
          fleets: Math.max(fleets, 1),
          drivers: Math.max(effectiveDrivers, 1),
          origins: activeOrigins,
          maxOrders,
          workdayStart,
          workdayEnd,
          weightCapacity,
          volumeCapacity,
          maxUnitsCapacity: unitsCapacity,
          maxValueCapacity: valueCapacity,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "No se pudieron generar los datos");
      }

      const { data } = (await response.json()) as {
        data: { fleets: number; drivers: number; vehicles: number };
      };

      setManualOrigins([]);
      await refreshSummary();
      toast({
        title: "Datos de prueba generados",
        description: `${data.vehicles} vehículos, ${data.drivers} conductores y ${data.fleets} flotas.`,
      });
    } catch (error) {
      toast({
        title: "Error al generar datos",
        description:
          error instanceof Error
            ? error.message
            : "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCleanup = async () => {
    if (!effectiveCompanyId) return;
    setConfirmCleanupOpen(false);
    setIsCleaning(true);
    try {
      const response = await fetch("/api/playground", {
        method: "DELETE",
        headers: { "x-company-id": effectiveCompanyId },
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "No se pudieron borrar los datos");
      }

      await refreshSummary();
      toast({
        title: "Datos de prueba borrados",
        description:
          "Se eliminaron todas las flotas, conductores y vehículos TEST-.",
      });
    } catch (error) {
      toast({
        title: "Error al borrar datos",
        description:
          error instanceof Error
            ? error.message
            : "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="size-6 text-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Playground de datos de prueba
          </h1>
        </div>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <span>
            Herramienta de desarrollo: genera flotas, conductores y vehículos
            etiquetados con <code className="font-mono">TEST-</code>. Todo lo
            creado acá es borrable con un clic.
          </span>
        </p>
      </header>

      {noCompany && (
        <Card className="border-amber-500/40">
          <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <AlertTriangle className="size-4 shrink-0 text-amber-500" />
            Seleccioná una empresa en el menú lateral para generar datos de
            prueba.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Datos de prueba actuales</CardTitle>
          <CardDescription>
            Conteo de registros <code className="font-mono">TEST-</code> de la
            empresa seleccionada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingSummary ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Cargando…
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <SummaryStat label="Vehículos" value={summary?.vehicles ?? 0} />
              <SummaryStat label="Conductores" value={summary?.drivers ?? 0} />
              <SummaryStat label="Flotas" value={summary?.fleets ?? 0} />
            </div>
          )}

          {summary?.driverPassword && (
            <div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 p-3">
              <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm text-foreground">
                  Contraseña de conductores:{" "}
                  <code className="rounded bg-background px-1.5 py-0.5 font-mono text-foreground">
                    {summary.driverPassword}
                  </code>
                </p>
                <p className="text-xs text-muted-foreground">
                  Podés loguearte en la app del conductor con cualquier
                  conductor generado usando esta contraseña.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Colocar orígenes de vehículos
          </CardTitle>
          <CardDescription>
            Cada origen se convierte en un vehículo de prueba (máx.{" "}
            {MAX_VEHICLES}
            ).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as PlacementMode)}>
            <TabsList>
              <TabsTrigger value="manual">Colocar en el mapa</TabsTrigger>
              <TabsTrigger value="scatter">Dispersar</TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === "manual" ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Hacé clic en el mapa para agregar un origen.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setManualOrigins([])}
                disabled={manualOrigins.length === 0}
              >
                <Eraser className="size-4" />
                Limpiar marcadores
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="scatter-count">Cantidad</Label>
                <Input
                  id="scatter-count"
                  type="number"
                  min={1}
                  max={MAX_VEHICLES}
                  value={scatterCount}
                  onChange={(e) =>
                    setScatterCount(
                      Math.min(
                        Math.max(Number(e.target.value) || 0, 0),
                        MAX_VEHICLES,
                      ),
                    )
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scatter-radius">Radio (km)</Label>
                <Input
                  id="scatter-radius"
                  type="number"
                  min={0.1}
                  step={0.5}
                  value={scatterRadiusKm}
                  onChange={(e) =>
                    setScatterRadiusKm(Math.max(Number(e.target.value) || 0, 0))
                  }
                />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Los puntos se dispersan alrededor del centro actual del mapa.
                Movelo para reposicionarlos.
              </p>
            </div>
          )}

          <PlaygroundMap
            origins={activeOrigins}
            clickToPlace={mode === "manual"}
            onPlace={handlePlace}
            onCenterChange={setMapCenter}
          />

          <p className="text-sm font-medium text-foreground">
            {originCount} vehículo{originCount === 1 ? "" : "s"} a generar
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Parámetros de los vehículos</CardTitle>
          <CardDescription>
            Se aplican a todos los vehículos generados. Las capacidades dependen
            de las dimensiones activas en tu perfil de empresa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <NumberField
              id="pg-max-orders"
              label="Capacidad Máx. Pedidos"
              value={maxOrders}
              onChange={setMaxOrders}
            />
            <div className="space-y-1.5">
              <Label htmlFor="pg-workday-start">Inicio jornada</Label>
              <Input
                id="pg-workday-start"
                type="time"
                value={workdayStart}
                onChange={(e) => setWorkdayStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pg-workday-end">Fin jornada</Label>
              <Input
                id="pg-workday-end"
                type="time"
                value={workdayEnd}
                onChange={(e) => setWorkdayEnd(e.target.value)}
              />
            </div>
            {dims?.enableWeight && (
              <NumberField
                id="pg-weight"
                label="Capacidad Máx. Peso (kg)"
                value={weightCapacity}
                onChange={setWeightCapacity}
              />
            )}
            {dims?.enableVolume && (
              <NumberField
                id="pg-volume"
                label="Capacidad Máx. Volumen (m³)"
                value={volumeCapacity}
                onChange={setVolumeCapacity}
              />
            )}
            {dims?.enableUnits && (
              <NumberField
                id="pg-units"
                label="Capacidad Máx. Unidades"
                value={unitsCapacity}
                onChange={setUnitsCapacity}
              />
            )}
            {dims?.enableOrderValue && (
              <NumberField
                id="pg-value"
                label="Capacidad Máx. Valorizado"
                value={valueCapacity}
                onChange={setValueCapacity}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Generar</CardTitle>
          <CardDescription>
            Las flotas y conductores se reparten entre los vehículos creados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fleet-count"># Flotas</Label>
              <Input
                id="fleet-count"
                type="number"
                min={1}
                max={50}
                value={fleets}
                onChange={(e) =>
                  setFleets(
                    Math.min(Math.max(Number(e.target.value) || 1, 1), 50),
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="driver-count"># Conductores</Label>
              <Input
                id="driver-count"
                type="number"
                min={1}
                max={MAX_VEHICLES}
                value={effectiveDrivers}
                onChange={(e) => {
                  setDriverCountTouched(true);
                  setDrivers(
                    Math.min(
                      Math.max(Number(e.target.value) || 1, 1),
                      MAX_VEHICLES,
                    ),
                  );
                }}
              />
              <p className="text-xs text-muted-foreground">
                Por defecto sigue la cantidad de vehículos.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
            >
              {isGenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FlaskConical className="size-4" />
              )}
              Generar datos
            </Button>

            <Button
              type="button"
              variant="destructive"
              onClick={() => setConfirmCleanupOpen(true)}
              disabled={noCompany || isCleaning}
            >
              {isCleaning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Borrar datos de prueba
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={confirmCleanupOpen}
        onOpenChange={setConfirmCleanupOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Borrar todos los datos de prueba?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esto elimina todas las flotas, conductores y vehículos etiquetados
              con <code className="font-mono">TEST-</code> de la empresa
              seleccionada. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCleanup}>
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Math.max(Number(e.target.value) || 1, 1))}
      />
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <p className="text-2xl font-semibold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
