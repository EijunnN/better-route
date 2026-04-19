"use client";

import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { useCompanyContext } from "@/hooks/use-company-context";
import { useToast } from "@/hooks/use-toast";

export interface CompanyProfile {
  id?: string;
  companyId?: string;
  enableWeight: boolean;
  enableVolume: boolean;
  enableOrderValue: boolean;
  enableUnits: boolean;
  enableOrderType: boolean;
  activeDimensions: string[];
  priorityMapping: { NEW: number; RESCHEDULED: number; URGENT: number };
}

export interface ProfileTemplate {
  id: string;
  name: string;
  enableWeight: boolean;
  enableVolume: boolean;
  enableOrderValue: boolean;
  enableUnits: boolean;
  enableOrderType: boolean;
}

export interface TrackingSettings {
  trackingEnabled: boolean;
  showMap: boolean;
  showDriverLocation: boolean;
  showDriverName: boolean;
  showDriverPhoto: boolean;
  showEvidence: boolean;
  showEta: boolean;
  showTimeline: boolean;
  brandColor: string;
  logoUrl: string | null;
  customMessage: string | null;
  tokenExpiryHours: number;
  autoGenerateTokens: boolean;
}

/**
 * Which sections of the page have unsaved changes. A single "Save all"
 * button commits every dirty section in order. Dropped the old separate
 * `hasChanges` + `trackingHasChanges` flags — one dirty registry per page.
 */
export type DirtySection = "profile" | "tracking";

export interface ConfiguracionState {
  profile: CompanyProfile | null;
  templates: ProfileTemplate[];
  tracking: TrackingSettings | null;
  isLoading: boolean;
  isSaving: boolean;
  isDefault: boolean;
  dirty: Set<DirtySection>;
}

export interface ConfiguracionActions {
  /** Merge a partial profile and mark `profile` dirty. */
  updateProfile: (partial: Partial<CompanyProfile>) => void;
  /** Merge a partial tracking settings object and mark `tracking` dirty. */
  updateTracking: (partial: Partial<TrackingSettings>) => void;
  /** Apply a server-provided template as a full profile replacement. */
  applyTemplate: (templateId: string) => void;
  /** Toggle one of the 4 capacity dimensions. */
  toggleDimension: (
    key: "enableWeight" | "enableVolume" | "enableOrderValue" | "enableUnits",
    dimension: string,
  ) => void;
  /** Save every dirty section. Short-circuits when nothing is dirty. */
  saveAll: () => Promise<void>;
  /** Reset the profile to defaults (DELETE endpoint). Asks for confirmation. */
  resetProfile: () => Promise<void>;
  /** Download the CSV import template seeded with this company's schema. */
  downloadCsvTemplate: () => Promise<void>;
}

export interface ConfiguracionMeta {
  companyId: string | null;
  isReady: boolean;
  isSystemAdmin: boolean;
  companies: Array<{ id: string; commercialName: string }>;
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
  authCompanyId: string | null;
}

interface ConfiguracionContextValue {
  state: ConfiguracionState;
  actions: ConfiguracionActions;
  meta: ConfiguracionMeta;
}

const ConfiguracionContext = createContext<ConfiguracionContextValue | undefined>(undefined);

const DEFAULT_PROFILE: CompanyProfile = {
  enableWeight: true,
  enableVolume: true,
  enableOrderValue: false,
  enableUnits: false,
  enableOrderType: false,
  activeDimensions: ["WEIGHT", "VOLUME"],
  priorityMapping: { NEW: 50, RESCHEDULED: 80, URGENT: 100 },
};

export function ConfiguracionProvider({ children }: { children: ReactNode }) {
  const {
    effectiveCompanyId: companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  } = useCompanyContext();
  const { toast } = useToast();

  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [templates, setTemplates] = useState<ProfileTemplate[]>([]);
  const [tracking, setTracking] = useState<TrackingSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDefault, setIsDefault] = useState(true);
  const [dirty, setDirty] = useState<Set<DirtySection>>(new Set());

  const markDirty = (section: DirtySection) => {
    setDirty((prev) => {
      if (prev.has(section)) return prev;
      const next = new Set(prev);
      next.add(section);
      return next;
    });
  };

  const clearDirty = () => setDirty(new Set());

  const fetchProfile = async () => {
    if (!companyId || !isReady) return;
    setIsLoading(true);
    try {
      const response = await fetch("/api/company-profiles", {
        headers: { "x-company-id": companyId },
      });
      const data = await response.json();

      if (data.data?.profile) {
        setProfile(data.data.profile);
        setIsDefault(false);
      } else {
        setProfile(DEFAULT_PROFILE);
        setIsDefault(true);
      }
      if (data.data?.templates) setTemplates(data.data.templates);
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTracking = async () => {
    if (!companyId || !isReady) return;
    try {
      const response = await fetch("/api/tracking/settings", {
        headers: { "x-company-id": companyId },
      });
      const data = await response.json();
      if (data.data) setTracking(data.data);
    } catch (error) {
      console.error("Error fetching tracking settings:", error);
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchTracking();
    clearDirty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, isReady]);

  const updateProfile = (partial: Partial<CompanyProfile>) => {
    setProfile((prev) => (prev ? { ...prev, ...partial } : prev));
    markDirty("profile");
  };

  const updateTracking = (partial: Partial<TrackingSettings>) => {
    setTracking((prev) => (prev ? { ...prev, ...partial } : prev));
    markDirty("tracking");
  };

  const toggleDimension = (
    key: "enableWeight" | "enableVolume" | "enableOrderValue" | "enableUnits",
    dimension: string,
  ) => {
    if (!profile) return;
    const enabled = !profile[key];
    const activeDimensions = enabled
      ? [...profile.activeDimensions, dimension]
      : profile.activeDimensions.filter((d) => d !== dimension);
    updateProfile({ [key]: enabled, activeDimensions } as Partial<CompanyProfile>);
  };

  const applyTemplate = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template || !profile) return;

    const activeDimensions: string[] = [];
    if (template.enableWeight) activeDimensions.push("WEIGHT");
    if (template.enableVolume) activeDimensions.push("VOLUME");
    if (template.enableOrderValue) activeDimensions.push("VALUE");
    if (template.enableUnits) activeDimensions.push("UNITS");

    updateProfile({
      enableWeight: template.enableWeight,
      enableVolume: template.enableVolume,
      enableOrderValue: template.enableOrderValue,
      enableUnits: template.enableUnits,
      enableOrderType: template.enableOrderType,
      activeDimensions,
    });
  };

  const saveAll = async () => {
    if (!companyId || dirty.size === 0) return;
    setIsSaving(true);
    const savedSections: DirtySection[] = [];
    try {
      if (dirty.has("profile") && profile) {
        const r = await fetch("/api/company-profiles", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-company-id": companyId,
          },
          body: JSON.stringify({
            enableWeight: profile.enableWeight,
            enableVolume: profile.enableVolume,
            enableOrderValue: profile.enableOrderValue,
            enableUnits: profile.enableUnits,
            enableOrderType: profile.enableOrderType,
            priorityNew: profile.priorityMapping.NEW,
            priorityRescheduled: profile.priorityMapping.RESCHEDULED,
            priorityUrgent: profile.priorityMapping.URGENT,
          }),
        });
        if (r.ok) {
          savedSections.push("profile");
          setIsDefault(false);
        } else {
          throw new Error(`Error ${r.status} al guardar perfil`);
        }
      }

      if (dirty.has("tracking") && tracking) {
        const r = await fetch("/api/tracking/settings", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-company-id": companyId,
          },
          body: JSON.stringify(tracking),
        });
        if (r.ok) {
          savedSections.push("tracking");
          const data = await r.json();
          if (data.data) setTracking(data.data);
        } else {
          throw new Error(`Error ${r.status} al guardar seguimiento`);
        }
      }

      toast({
        title: "Cambios guardados",
        description:
          savedSections.length === 2
            ? "Perfil y seguimiento actualizados"
            : savedSections[0] === "profile"
              ? "Perfil actualizado"
              : "Seguimiento actualizado",
      });
      clearDirty();
      fetchProfile();
    } catch (error) {
      toast({
        title: "Error al guardar",
        description: error instanceof Error ? error.message : "Inténtalo de nuevo",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const resetProfile = async () => {
    if (!companyId) return;
    if (!confirm("¿Restablecer a valores predeterminados?")) return;
    try {
      await fetch("/api/company-profiles", {
        method: "DELETE",
        headers: { "x-company-id": companyId },
      });
      fetchProfile();
      setDirty((prev) => {
        const next = new Set(prev);
        next.delete("profile");
        return next;
      });
      toast({ title: "Perfil restablecido" });
    } catch (error) {
      toast({
        title: "Error al restablecer",
        description: error instanceof Error ? error.message : "",
        variant: "destructive",
      });
    }
  };

  const downloadCsvTemplate = async () => {
    if (!companyId) return;
    try {
      const response = await fetch(`/api/orders/csv-template?locale=es`, {
        headers: { "x-company-id": companyId },
      });
      if (!response.ok) throw new Error("Error al descargar plantilla");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ordenes_template.csv";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: "No se pudo descargar la plantilla",
        description: error instanceof Error ? error.message : "",
        variant: "destructive",
      });
    }
  };

  const state: ConfiguracionState = {
    profile,
    templates,
    tracking,
    isLoading,
    isSaving,
    isDefault,
    dirty,
  };
  const actions: ConfiguracionActions = {
    updateProfile,
    updateTracking,
    applyTemplate,
    toggleDimension,
    saveAll,
    resetProfile,
    downloadCsvTemplate,
  };
  const meta: ConfiguracionMeta = {
    companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  };

  return (
    <ConfiguracionContext value={{ state, actions, meta }}>
      {children}
    </ConfiguracionContext>
  );
}

export function useConfiguracion(): ConfiguracionContextValue {
  const context = use(ConfiguracionContext);
  if (context === undefined) {
    throw new Error(
      "useConfiguracion must be used within a ConfiguracionProvider",
    );
  }
  return context;
}
