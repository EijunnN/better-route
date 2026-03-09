"use client";

import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isExpired, isExpiringSoon, type CreateUserInput } from "@/lib/validations/user";

interface RolePermission {
  id: string;
  entity: string;
  action: string;
  name: string;
  description: string | null;
  enabled: boolean;
}

interface GroupedPermissions {
  [category: string]: RolePermission[];
}

interface FormErrorDetail {
  path?: string[];
  field?: string;
  message: string;
}

interface FormSubmitError {
  details?: FormErrorDetail[];
  error?: string;
}

export interface CustomRole {
  id: string;
  name: string;
  description?: string | null;
  code?: string | null;
  isSystem: boolean;
  permissionsCount?: number;
}

export interface UserFormState {
  formData: CreateUserInput;
  errors: Record<string, string>;
  isSubmitting: boolean;
  selectedLicenseCategories: string[];
  selectedRoleIds: string[];
  expandedRoleId: string | null;
  rolePermissions: Record<string, GroupedPermissions>;
  isLoadingAllPermissions: boolean;
  activeTab: string;
}

export interface UserFormActions {
  updateField: (
    field: keyof CreateUserInput,
    value: CreateUserInput[keyof CreateUserInput],
  ) => void;
  setActiveTab: (tab: string) => void;
  toggleLicenseCategory: (category: string) => void;
  toggleRole: (roleId: string) => void;
  handleExpandRole: (roleId: string) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
}

export interface UserFormMeta {
  fleets: Array<{ id: string; name: string }>;
  roles: CustomRole[];
  submitLabel: string;
  isEditing: boolean;
  onCancel?: () => void;
  companyId?: string;
}

export interface UserFormDerived {
  showRolesColumn: boolean;
  showRolesSection: boolean;
  isConductor: boolean;
  licenseStatus: "expired" | "expiring_soon" | "valid" | null;
}

interface UserFormContextValue {
  state: UserFormState;
  actions: UserFormActions;
  meta: UserFormMeta;
  derived: UserFormDerived;
}

const UserFormContext = createContext<UserFormContextValue | undefined>(
  undefined,
);

export interface UserFormProviderProps {
  children: ReactNode;
  onSubmit: (
    data: CreateUserInput,
    selectedRoleIds: string[],
  ) => Promise<void>;
  onCancel?: () => void;
  initialData?: Partial<CreateUserInput>;
  fleets: Array<{ id: string; name: string }>;
  roles?: CustomRole[];
  initialRoleIds?: string[];
  submitLabel?: string;
  isEditing?: boolean;
  companyId?: string;
}


export function UserFormProvider({
  children,
  onSubmit,
  onCancel,
  initialData,
  fleets,
  roles = [],
  initialRoleIds = [],
  submitLabel = "Guardar",
  isEditing = false,
  companyId,
}: UserFormProviderProps) {
  const defaultData: CreateUserInput = {
    name: initialData?.name ?? "",
    email: initialData?.email ?? "",
    username: initialData?.username ?? "",
    password: "",
    role: initialData?.role ?? "CONDUCTOR",
    phone: initialData?.phone ?? "",
    identification: initialData?.identification ?? "",
    birthDate: initialData?.birthDate ?? null,
    photo: initialData?.photo ?? "",
    licenseNumber: initialData?.licenseNumber ?? "",
    licenseExpiry: initialData?.licenseExpiry ?? null,
    licenseCategories: initialData?.licenseCategories ?? "",
    certifications: initialData?.certifications ?? "",
    driverStatus: initialData?.driverStatus ?? "AVAILABLE",
    primaryFleetId: initialData?.primaryFleetId ?? null,
    active: initialData?.active ?? true,
  };

  const [formData, setFormData] = useState<CreateUserInput>(defaultData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedLicenseCategories, setSelectedLicenseCategories] = useState<
    string[]
  >(
    initialData?.licenseCategories
      ?.split(",")
      .map((c) => c.trim())
      .filter(Boolean) || [],
  );
  const [selectedRoleIds, setSelectedRoleIds] =
    useState<string[]>(initialRoleIds);
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
  const [rolePermissions, setRolePermissions] = useState<
    Record<string, GroupedPermissions>
  >({});
  const [isLoadingAllPermissions, setIsLoadingAllPermissions] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");

  const prevRoleIdsRef = useRef<string>("");

  useEffect(() => {
    if (!companyId || roles.length === 0) return;
    const roleIds = roles.map((r) => r.id).sort().join(",");
    if (roleIds === prevRoleIdsRef.current) return;
    prevRoleIdsRef.current = roleIds;

    const fetchAllPermissions = async () => {
      setIsLoadingAllPermissions(true);
      try {
        const response = await fetch(
          `/api/roles/batch/permissions?roleIds=${roleIds}`,
          { headers: { "x-company-id": companyId } },
        );
        if (response.ok) {
          const result = await response.json();
          setRolePermissions(result.data || {});
        }
      } catch (error) {
        console.error("Error fetching role permissions:", error);
      } finally {
        setIsLoadingAllPermissions(false);
      }
    };
    fetchAllPermissions();
  }, [companyId, roles]);

  const updateField = (
    field: keyof CreateUserInput,
    value: CreateUserInput[keyof CreateUserInput],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (prev[field]) {
        const n = { ...prev };
        delete n[field];
        return n;
      }
      return prev;
    });
  };

  const toggleLicenseCategory = (category: string) => {
    setSelectedLicenseCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category],
    );
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId)
        ? prev.filter((id) => id !== roleId)
        : [...prev, roleId],
    );
  };

  const handleExpandRole = (roleId: string) => {
    setExpandedRoleId((prev) => (prev === roleId ? null : roleId));
  };

  const isConductor = formData.role === "CONDUCTOR";
  const driverFields = new Set([
    "identification",
    "licenseNumber",
    "licenseExpiry",
    "licenseCategories",
    "driverStatus",
    "primaryFleetId",
    "birthDate",
    "certifications",
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const validationErrors: Record<string, string> = {};
    if (!formData.name.trim()) validationErrors.name = "Nombre es requerido";
    if (!formData.email.trim()) {
      validationErrors.email = "Email es requerido";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      validationErrors.email = "Formato de email inválido";
    }
    if (!formData.username.trim()) {
      validationErrors.username = "Username es requerido";
    } else if (formData.username.trim().length < 3) {
      validationErrors.username = "Username debe tener al menos 3 caracteres";
    }
    if (!isEditing && !formData.password) {
      validationErrors.password = "Contraseña es requerida";
    } else if (!isEditing && formData.password.length < 8) {
      validationErrors.password = "Contraseña debe tener al menos 8 caracteres";
    }
    if (!formData.role) validationErrors.role = "Rol es requerido";
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);

    const emptyToNull = (value: string | null | undefined): string | null => {
      if (value === undefined || value === null || value.trim() === "")
        return null;
      return value;
    };

    const submitData: CreateUserInput = {
      ...formData,
      phone: emptyToNull(formData.phone),
      photo: emptyToNull(formData.photo),
      birthDate: emptyToNull(formData.birthDate),
      certifications: emptyToNull(formData.certifications),
      licenseCategories: isConductor
        ? selectedLicenseCategories.length > 0
          ? selectedLicenseCategories.join(", ")
          : null
        : null,
      identification: isConductor
        ? emptyToNull(formData.identification)
        : null,
      licenseNumber: isConductor ? emptyToNull(formData.licenseNumber) : null,
      licenseExpiry: isConductor ? emptyToNull(formData.licenseExpiry) : null,
      driverStatus: isConductor ? formData.driverStatus : null,
      primaryFleetId: isConductor
        ? emptyToNull(formData.primaryFleetId)
        : null,
    };

    try {
      await onSubmit(submitData, selectedRoleIds);
    } catch (error) {
      const err: FormSubmitError =
        error && typeof error === "object"
          ? (error as FormSubmitError)
          : { error: "Error al guardar el usuario" };
      if (err.details && Array.isArray(err.details)) {
        const fieldErrors: Record<string, string> = {};
        let shouldOpenDriverTab = false;
        err.details.forEach((detail) => {
          const fieldName = detail.path?.[0] || detail.field || "form";
          fieldErrors[fieldName] = detail.message;
          if (driverFields.has(fieldName)) {
            shouldOpenDriverTab = true;
          }
        });
        setErrors(fieldErrors);
        if (shouldOpenDriverTab) {
          setActiveTab("driver");
        }
      } else {
        setErrors({ form: err.error || "Error al guardar el usuario" });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const licenseStatus = !formData.licenseExpiry
    ? null
    : isExpired(formData.licenseExpiry)
      ? "expired"
      : isExpiringSoon(formData.licenseExpiry)
        ? "expiring_soon"
        : "valid";

  const showRolesColumn = formData.role !== "ADMIN_SISTEMA";
  const showRolesSection =
    roles.length > 0 && formData.role !== "ADMIN_SISTEMA";

  const state: UserFormState = {
    formData,
    errors,
    isSubmitting,
    selectedLicenseCategories,
    selectedRoleIds,
    expandedRoleId,
    rolePermissions,
    isLoadingAllPermissions,
    activeTab,
  };

  const actions: UserFormActions = {
    updateField,
    setActiveTab,
    toggleLicenseCategory,
    toggleRole,
    handleExpandRole,
    handleSubmit,
  };

  const meta: UserFormMeta = {
    fleets,
    roles,
    submitLabel,
    isEditing,
    onCancel,
    companyId,
  };

  const derived: UserFormDerived = {
    showRolesColumn,
    showRolesSection,
    isConductor,
    licenseStatus,
  };

  return (
    <UserFormContext value={{ state, actions, meta, derived }}>
      {children}
    </UserFormContext>
  );
}

export function useUserForm(): UserFormContextValue {
  const context = use(UserFormContext);
  if (context === undefined) {
    throw new Error("useUserForm must be used within a UserFormProvider");
  }
  return context;
}
