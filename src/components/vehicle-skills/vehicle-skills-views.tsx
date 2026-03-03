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
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VehicleSkillForm } from "./vehicle-skill-form";
import { useVehicleSkills, CATEGORY_BADGE_COLORS, type VehicleSkill } from "./vehicle-skills-context";
import { VEHICLE_SKILL_CATEGORY_LABELS, type VehicleSkillInput } from "@/lib/validations/vehicle-skill";

export function VehicleSkillsListView() {
  const { state, actions } = useVehicleSkills();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Catálogo de Habilidades de Vehículos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gestione las capacidades especiales de los vehículos</p>
        </div>
        <Button onClick={() => actions.setShowForm(true)}>Nueva Habilidad</Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="search">Buscar</Label>
              <Input
                id="search"
                value={state.searchTerm}
                onChange={(e) => actions.setSearchTerm(e.target.value)}
                placeholder="Código, nombre o descripción..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Categoría</Label>
              <Select value={state.filterCategory} onValueChange={actions.setFilterCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {Object.entries(VEHICLE_SKILL_CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="active">Estado</Label>
              <Select value={state.filterActive} onValueChange={actions.setFilterActive}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  <SelectItem value="true">Activos</SelectItem>
                  <SelectItem value="false">Inactivos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {state.isLoading ? (
        <Card>
          <CardContent className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : state.error ? (
        <ErrorState title="Error al cargar habilidades" error={state.error} onRetry={actions.fetchSkills} />
      ) : state.skills.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {state.searchTerm || state.filterCategory || state.filterActive
                ? "No se encontraron habilidades con los filtros aplicados."
                : "No hay habilidades registradas. Cree la primera habilidad."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.skills.map((skill) => (
                <VehicleSkillRow key={skill.id} skill={skill} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function VehicleSkillRow({ skill }: { skill: VehicleSkill }) {
  const { state, actions } = useVehicleSkills();

  return (
    <TableRow className={state.deletingId === skill.id ? "opacity-50" : ""}>
      <TableCell className="font-mono font-medium">{skill.code}</TableCell>
      <TableCell className="font-medium">{skill.name}</TableCell>
      <TableCell>
        <Badge className={CATEGORY_BADGE_COLORS[skill.category] || "bg-gray-100 text-gray-800"}>
          {VEHICLE_SKILL_CATEGORY_LABELS[skill.category] || skill.category}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground max-w-xs truncate">{skill.description || "-"}</TableCell>
      <TableCell>
        <Button variant="ghost" size="sm" onClick={() => actions.handleToggleActive(skill)} className="p-0 h-auto">
          <Badge
            className={
              skill.active
                ? "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
                : "bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-900/30 dark:text-gray-400"
            }
          >
            {skill.active ? "Activo" : "Inactivo"}
          </Badge>
        </Button>
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="sm" onClick={() => actions.setEditingSkill(skill)} disabled={state.deletingId === skill.id}>
          Editar
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={state.deletingId === skill.id}
            >
              {state.deletingId === skill.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar habilidad?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción eliminará permanentemente la habilidad <strong>{skill.name}</strong>. Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => actions.handleDelete(skill.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}

export function VehicleSkillsFormView() {
  const { state, actions } = useVehicleSkills();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{state.editingSkill ? "Editar Habilidad" : "Nueva Habilidad"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {state.editingSkill ? "Actualice la información de la habilidad" : "Complete el formulario para crear una nueva habilidad"}
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <VehicleSkillForm
            onSubmit={state.editingSkill ? actions.handleUpdate : actions.handleCreate}
            initialData={
              state.editingSkill
                ? {
                    code: state.editingSkill.code,
                    name: state.editingSkill.name,
                    category: state.editingSkill.category as VehicleSkillInput["category"],
                    description: state.editingSkill.description,
                    active: state.editingSkill.active,
                  }
                : undefined
            }
            submitLabel={state.editingSkill ? "Actualizar" : "Crear"}
            onCancel={actions.cancelForm}
          />
        </CardContent>
      </Card>
    </div>
  );
}
