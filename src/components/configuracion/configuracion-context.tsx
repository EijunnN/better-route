"use client";

import { createContext, use, useCallback, useEffect, useState, type ReactNode } from "react";
import { useCompanyContext } from "@/hooks/use-company-context";

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

export interface ConfiguracionState {
  profile: CompanyProfile | null;
  templates: ProfileTemplate[];
  tracking: TrackingSettings | null;
  isLoading: boolean;
  isSaving: boolean;
  isDefault: boolean;
  hasChanges: boolean;
  trackingHasChanges: boolean;
  isSavingTracking: boolean;
}

export interface ConfiguracionActions {
  handleSave: () => Promise<void>;
  handleReset: () => Promise<void>;
  handleApplyTemplate: (templateId: string) => void;
  toggleDimension: (key: "enableWeight" | "enableVolume" | "enableOrderValue" | "enableUnits", dimension: string) => void;
  handleDownloadTemplate: () => Promise<void>;
  setProfile: (profile: CompanyProfile | null) => void;
  setHasChanges: (hasChanges: boolean) => void;
  setTracking: (tracking: TrackingSettings | null) => void;
  setTrackingHasChanges: (hasChanges: boolean) => void;
  handleSaveTracking: () => Promise<void>;
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

export function ConfiguracionProvider({ children }: { children: ReactNode }) {
  const { effectiveCompanyId: companyId, isReady, isSystemAdmin, companies, selectedCompanyId, setSelectedCompanyId, authCompanyId } =
    useCompanyContext();

  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [templates, setTemplates] = useState<ProfileTemplate[]>([]);
  const [tracking, setTracking] = useState<TrackingSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDefault, setIsDefault] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [trackingHasChanges, setTrackingHasChanges] = useState(false);
  const [isSavingTracking, setIsSavingTracking] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!companyId || !isReady) return;
    setIsLoading(true);
    try {
      const response = await fetch("/api/company-profiles", { headers: { "x-company-id": companyId } });
      const data = await response.json();

      if (data.data?.profile) {
        setProfile(data.data.profile);
        setIsDefault(false);
      } else {
        setProfile({
          enableWeight: true,
          enableVolume: true,
          enableOrderValue: false,
          enableUnits: false,
          enableOrderType: false,
          activeDimensions: ["WEIGHT", "VOLUME"],
          priorityMapping: { NEW: 50, RESCHEDULED: 80, URGENT: 100 },
        });
        setIsDefault(true);
      }

      if (data.data?.templates) {
        setTemplates(data.data.templates);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setIsLoading(false);
    }
  }, [companyId, isReady]);

  const fetchTracking = useCallback(async () => {
    if (!companyId || !isReady) return;
    try {
      const response = await fetch("/api/tracking/settings", { headers: { "x-company-id": companyId } });
      const data = await response.json();
      if (data.data) {
        setTracking(data.data);
      }
    } catch (error) {
      console.error("Error fetching tracking settings:", error);
    }
  }, [companyId, isReady]);

  useEffect(() => {
    fetchProfile();
    fetchTracking();
    setHasChanges(false);
    setTrackingHasChanges(false);
  }, [fetchProfile, fetchTracking]);

  const handleSave = useCallback(async () => {
    if (!profile || !companyId) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/company-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-company-id": companyId },
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
      if (response.ok) {
        setHasChanges(false);
        setIsDefault(false);
        fetchProfile();
      }
    } catch (error) {
      console.error("Error saving profile:", error);
    } finally {
      setIsSaving(false);
    }
  }, [profile, companyId, fetchProfile]);

  const handleReset = useCallback(async () => {
    if (!companyId || !confirm("¿Restablecer a valores predeterminados?")) return;
    try {
      await fetch("/api/company-profiles", { method: "DELETE", headers: { "x-company-id": companyId } });
      fetchProfile();
      setHasChanges(false);
    } catch (error) {
      console.error("Error resetting profile:", error);
    }
  }, [companyId, fetchProfile]);

  const handleApplyTemplate = useCallback(
    (templateId: string) => {
      const template = templates.find((t) => t.id === templateId);
      if (!template || !profile) return;

      const newDimensions: string[] = [];
      if (template.enableWeight) newDimensions.push("WEIGHT");
      if (template.enableVolume) newDimensions.push("VOLUME");
      if (template.enableOrderValue) newDimensions.push("VALUE");
      if (template.enableUnits) newDimensions.push("UNITS");

      setProfile({
        ...profile,
        enableWeight: template.enableWeight,
        enableVolume: template.enableVolume,
        enableOrderValue: template.enableOrderValue,
        enableUnits: template.enableUnits,
        enableOrderType: template.enableOrderType,
        activeDimensions: newDimensions,
      });
      setHasChanges(true);
    },
    [templates, profile]
  );

  const toggleDimension = useCallback(
    (key: "enableWeight" | "enableVolume" | "enableOrderValue" | "enableUnits", dimension: string) => {
      if (!profile) return;

      const isEnabled = profile[key];
      let newDimensions = [...profile.activeDimensions];

      if (isEnabled) {
        newDimensions = newDimensions.filter((d) => d !== dimension);
      } else {
        newDimensions.push(dimension);
      }

      setProfile({ ...profile, [key]: !isEnabled, activeDimensions: newDimensions });
      setHasChanges(true);
    },
    [profile]
  );

  const handleDownloadTemplate = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch(`/api/orders/csv-template?locale=es`, { headers: { "x-company-id": companyId } });
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
      console.error("Error downloading template:", error);
    }
  }, [companyId]);

  const handleSaveTracking = useCallback(async () => {
    if (!tracking || !companyId) return;
    setIsSavingTracking(true);
    try {
      const response = await fetch("/api/tracking/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-company-id": companyId },
        body: JSON.stringify(tracking),
      });
      if (response.ok) {
        setTrackingHasChanges(false);
        const data = await response.json();
        if (data.data) setTracking(data.data);
      }
    } catch (error) {
      console.error("Error saving tracking settings:", error);
    } finally {
      setIsSavingTracking(false);
    }
  }, [tracking, companyId]);

  const state: ConfiguracionState = { profile, templates, tracking, isLoading, isSaving, isDefault, hasChanges, trackingHasChanges, isSavingTracking };

  const actions: ConfiguracionActions = {
    handleSave,
    handleReset,
    handleApplyTemplate,
    toggleDimension,
    handleDownloadTemplate,
    setProfile,
    setHasChanges,
    setTracking,
    setTrackingHasChanges,
    handleSaveTracking,
  };

  const meta: ConfiguracionMeta = { companyId, isReady, isSystemAdmin, companies, selectedCompanyId, setSelectedCompanyId, authCompanyId };

  return <ConfiguracionContext value={{ state, actions, meta }}>{children}</ConfiguracionContext>;
}

export function useConfiguracion(): ConfiguracionContextValue {
  const context = use(ConfiguracionContext);
  if (context === undefined) {
    throw new Error("useConfiguracion must be used within a ConfiguracionProvider");
  }
  return context;
}
