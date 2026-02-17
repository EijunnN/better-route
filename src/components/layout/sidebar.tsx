"use client";

import {
  Award,
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  GitBranch,
  History,
  ListChecks,
  LogOut,
  Map as MapIcon,
  MapPin,
  Moon,
  Package,
  PlusCircle,
  Route,
  Settings,
  Settings2,
  Shield,
  Sun,
  Truck,
  Users,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useGlobalCompany } from "./company-context";
import { useTheme } from "./theme-context";
import {
  SidebarProvider,
  useSidebar,
  type NavItem,
  type NavSection,
} from "./sidebar-context";

// Default navigation sections with permission requirements
// Permissions use format "entity:action" matching authorization.ts EntityType and Action enums
const defaultNavSections: NavSection[] = [
  {
    title: "Operaciones",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: BarChart3, requiredPermission: "metrics:read" },
      { title: "Pedidos", href: "/orders", icon: Package, requiredPermission: "order:read" },
      {
        title: "Planificación",
        href: "/planificacion",
        icon: Route,
        requiredPermission: "plan:read",
        children: [
          { title: "Nueva Planificación", href: "/planificacion", icon: PlusCircle, requiredPermission: "plan:read" },
          { title: "Historial", href: "/planificacion/historial", icon: History, requiredPermission: "plan:read" },
        ],
      },
      { title: "Monitoreo", href: "/monitoring", icon: MapIcon, requiredPermission: "vehicle:read" },
    ],
  },
  {
    title: "Recursos",
    items: [
      { title: "Vehículos", href: "/vehicles", icon: Truck, requiredPermission: "vehicle:read" },
      { title: "Flotas", href: "/fleets", icon: Warehouse, requiredPermission: "fleet:read" },
      { title: "Zonas", href: "/zones", icon: MapPin, requiredPermission: "route:read" },
    ],
  },
  {
    title: "Administración",
    items: [
      { title: "Usuarios", href: "/users", icon: Users, requiredPermission: "user:read" },
      { title: "Roles", href: "/roles", icon: Shield, requiredPermission: "role:read" },
      { title: "Empresas", href: "/companies", icon: Building2, requiredPermission: "company:read" },
    ],
  },
  {
    title: "Configuración",
    items: [
      { title: "Perfil Empresa", href: "/configuracion", icon: Settings, requiredPermission: "optimization_preset:read" },
      { title: "Presets Optimización", href: "/optimization-presets", icon: Settings2, requiredPermission: "optimization_preset:read" },
      { title: "Ventanas de Tiempo", href: "/time-window-presets", icon: Clock, requiredPermission: "time_window_preset:read" },
      { title: "Habilidades Vehículos", href: "/vehicle-skills", icon: Award, requiredPermission: "vehicle_skill:read" },
      { title: "Estados de entrega", href: "/workflow", icon: GitBranch, requiredPermission: "order:read" },
      { title: "Campos personalizados", href: "/custom-fields", icon: ListChecks, requiredPermission: "order:read" },
    ],
  },
];

// Compound Components

function SidebarFrame({ children }: { children: React.ReactNode }) {
  const { state } = useSidebar();

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-300",
        state.collapsed ? "w-16" : "w-64"
      )}
    >
      {children}
    </aside>
  );
}

function SidebarLogo() {
  const { state } = useSidebar();

  if (state.collapsed) return null;

  return (
    <Link href="/dashboard" className="flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
        <Route className="h-4 w-4 text-primary-foreground" />
      </div>
      <span className="text-sm font-semibold text-sidebar-foreground">BetterRoute</span>
    </Link>
  );
}

function SidebarCollapseButton() {
  const { state, actions } = useSidebar();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={actions.toggleCollapse}
      className="h-7 w-7 text-sidebar-foreground hover:bg-sidebar-accent"
      aria-label={state.collapsed ? "Expandir menu" : "Colapsar menu"}
    >
      {state.collapsed ? (
        <ChevronRight className="h-3.5 w-3.5" />
      ) : (
        <ChevronLeft className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}

function SidebarHeader({ children }: { children: React.ReactNode }) {
  const { state } = useSidebar();

  return (
    <div className={cn(
      "flex h-12 items-center border-b border-sidebar-border px-3",
      state.collapsed ? "justify-center" : "justify-between"
    )}>
      {children}
    </div>
  );
}

function SidebarNavigation({ children }: { children?: React.ReactNode }) {
  const { state, meta } = useSidebar();

  // Show skeleton while permissions are loading
  if (meta.isLoadingPermissions) {
    return (
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-1.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-1 pt-3">
            {!state.collapsed && (
              <div className="h-3 w-20 bg-sidebar-accent/50 rounded mx-2 animate-pulse" />
            )}
            {[1, 2].map((j) => (
              <div
                key={j}
                className={cn(
                  "h-8 bg-sidebar-accent/30 rounded-lg mx-1 animate-pulse",
                  state.collapsed ? "w-12" : "w-full"
                )}
              />
            ))}
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-1.5">
      {children ||
        meta.navSections.map((section, sectionIndex) => (
          <SidebarSection key={section.title} section={section} isFirst={sectionIndex === 0} />
        ))}
    </nav>
  );
}

function SidebarSection({
  section,
  isFirst = false,
}: {
  section: NavSection;
  isFirst?: boolean;
}) {
  const { state } = useSidebar();

  return (
    <div className={cn("space-y-0.5", !isFirst && "pt-3")}>
      {!state.collapsed && (
        <p className="px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
          {section.title}
        </p>
      )}
      {section.items.map((item) => (
        <SidebarNavItem key={item.href} item={item} />
      ))}
    </div>
  );
}

function SidebarNavItem({ item }: { item: NavItem }) {
  const { state, actions } = useSidebar();
  const hasChildren = item.children && item.children.length > 0;
  const isExpanded = state.expandedItems.has(item.href);
  const isItemActive = actions.isActive(item.href);

  if (hasChildren) {
    return (
      <div className="space-y-0.5">
        <button
          onClick={() => actions.toggleExpanded(item.href)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
            isItemActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            state.collapsed && "justify-center px-2"
          )}
          title={state.collapsed ? item.title : undefined}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          {!state.collapsed && (
            <>
              <span className="flex-1 text-left">{item.title}</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-transform",
                  isExpanded && "rotate-180"
                )}
              />
            </>
          )}
        </button>
        {!state.collapsed && isExpanded && (
          <div className="ml-3.5 space-y-0.5 border-l border-sidebar-border pl-2.5">
            {item.children!.map((child) => (
              <SidebarNavLink key={child.href} item={child} isChild />
            ))}
          </div>
        )}
      </div>
    );
  }

  return <SidebarNavLink item={item} />;
}

function SidebarNavLink({
  item,
  isChild = false,
}: {
  item: NavItem;
  isChild?: boolean;
}) {
  const { state, actions } = useSidebar();
  const isItemActive = actions.isActive(item.href, isChild);

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
        isItemActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        state.collapsed && "justify-center px-2"
      )}
      title={state.collapsed ? item.title : undefined}
    >
      <item.icon className={cn("shrink-0", isChild ? "h-3.5 w-3.5" : "h-4 w-4")} />
      {!state.collapsed && <span>{item.title}</span>}
      {!state.collapsed && item.badge && (
        <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[11px] text-primary-foreground">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

function SidebarFooter({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-sidebar-border px-2 py-1.5 space-y-0.5">{children}</div>;
}

function SidebarThemeToggle() {
  const { state } = useSidebar();
  const { isDark, toggleTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "w-full justify-start gap-2.5 text-[13px] text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        state.collapsed && "justify-center px-2"
      )}
      onClick={toggleTheme}
      title={state.collapsed ? (isDark ? "Modo claro" : "Modo oscuro") : undefined}
    >
      {isDark ? (
        <Sun className="h-4 w-4 shrink-0" />
      ) : (
        <Moon className="h-4 w-4 shrink-0" />
      )}
      {!state.collapsed && <span>{isDark ? "Modo Claro" : "Modo Oscuro"}</span>}
    </Button>
  );
}

function SidebarLogoutButton() {
  const { state } = useSidebar();

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "w-full justify-start gap-2.5 text-[13px] text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        state.collapsed && "justify-center px-2"
      )}
      onClick={() => {
        window.location.href = "/login";
      }}
    >
      <LogOut className="h-4 w-4 shrink-0" />
      {!state.collapsed && <span>Cerrar Sesion</span>}
    </Button>
  );
}

function SidebarCompanySwitcher() {
  const { state } = useSidebar();
  const {
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    isLoadingCompanies,
  } = useGlobalCompany();

  if (!isSystemAdmin || companies.length === 0) return null;

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);

  if (state.collapsed) {
    return (
      <div className="border-b border-sidebar-border px-2 py-2">
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="flex h-9 w-full items-center justify-center rounded-lg text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              title={selectedCompany?.commercialName || "Seleccionar empresa"}
            >
              <Building2 className="h-5 w-5 shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="right" align="start" className="w-56 p-1">
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
              Cambiar empresa
            </div>
            {companies.map((company) => (
              <button
                key={company.id}
                onClick={() => setSelectedCompanyId(company.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
                  company.id === selectedCompanyId && "bg-accent"
                )}
              >
                <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-left">{company.commercialName}</span>
                {company.id === selectedCompanyId && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                )}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <div className="border-b border-sidebar-border px-2 py-2">
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-sidebar-border bg-sidebar-accent/50">
              <Building2 className="h-3.5 w-3.5" />
            </div>
            <span className="flex-1 truncate text-left font-medium">
              {isLoadingCompanies
                ? "Cargando..."
                : selectedCompany?.commercialName || "Empresa"}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-foreground/50" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="right" align="start" className="w-64 p-1">
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            Cambiar empresa
          </div>
          {companies.map((company) => (
            <button
              key={company.id}
              onClick={() => setSelectedCompanyId(company.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
                company.id === selectedCompanyId && "bg-accent"
              )}
            >
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded border bg-muted">
                <Building2 className="h-3 w-3 text-muted-foreground" />
              </div>
              <span className="flex-1 truncate text-left">{company.commercialName}</span>
              {company.id === selectedCompanyId && (
                <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
              )}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Default Sidebar Content (for simple usage)
function SidebarContent() {
  return (
    <SidebarFrame>
      <SidebarHeader>
        <SidebarLogo />
        <SidebarCollapseButton />
      </SidebarHeader>
      <SidebarCompanySwitcher />
      <SidebarNavigation />
      <SidebarFooter>
        <SidebarThemeToggle />
        <SidebarLogoutButton />
      </SidebarFooter>
    </SidebarFrame>
  );
}

/**
 * Sidebar - Compound Component Pattern
 *
 * Can be used in two ways:
 *
 * 1. Simple usage (default layout):
 * ```tsx
 * <Sidebar />
 * ```
 *
 * 2. Compound usage (custom layout):
 * ```tsx
 * <Sidebar.Provider navSections={customSections}>
 *   <Sidebar.Frame>
 *     <Sidebar.Header>
 *       <Sidebar.Logo />
 *       <Sidebar.CollapseButton />
 *     </Sidebar.Header>
 *     <Sidebar.Navigation />
 *     <Sidebar.Footer>
 *       <Sidebar.ThemeToggle />
 *       <Sidebar.LogoutButton />
 *     </Sidebar.Footer>
 *   </Sidebar.Frame>
 * </Sidebar.Provider>
 * ```
 */
export function Sidebar() {
  return (
    <SidebarProvider navSections={defaultNavSections}>
      <SidebarContent />
    </SidebarProvider>
  );
}

// Compound component exports
Sidebar.Provider = SidebarProvider;
Sidebar.Frame = SidebarFrame;
Sidebar.Header = SidebarHeader;
Sidebar.Logo = SidebarLogo;
Sidebar.CollapseButton = SidebarCollapseButton;
Sidebar.Navigation = SidebarNavigation;
Sidebar.Section = SidebarSection;
Sidebar.NavItem = SidebarNavItem;
Sidebar.NavLink = SidebarNavLink;
Sidebar.Footer = SidebarFooter;
Sidebar.CompanySwitcher = SidebarCompanySwitcher;
Sidebar.ThemeToggle = SidebarThemeToggle;
Sidebar.LogoutButton = SidebarLogoutButton;

// Hook export for custom implementations
export { useSidebar } from "./sidebar-context";
export type { NavItem, NavSection } from "./sidebar-context";
