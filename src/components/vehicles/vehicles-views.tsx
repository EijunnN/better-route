"use client";

import { AlertCircle, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VehicleForm } from "@/components/vehicles/vehicle-form";
import { VehicleStatusModal } from "@/components/vehicles/vehicle-status-modal";
import type { VehicleInput } from "@/lib/validations/vehicle";
import { useVehicles, VEHICLE_STATUS_LABELS, type Vehicle } from "./vehicles-context";

export function VehiclesListView() {
  const { state, actions } = useVehicles();

  return (
    <div className="space-y-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestión de Vehículos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Administre los vehículos de la flota</p>
        </div>
        <Button onClick={() => actions.setShowForm(true)}>Nuevo Vehículo</Button>
      </div>

      {state.isLoading ? (
        <Card>
          <CardContent className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : state.vehicles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No hay vehículos registrados. Cree el primer vehículo.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Placa</TableHead>
                <TableHead>Conductor</TableHead>
                <TableHead>Max Pedidos</TableHead>
                <TableHead>Flotas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.vehicles.map((vehicle) => (
                <VehicleRow key={vehicle.id} vehicle={vehicle} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {state.statusModalVehicle && (
        <VehicleStatusModal
          open={!!state.statusModalVehicle}
          onOpenChange={(open) => !open && actions.setStatusModalVehicle(null)}
          vehicleId={state.statusModalVehicle.id}
          currentStatus={state.statusModalVehicle.status}
          vehiclePlate={state.statusModalVehicle.plate || state.statusModalVehicle.name}
          onStatusChange={actions.handleStatusChange}
        />
      )}
    </div>
  );
}

function VehicleRow({ vehicle }: { vehicle: Vehicle }) {
  const { state, actions } = useVehicles();

  const getFleetNames = () => {
    if (vehicle.fleets && vehicle.fleets.length > 0) {
      return vehicle.fleets.map((f) => f.name).join(", ");
    }
    return "-";
  };

  return (
    <TableRow className={state.deletingId === vehicle.id ? "opacity-50" : ""}>
      <TableCell className="font-medium">{vehicle.name}</TableCell>
      <TableCell className="text-muted-foreground">{vehicle.plate || "-"}</TableCell>
      <TableCell className="text-muted-foreground">{vehicle.assignedDriver?.name || "-"}</TableCell>
      <TableCell className="text-muted-foreground">{vehicle.maxOrders}</TableCell>
      <TableCell className="text-muted-foreground max-w-[200px] truncate">{getFleetNames()}</TableCell>
      <TableCell>
        <Badge
          variant={
            vehicle.status === "AVAILABLE"
              ? "default"
              : vehicle.status === "IN_MAINTENANCE"
                ? "secondary"
                : vehicle.status === "ASSIGNED"
                  ? "outline"
                  : "destructive"
          }
          className={
            vehicle.status === "AVAILABLE"
              ? "bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400"
              : vehicle.status === "IN_MAINTENANCE"
                ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400"
                : vehicle.status === "ASSIGNED"
                  ? "bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400"
                  : ""
          }
        >
          {VEHICLE_STATUS_LABELS[vehicle.status] || vehicle.status}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => actions.handleEditVehicle(vehicle)}
          disabled={state.deletingId === vehicle.id}
        >
          Editar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => actions.setStatusModalVehicle(vehicle)}
          disabled={state.deletingId === vehicle.id}
        >
          Cambiar Estado
        </Button>
        {vehicle.active && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={state.deletingId === vehicle.id}
              >
                {state.deletingId === vehicle.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Desactivar vehículo?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta acción desactivará el vehículo <strong>{vehicle.name}</strong>. No podrá ser asignado a rutas.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => actions.handleDelete(vehicle.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Desactivar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </TableCell>
    </TableRow>
  );
}

export function VehiclesFormView() {
  const { state, actions, meta } = useVehicles();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {state.editingVehicle ? "Editar Vehículo" : "Nuevo Vehículo"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {state.editingVehicle
            ? "Actualice la información del vehículo"
            : "Complete el formulario para crear un nuevo vehículo"}
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <VehicleForm
            onSubmit={state.editingVehicle ? actions.handleUpdate : actions.handleCreate}
            initialData={
              state.editingVehicle
                ? {
                    name: state.editingVehicle.name,
                    useNameAsPlate: state.editingVehicle.useNameAsPlate,
                    plate: state.editingVehicle.plate || "",
                    loadType: state.editingVehicle.loadType as VehicleInput["loadType"],
                    maxOrders: state.editingVehicle.maxOrders,
                    originAddress: state.editingVehicle.originAddress || "",
                    originLatitude: state.editingVehicle.originLatitude || "",
                    originLongitude: state.editingVehicle.originLongitude || "",
                    assignedDriverId: state.editingVehicle.assignedDriverId,
                    workdayStart: state.editingVehicle.workdayStart || "",
                    workdayEnd: state.editingVehicle.workdayEnd || "",
                    hasBreakTime: state.editingVehicle.hasBreakTime,
                    breakDuration: state.editingVehicle.breakDuration,
                    breakTimeStart: state.editingVehicle.breakTimeStart || "",
                    breakTimeEnd: state.editingVehicle.breakTimeEnd || "",
                    fleetIds: state.editingVehicle.fleetIds || [],
                    brand: state.editingVehicle.brand || "",
                    model: state.editingVehicle.model || "",
                    year: state.editingVehicle.year,
                    type: state.editingVehicle.type as VehicleInput["type"],
                    weightCapacity: state.editingVehicle.weightCapacity,
                    volumeCapacity: state.editingVehicle.volumeCapacity,
                    maxValueCapacity: state.editingVehicle.maxValueCapacity,
                    maxUnitsCapacity: state.editingVehicle.maxUnitsCapacity,
                    refrigerated: state.editingVehicle.refrigerated,
                    heated: state.editingVehicle.heated,
                    lifting: state.editingVehicle.lifting,
                    licenseRequired: state.editingVehicle.licenseRequired as VehicleInput["licenseRequired"],
                    insuranceExpiry: state.editingVehicle.insuranceExpiry || "",
                    inspectionExpiry: state.editingVehicle.inspectionExpiry || "",
                    status: state.editingVehicle.status as VehicleInput["status"],
                    active: state.editingVehicle.active,
                  }
                : undefined
            }
            fleets={state.fleets}
            drivers={state.drivers}
            availableSkills={state.availableSkills}
            initialSkillIds={state.editingVehicle ? state.editingVehicleSkillIds : []}
            companyProfile={state.companyProfile ?? undefined}
            submitLabel={state.editingVehicle ? "Actualizar" : "Crear"}
            onCancel={actions.cancelForm}
          />
        </CardContent>
      </Card>
    </div>
  );
}
