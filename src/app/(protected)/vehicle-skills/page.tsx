"use client";

import { AlertCircle, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ProtectedPage } from "@/components/auth/protected-page";
import { useCompanyContext } from "@/hooks/use-company-context";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VehicleSkillForm } from "@/components/vehicle-skills/vehicle-skill-form";
import { useToast } from "@/hooks/use-toast";
import type { VehicleSkillInput } from "@/lib/validations/vehicle-skill";
import { VEHICLE_SKILL_CATEGORY_LABELS } from "@/lib/validations/vehicle-skill";

interface VehicleSkill {
  id: string;
  code: string;
  name: string;
  category: string;
  description?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_BADGE_COLORS: Record<string, string> = {
  EQUIPMENT: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  TEMPERATURE:
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  CERTIFICATIONS:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  SPECIAL:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

function VehicleSkillsPageContent() {
  const { effectiveCompanyId: companyId, isReady } = useCompanyContext();
  const { toast } = useToast();
  const [skills, setSkills] = useState<VehicleSkill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSkill, setEditingSkill] = useState<VehicleSkill | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterActive, setFilterActive] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchSkills = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterCategory) params.append("category", filterCategory);
      if (filterActive) params.append("active", filterActive);
      if (searchTerm) params.append("search", searchTerm);

      const response = await fetch(`/api/vehicle-skills?${params.toString()}`, {
        headers: {
          "x-company-id": companyId ?? "",
        },
      });
      const data = await response.json();
      setSkills(data.data || []);
    } catch (error) {
      console.error("Error al cargar habilidades:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las habilidades",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [companyId, filterCategory, filterActive, searchTerm, toast]);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const handleCreate = async (data: VehicleSkillInput) => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/vehicle-skills", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId ?? "",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw error;
      }

      await fetchSkills();
      setShowForm(false);
      toast({
        title: "Habilidad creada",
        description: `La habilidad "${data.name}" ha sido creada exitosamente.`,
      });
    } catch (err) {
      toast({
        title: "Error al crear habilidad",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleUpdate = async (data: VehicleSkillInput) => {
    if (!editingSkill || !companyId) return;

    try {
      const response = await fetch(`/api/vehicle-skills/${editingSkill.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId ?? "",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw error;
      }

      await fetchSkills();
      setEditingSkill(null);
      toast({
        title: "Habilidad actualizada",
        description: `La habilidad "${data.name}" ha sido actualizada exitosamente.`,
      });
    } catch (err) {
      toast({
        title: "Error al actualizar habilidad",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleDelete = async (id: string) => {
    if (!companyId) return;
    setDeletingId(id);
    const skill = skills.find((s) => s.id === id);

    try {
      const response = await fetch(`/api/vehicle-skills/${id}`, {
        method: "DELETE",
        headers: {
          "x-company-id": companyId ?? "",
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || error.details || "Error al eliminar la habilidad",
        );
      }

      await fetchSkills();
      toast({
        title: "Habilidad eliminada",
        description: skill
          ? `La habilidad "${skill.name}" ha sido eliminada.`
          : "La habilidad ha sido eliminada.",
      });
    } catch (err) {
      toast({
        title: "Error al eliminar habilidad",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (skill: VehicleSkill) => {
    if (!companyId) return;
    try {
      const response = await fetch(`/api/vehicle-skills/${skill.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId ?? "",
        },
        body: JSON.stringify({ active: !skill.active }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al actualizar el estado");
      }

      await fetchSkills();
      toast({
        title: "Estado actualizado",
        description: `La habilidad "${skill.name}" ahora está ${!skill.active ? "activa" : "inactiva"}.`,
      });
    } catch (err) {
      toast({
        title: "Error al actualizar estado",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
    }
  };

  if (!isReady) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (showForm || editingSkill) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {editingSkill ? "Editar Habilidad" : "Nueva Habilidad"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {editingSkill
              ? "Actualice la información de la habilidad"
              : "Complete el formulario para crear una nueva habilidad"}
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <VehicleSkillForm
              onSubmit={editingSkill ? handleUpdate : handleCreate}
              initialData={
                editingSkill
                  ? {
                      code: editingSkill.code,
                      name: editingSkill.name,
                      category:
                        editingSkill.category as VehicleSkillInput["category"],
                      description: editingSkill.description,
                      active: editingSkill.active,
                    }
                  : undefined
              }
              submitLabel={editingSkill ? "Actualizar" : "Crear"}
              onCancel={() => {
                setShowForm(false);
                setEditingSkill(null);
              }}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Catálogo de Habilidades de Vehículos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestione las capacidades especiales de los vehículos
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>Nueva Habilidad</Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="search">Buscar</Label>
              <Input
                id="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Código, nombre o descripción..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Categoría</Label>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {Object.entries(VEHICLE_SKILL_CATEGORY_LABELS).map(
                    ([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="active">Estado</Label>
              <Select value={filterActive} onValueChange={setFilterActive}>
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

      {isLoading ? (
        <Card>
          <CardContent className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : skills.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {searchTerm || filterCategory || filterActive
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
              {skills.map((skill) => (
                <TableRow
                  key={skill.id}
                  className={deletingId === skill.id ? "opacity-50" : ""}
                >
                  <TableCell className="font-mono font-medium">
                    {skill.code}
                  </TableCell>
                  <TableCell className="font-medium">{skill.name}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        CATEGORY_BADGE_COLORS[skill.category] ||
                        "bg-gray-100 text-gray-800"
                      }
                    >
                      {VEHICLE_SKILL_CATEGORY_LABELS[skill.category] ||
                        skill.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-xs truncate">
                    {skill.description || "-"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleActive(skill)}
                      className="p-0 h-auto"
                    >
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingSkill(skill)}
                      disabled={deletingId === skill.id}
                    >
                      Editar
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={deletingId === skill.id}
                        >
                          {deletingId === skill.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            ¿Eliminar habilidad?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción eliminará permanentemente la habilidad{" "}
                            <strong>{skill.name}</strong>. Esta acción no se
                            puede deshacer.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(skill.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

export default function VehicleSkillsPage() {
  return (
    <ProtectedPage requiredPermission="vehicle_skills:VIEW">
      <VehicleSkillsPageContent />
    </ProtectedPage>
  );
}
