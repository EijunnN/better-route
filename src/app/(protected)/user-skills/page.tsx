"use client";

import { AlertCircle, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { UserSkillForm } from "@/components/user-skills/user-skill-form";
import { useToast } from "@/hooks/use-toast";
import type { UserSkillInput } from "@/lib/validations/user-skill";

interface UserSkill {
  id: string;
  userId: string;
  skillId: string;
  obtainedAt: string;
  expiresAt?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  skill: {
    id: string;
    code: string;
    name: string;
    category: string;
    description?: string;
  };
  user: {
    id: string;
    name: string;
    identification: string | null;
  };
  expiryStatus?: string;
}

interface User {
  id: string;
  name: string;
  identification: string | null;
  role: string;
}

interface VehicleSkill {
  id: string;
  code: string;
  name: string;
  category: string;
  description?: string;
  active: boolean;
}

const VEHICLE_SKILL_CATEGORY_LABELS: Record<string, string> = {
  EQUIPMENT: "Equipamiento",
  TEMPERATURE: "Temperatura",
  CERTIFICATIONS: "Certificaciones",
  SPECIAL: "Especiales",
};

const EXPIRY_STATUS_LABELS: Record<string, string> = {
  valid: "Vigente",
  expiring_soon: "Pronto a vencer",
  expired: "Vencida",
};

const getCategoryColor = (category: string) => {
  switch (category) {
    case "EQUIPMENT":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "TEMPERATURE":
      return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400";
    case "CERTIFICATIONS":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
    case "SPECIAL":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
  }
};

function UserSkillsPageContent() {
  const { effectiveCompanyId: companyId, isReady } = useCompanyContext();
  const { toast } = useToast();
  const [userSkills, setUserSkills] = useState<UserSkill[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [skills, setSkills] = useState<VehicleSkill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUserSkill, setEditingUserSkill] = useState<UserSkill | null>(
    null,
  );
  const [filterUser, setFilterUser] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterExpiry, setFilterExpiry] = useState<string>("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchUserSkills = useCallback(async () => {
    if (!companyId) return;
    try {
      const params = new URLSearchParams();
      if (filterUser && filterUser !== "__all__")
        params.append("userId", filterUser);
      if (filterStatus && filterStatus !== "__all__")
        params.append("active", filterStatus);
      if (filterExpiry && filterExpiry !== "__all__")
        params.append("status", filterExpiry);

      const response = await fetch(`/api/user-skills?${params.toString()}`, {
        headers: {
          "x-company-id": companyId ?? "",
        },
      });
      const data = await response.json();
      setUserSkills(data.data || []);
    } catch (error) {
      console.error("Error al cargar habilidades:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las habilidades de usuarios",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [companyId, filterUser, filterStatus, filterExpiry, toast]);

  const fetchUsers = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/users?active=true", {
        headers: {
          "x-company-id": companyId ?? "",
        },
      });
      const data = await response.json();
      const conductors = (data.data || []).filter(
        (u: User) => u.role === "CONDUCTOR",
      );
      setUsers(conductors);
    } catch (error) {
      console.error("Error al cargar usuarios:", error);
    }
  }, [companyId]);

  const fetchSkills = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/vehicle-skills?active=true", {
        headers: {
          "x-company-id": companyId ?? "",
        },
      });
      const data = await response.json();
      setSkills(data.data || []);
    } catch (error) {
      console.error("Error al cargar habilidades:", error);
    }
  }, [companyId]);

  useEffect(() => {
    fetchUserSkills();
    fetchUsers();
    fetchSkills();
  }, [fetchUserSkills, fetchUsers, fetchSkills]);

  const handleCreate = async (data: UserSkillInput) => {
    try {
      const response = await fetch("/api/user-skills", {
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

      await fetchUserSkills();
      setShowForm(false);
      toast({
        title: "Habilidad asignada",
        description: "La habilidad ha sido asignada exitosamente al usuario.",
      });
    } catch (err) {
      toast({
        title: "Error al asignar habilidad",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleUpdate = async (data: UserSkillInput) => {
    if (!editingUserSkill) return;

    try {
      const response = await fetch(`/api/user-skills/${editingUserSkill.id}`, {
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

      await fetchUserSkills();
      setEditingUserSkill(null);
      toast({
        title: "Habilidad actualizada",
        description:
          "La habilidad del usuario ha sido actualizada exitosamente.",
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
    setDeletingId(id);
    const userSkill = userSkills.find((us) => us.id === id);

    try {
      const response = await fetch(`/api/user-skills/${id}`, {
        method: "DELETE",
        headers: {
          "x-company-id": companyId ?? "",
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || error.details || "Error al desactivar la habilidad",
        );
      }

      await fetchUserSkills();
      toast({
        title: "Habilidad desactivada",
        description: userSkill
          ? `La habilidad "${userSkill.skill.name}" de ${userSkill.user.name} ha sido desactivada.`
          : "La habilidad ha sido desactivada.",
      });
    } catch (err) {
      toast({
        title: "Error al desactivar habilidad",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const response = await fetch(`/api/user-skills/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId ?? "",
        },
        body: JSON.stringify({ active: !currentActive }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || error.details || "Error al actualizar el estado",
        );
      }

      await fetchUserSkills();
      toast({
        title: "Estado actualizado",
        description: `La habilidad ahora está ${!currentActive ? "activa" : "inactiva"}.`,
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

  // Filter by category (client-side)
  const filteredUserSkills = useMemo(() => {
    if (!filterCategory || filterCategory === "__all__") return userSkills;
    return userSkills.filter((us) => us.skill.category === filterCategory);
  }, [userSkills, filterCategory]);

  if (!isReady) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (showForm || editingUserSkill) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {editingUserSkill
              ? "Editar Habilidad de Usuario"
              : "Asignar Nueva Habilidad"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {editingUserSkill
              ? "Actualice la información de la habilidad asignada"
              : "Asigne una habilidad a un usuario (conductor)"}
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <UserSkillForm
              onSubmit={editingUserSkill ? handleUpdate : handleCreate}
              initialData={
                editingUserSkill
                  ? {
                      userId: editingUserSkill.userId,
                      skillId: editingUserSkill.skillId,
                      obtainedAt: editingUserSkill.obtainedAt,
                      expiresAt: editingUserSkill.expiresAt || "",
                      active: editingUserSkill.active,
                    }
                  : undefined
              }
              users={users}
              skills={skills}
              submitLabel={editingUserSkill ? "Actualizar" : "Asignar"}
              onCancel={() => {
                setShowForm(false);
                setEditingUserSkill(null);
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
            Gestión de Habilidades de Usuarios
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Asigne y administre las habilidades y certificaciones de los
            usuarios (conductores)
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>Asignar Habilidad</Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="filterUser">Usuario</Label>
              <Select value={filterUser} onValueChange={setFilterUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filterCategory">Categoría</Label>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {Object.entries(VEHICLE_SKILL_CATEGORY_LABELS).map(
                    ([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filterStatus">Estado</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
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
            <div className="space-y-2">
              <Label htmlFor="filterExpiry">Vencimiento</Label>
              <Select value={filterExpiry} onValueChange={setFilterExpiry}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  <SelectItem value="valid">Vigentes</SelectItem>
                  <SelectItem value="expiring_soon">
                    Prontos a vencer
                  </SelectItem>
                  <SelectItem value="expired">Vencidas</SelectItem>
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
      ) : filteredUserSkills.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              No hay habilidades asignadas. Asigne la primera habilidad a un
              usuario.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Habilidad</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Fecha Obtención</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUserSkills.map((userSkill) => (
                <TableRow
                  key={userSkill.id}
                  className={deletingId === userSkill.id ? "opacity-50" : ""}
                >
                  <TableCell className="font-medium">
                    {userSkill.user.name}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{userSkill.skill.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {userSkill.skill.code}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={getCategoryColor(userSkill.skill.category)}
                    >
                      {VEHICLE_SKILL_CATEGORY_LABELS[
                        userSkill.skill.category
                      ] || userSkill.skill.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(userSkill.obtainedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {userSkill.expiresAt ? (
                      <div className="flex flex-col">
                        <span>
                          {new Date(userSkill.expiresAt).toLocaleDateString()}
                        </span>
                        <span
                          className={`text-xs ${
                            userSkill.expiryStatus === "expired"
                              ? "text-destructive"
                              : userSkill.expiryStatus === "expiring_soon"
                                ? "text-orange-500"
                                : "text-muted-foreground"
                          }`}
                        >
                          {
                            EXPIRY_STATUS_LABELS[
                              userSkill.expiryStatus || "valid"
                            ]
                          }
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">
                        Sin vencimiento
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        handleToggleActive(userSkill.id, userSkill.active)
                      }
                      className="p-0 h-auto"
                    >
                      <Badge
                        className={
                          userSkill.active
                            ? "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-900/30 dark:text-gray-400"
                        }
                      >
                        {userSkill.active ? "Activo" : "Inactivo"}
                      </Badge>
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingUserSkill(userSkill)}
                      disabled={deletingId === userSkill.id}
                    >
                      Editar
                    </Button>
                    {userSkill.active && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={deletingId === userSkill.id}
                          >
                            {deletingId === userSkill.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              ¿Desactivar habilidad?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta acción desactivará la habilidad{" "}
                              <strong>{userSkill.skill.name}</strong> del
                              usuario <strong>{userSkill.user.name}</strong>.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(userSkill.id)}
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
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

export default function UserSkillsPage() {
  return (
    <ProtectedPage requiredPermission="user_skills:VIEW">
      <UserSkillsPageContent />
    </ProtectedPage>
  );
}
