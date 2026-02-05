"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Route } from "lucide-react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type CompanyFormData,
  CompanyFormStep,
  StepIndicator,
  SuccessStep,
  WelcomeStep,
} from "@/components/onboarding/onboarding-steps";
import { useAuth } from "@/hooks/use-auth";

type Step = "welcome" | "company" | "success";

interface SetupResult {
  company: { commercialName: string };
  roles: Array<{ id: string; code: string; name: string }>;
  totalPermissions: number;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [step, setStep] = useState<Step>("welcome");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SetupResult | null>(null);
  const [checkingCompanies, setCheckingCompanies] = useState(true);

  // Check if companies already exist
  const checkCompanies = useCallback(async () => {
    try {
      const res = await fetch("/api/companies?limit=1", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.meta?.total > 0) {
          router.replace("/dashboard");
          return;
        }
      }
    } catch {
      // If check fails, allow onboarding to proceed
    } finally {
      setCheckingCompanies(false);
    }
  }, [router]);

  useEffect(() => {
    if (authLoading) return;

    // Not authenticated
    if (!user) {
      router.replace("/login");
      return;
    }

    // Not admin
    if (user.role !== "ADMIN_SISTEMA") {
      router.replace("/dashboard");
      return;
    }

    // Check if companies already exist
    checkCompanies();
  }, [user, authLoading, router, checkCompanies]);

  const handleCompanySubmit = async (data: CompanyFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Error al crear la empresa");
        return;
      }

      setResult(json);
      setStep("success");
    } catch {
      setError("Error de conexion. Intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinish = () => {
    router.push("/dashboard");
    router.refresh();
  };

  // Loading states
  if (authLoading || checkingCompanies) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Guard: don't render if not admin
  if (!user || user.role !== "ADMIN_SISTEMA") {
    return null;
  }

  const stepIndex = step === "welcome" ? 0 : step === "company" ? 1 : 2;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      {/* Background pattern - same as login */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-50 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)]" />

      <Card className="relative w-full max-w-2xl border-border bg-card/95 shadow-2xl backdrop-blur-sm">
        <CardHeader className="space-y-4 text-center pb-2">
          {/* Logo */}
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary shadow-lg">
            <Route className="h-8 w-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">
            BetterRoute
          </CardTitle>

          {/* Step Indicator */}
          <StepIndicator currentStep={stepIndex} />
        </CardHeader>

        <CardContent className="pt-4">
          {step === "welcome" && (
            <WelcomeStep onNext={() => setStep("company")} />
          )}
          {step === "company" && (
            <CompanyFormStep
              onSubmit={handleCompanySubmit}
              isLoading={isSubmitting}
              error={error}
            />
          )}
          {step === "success" && result && (
            <SuccessStep
              companyName={result.company.commercialName}
              rolesCount={result.roles.length}
              permissionsCount={result.totalPermissions}
              onFinish={handleFinish}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
