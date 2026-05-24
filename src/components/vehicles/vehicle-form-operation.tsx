"use client";

import dynamic from "next/dynamic";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimePicker } from "@/components/ui/time-picker";
import { useVehicleForm } from "./vehicle-form-context";

const LocationPicker = dynamic(
  () =>
    import("@/components/ui/location-picker").then((mod) => mod.LocationPicker),
  { ssr: false },
);

export function VehicleFormOperation() {
  const { state, actions } = useVehicleForm();
  const { formData, isSubmitting } = state;
  const { updateField } = actions;

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardContent className="pt-4 space-y-4">
          <h4 className="font-medium text-sm">Punto de Origen</h4>

          {/* Campos manuales */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="originAddress">Dirección</Label>
              <Input
                id="originAddress"
                value={formData.originAddress ?? ""}
                onChange={(e) => updateField("originAddress", e.target.value)}
                disabled={isSubmitting}
                placeholder="Av. Principal 123, Lima"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="originLatitude">Latitud</Label>
              <Input
                id="originLatitude"
                value={formData.originLatitude ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  const coordsMatch = value.match(
                    /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/,
                  );
                  if (coordsMatch) {
                    updateField("originLatitude", coordsMatch[1]);
                    updateField("originLongitude", coordsMatch[2]);
                  } else {
                    updateField("originLatitude", value);
                  }
                }}
                disabled={isSubmitting}
                placeholder="-12.0464 o pega lat, lng"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="originLongitude">Longitud</Label>
              <Input
                id="originLongitude"
                value={formData.originLongitude ?? ""}
                onChange={(e) => updateField("originLongitude", e.target.value)}
                disabled={isSubmitting}
                placeholder="-77.0428"
              />
            </div>
          </div>

          {/* Mapa interactivo */}
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-2">
              O selecciona en el mapa:
            </p>
            <LocationPicker
              value={{
                lat: formData.originLatitude ?? "",
                lng: formData.originLongitude ?? "",
                address: formData.originAddress ?? "",
              }}
              onChange={(location) => {
                updateField("originLatitude", location.lat);
                updateField("originLongitude", location.lng);
                if (location.address) {
                  updateField("originAddress", location.address);
                }
              }}
              height="250px"
              disabled={isSubmitting}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-4">
          <h4 className="font-medium text-sm">Jornada Laboral</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="workdayStart">Inicio</Label>
              <TimePicker
                id="workdayStart"
                value={formData.workdayStart}
                onChange={(time) => updateField("workdayStart", time)}
                placeholder="Hora inicio"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workdayEnd">Fin</Label>
              <TimePicker
                id="workdayEnd"
                value={formData.workdayEnd}
                onChange={(time) => updateField("workdayEnd", time)}
                placeholder="Hora fin"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="pt-2 border-t">
            <div className="flex items-center gap-2 mb-3">
              <Checkbox
                id="hasBreakTime"
                checked={formData.hasBreakTime}
                onCheckedChange={(checked) =>
                  updateField("hasBreakTime", checked === true)
                }
                disabled={isSubmitting}
              />
              <Label htmlFor="hasBreakTime" className="text-sm cursor-pointer">
                Tiempo de descanso
              </Label>
            </div>

            {formData.hasBreakTime && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="breakDuration" className="text-xs">
                    Duración (min)
                  </Label>
                  <Input
                    id="breakDuration"
                    type="number"
                    min="1"
                    value={formData.breakDuration ?? ""}
                    onChange={(e) =>
                      updateField(
                        "breakDuration",
                        parseInt(e.target.value, 10) || null,
                      )
                    }
                    disabled={isSubmitting}
                    placeholder="60"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="breakTimeStart" className="text-xs">
                    Inicio
                  </Label>
                  <TimePicker
                    id="breakTimeStart"
                    value={formData.breakTimeStart}
                    onChange={(time) => updateField("breakTimeStart", time)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="breakTimeEnd" className="text-xs">
                    Fin
                  </Label>
                  <TimePicker
                    id="breakTimeEnd"
                    value={formData.breakTimeEnd}
                    onChange={(time) => updateField("breakTimeEnd", time)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
