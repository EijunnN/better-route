"use client";

import { ProtectedPage } from "@/components/auth/protected-page";
import {
  CompaniesFormView,
  CompaniesListView,
  CompaniesProvider,
  useCompanies,
} from "@/components/companies";

function CompaniesPageContent() {
  const { state } = useCompanies();

  if (state.showForm || state.editingCompany) {
    return <CompaniesFormView />;
  }

  return <CompaniesListView />;
}

export default function CompaniesPage() {
  return (
    <ProtectedPage requiredPermission="company:create">
      <CompaniesProvider>
        <CompaniesPageContent />
      </CompaniesProvider>
    </ProtectedPage>
  );
}
