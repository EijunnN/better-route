"use client";

import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Company {
  id: string;
  commercialName: string;
}

interface CompanySelectorProps {
  companies: Company[];
  selectedCompanyId: string | null;
  authCompanyId: string | null;
  onCompanyChange: (companyId: string | null) => void;
  isSystemAdmin: boolean;
}

/**
 * Company selector component for system admins to switch between companies.
 * Only renders if user is a system admin and there are companies available.
 */
export function CompanySelector({
  companies,
  selectedCompanyId,
  authCompanyId,
  onCompanyChange,
  isSystemAdmin,
}: CompanySelectorProps) {
  if (!isSystemAdmin || companies.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span className="text-sm font-medium">Empresa:</span>
        </div>
        <Select
          value={selectedCompanyId || authCompanyId || ""}
          onValueChange={(value) => onCompanyChange(value || null)}
        >
          <SelectTrigger className="w-[300px]">
            <SelectValue placeholder="Seleccionar empresa" />
          </SelectTrigger>
          <SelectContent>
            {companies.map((company) => (
              <SelectItem key={company.id} value={company.id}>
                {company.commercialName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedCompanyId && selectedCompanyId !== authCompanyId && (
          <Badge variant="secondary" className="text-xs">
            Viendo otra empresa
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
