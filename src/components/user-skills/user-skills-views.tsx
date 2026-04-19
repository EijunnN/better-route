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
import { Can } from "@/components/auth/can";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserSkillForm } from "./user-skill-form";
import {
  useUserSkills,
  VEHICLE_SKILL_CATEGORY_LABELS,
  EXPIRY_STATUS_LABELS,
  getCategoryColor,
  type UserSkill,
} from "./user-skills-context";

export function UserSkillsListView() {
  const { state, actions } = useUserSkills();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestión de Habilidades de Usuarios</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Asigne y administre las habilidades y certificaciones de los usuarios (conductores)
          </p>
        </div>
        <Can perm="driver_skill:create">
          <Button onClick={() => actions.setShowForm(true)}>Asignar Habilidad</Button>
        </Can>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="filterUser">Usuario</Label>
              <Select value={state.filterUser} onValueChange={actions.setFilterUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {state.users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filterCategory">Categoría</Label>
              <Select value={state.filterCategory} onValueChange={actions.setFilterCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {Object.entries(VEHICLE_SKILL_CATEGORY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filterStatus">Estado</Label>
              <Select value={state.filterStatus} onValueChange={actions.setFilterStatus}>
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
              <Select value={state.filterExpiry} onValueChange={actions.setFilterExpiry}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  <SelectItem value="valid">Vigentes</SelectItem>
                  <SelectItem value="expiring_soon">Prontos a vencer</SelectItem>
                  <SelectItem value="expired">Vencidas</SelectItem>
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
      ) : state.filteredUserSkills.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No hay habilidades asignadas. Asigne la primera habilidad a un usuario.</p>
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
              {state.filteredUserSkills.map((userSkill) => (
                <UserSkillRow key={userSkill.id} userSkill={userSkill} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function UserSkillRow({ userSkill }: { userSkill: UserSkill }) {
  const { state, actions } = useUserSkills();

  return (
    <TableRow className={state.deletingId === userSkill.id ? "opacity-50" : ""}>
      <TableCell className="font-medium">{userSkill.user.name}</TableCell>
      <TableCell>
        <div className="font-medium">{userSkill.skill.name}</div>
        <div className="text-xs text-muted-foreground">{userSkill.skill.code}</div>
      </TableCell>
      <TableCell>
        <Badge className={getCategoryColor(userSkill.skill.category)}>
          {VEHICLE_SKILL_CATEGORY_LABELS[userSkill.skill.category] || userSkill.skill.category}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">{new Date(userSkill.obtainedAt).toLocaleDateString()}</TableCell>
      <TableCell>
        {userSkill.expiresAt ? (
          <div className="flex flex-col">
            <span>{new Date(userSkill.expiresAt).toLocaleDateString()}</span>
            <span
              className={`text-xs ${userSkill.expiryStatus === "expired" ? "text-destructive" : userSkill.expiryStatus === "expiring_soon" ? "text-orange-500" : "text-muted-foreground"}`}
            >
              {EXPIRY_STATUS_LABELS[userSkill.expiryStatus || "valid"]}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">Sin vencimiento</span>
        )}
      </TableCell>
      <TableCell>
        <Can
          perm="driver_skill:update"
          fallback={
            <Badge
              className={
                userSkill.active
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"
              }
            >
              {userSkill.active ? "Activo" : "Inactivo"}
            </Badge>
          }
        >
          <Button variant="ghost" size="sm" onClick={() => actions.handleToggleActive(userSkill.id, userSkill.active)} className="p-0 h-auto">
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
        </Can>
      </TableCell>
      <TableCell className="text-right">
        <Can perm="driver_skill:update">
          <Button variant="ghost" size="sm" onClick={() => actions.setEditingUserSkill(userSkill)} disabled={state.deletingId === userSkill.id}>
            Editar
          </Button>
        </Can>
        {userSkill.active && (
          <Can perm="driver_skill:delete">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={state.deletingId === userSkill.id}
                >
                  {state.deletingId === userSkill.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Desactivar habilidad?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción desactivará la habilidad <strong>{userSkill.skill.name}</strong> del usuario{" "}
                    <strong>{userSkill.user.name}</strong>.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => actions.handleDelete(userSkill.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Desactivar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Can>
        )}
      </TableCell>
    </TableRow>
  );
}

export function UserSkillsFormView() {
  const { state, actions } = useUserSkills();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {state.editingUserSkill ? "Editar Habilidad de Usuario" : "Asignar Nueva Habilidad"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {state.editingUserSkill ? "Actualice la información de la habilidad asignada" : "Asigne una habilidad a un usuario (conductor)"}
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <UserSkillForm
            onSubmit={state.editingUserSkill ? actions.handleUpdate : actions.handleCreate}
            initialData={
              state.editingUserSkill
                ? {
                    userId: state.editingUserSkill.userId,
                    skillId: state.editingUserSkill.skillId,
                    obtainedAt: state.editingUserSkill.obtainedAt,
                    expiresAt: state.editingUserSkill.expiresAt || "",
                    active: state.editingUserSkill.active,
                  }
                : undefined
            }
            users={state.users}
            skills={state.skills}
            submitLabel={state.editingUserSkill ? "Actualizar" : "Asignar"}
            onCancel={actions.cancelForm}
          />
        </CardContent>
      </Card>
    </div>
  );
}
