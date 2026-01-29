"use client";

import {
  Award,
  BarChart3,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
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
import { cn } from "@/lib/utils";
import { useTheme } from "./theme-context";
import {
  SidebarProvider,
  useSidebar,
  type NavItem,
  type NavSection,
} from "./sidebar-context";

// Default navigation sections with permission requirements
const defaultNavSections: NavSection[] = [
  {
    title: "Operaciones",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: BarChart3 },
      { title: "Pedidos", href: "/orders", icon: Package, requiredPermission: "orders:VIEW" },
      {
        title: "Planificación",
        href: "/planificacion",
        icon: Route,
        requiredPermission: "planificacion:VIEW",
        children: [
          { title: "Nueva Planificación", href: "/planificacion", icon: PlusCircle, requiredPermission: "planificacion:VIEW" },
          { title: "Historial", href: "/planificacion/historial", icon: History, requiredPermission: "planificacion:VIEW" },
        ],
      },
      { title: "Monitoreo", href: "/monitoring", icon: MapIcon, requiredPermission: "monitoring:VIEW" },
    ],
  },
  {
    title: "Recursos",
    items: [
      { title: "Vehículos", href: "/vehicles", icon: Truck, requiredPermission: "vehicles:VIEW" },
      { title: "Flotas", href: "/fleets", icon: Warehouse, requiredPermission: "fleets:VIEW" },
      { title: "Zonas", href: "/zones", icon: MapPin, requiredPermission: "zones:VIEW" },
    ],
  },
  {
    title: "Administración",
    items: [
      { title: "Usuarios", href: "/users", icon: Users, requiredPermission: "users:VIEW" },
      { title: "Roles", href: "/roles", icon: Shield, requiredPermission: "roles:VIEW" },
      { title: "Empresas", href: "/companies", icon: Building2, requiredPermission: "companies:VIEW" },
    ],
  },
  {
    title: "Configuración",
    items: [
      { title: "Perfil Empresa", href: "/configuracion", icon: Settings, requiredPermission: "optimization_presets:VIEW" },
      { title: "Presets Optimización", href: "/optimization-presets", icon: Settings2, requiredPermission: "optimization_presets:VIEW" },
      { title: "Ventanas de Tiempo", href: "/time-window-presets", icon: Clock, requiredPermission: "time_window_presets:VIEW" },
      { title: "Habilidades Vehículos", href: "/vehicle-skills", icon: Award, requiredPermission: "vehicle_skills:VIEW" },
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
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
        <Route className="h-5 w-5 text-primary-foreground" />
      </div>
      <span className="font-semibold text-sidebar-foreground">BetterRoute</span>
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
      className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent"
      aria-label={state.collapsed ? "Expandir menú" : "Colapsar menú"}
    >
      {state.collapsed ? (
        <ChevronRight className="h-4 w-4" />
      ) : (
        <ChevronLeft className="h-4 w-4" />
      )}
    </Button>
  );
}

function SidebarHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
      {children}
    </div>
  );
}

function SidebarNavigation({ children }: { children?: React.ReactNode }) {
  const { state, meta } = useSidebar();

  // Show skeleton while permissions are loading
  if (meta.isLoadingPermissions) {
    return (
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2 pt-4">
            {!state.collapsed && (
              <div className="h-3 w-20 bg-sidebar-accent/50 rounded mx-3 animate-pulse" />
            )}
            {[1, 2].map((j) => (
              <div
                key={j}
                className={cn(
                  "h-9 bg-sidebar-accent/30 rounded-lg mx-1 animate-pulse",
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
    <nav className="flex-1 space-y-1 overflow-y-auto p-2">
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
    <div className={cn("space-y-1", !isFirst && "pt-4")}>
      {!state.collapsed && (
        <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
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
      <div className="space-y-1">
        <button
          onClick={() => actions.toggleExpanded(item.href)}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isItemActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            state.collapsed && "justify-center px-2"
          )}
          title={state.collapsed ? item.title : undefined}
        >
          <item.icon className="h-5 w-5 shrink-0" />
          {!state.collapsed && (
            <>
              <span className="flex-1 text-left">{item.title}</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform",
                  isExpanded && "rotate-180"
                )}
              />
            </>
          )}
        </button>
        {!state.collapsed && isExpanded && (
          <div className="ml-4 space-y-1 border-l border-sidebar-border pl-3">
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
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        isItemActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        state.collapsed && "justify-center px-2"
      )}
      title={state.collapsed ? item.title : undefined}
    >
      <item.icon className={cn("shrink-0", isChild ? "h-4 w-4" : "h-5 w-5")} />
      {!state.collapsed && <span>{item.title}</span>}
      {!state.collapsed && item.badge && (
        <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

function SidebarFooter({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-sidebar-border p-2 space-y-1">{children}</div>;
}

function SidebarThemeToggle() {
  const { state } = useSidebar();
  const { isDark, toggleTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      className={cn(
        "w-full justify-start gap-3 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        state.collapsed && "justify-center px-2"
      )}
      onClick={toggleTheme}
      title={state.collapsed ? (isDark ? "Modo claro" : "Modo oscuro") : undefined}
    >
      {isDark ? (
        <Sun className="h-5 w-5 shrink-0" />
      ) : (
        <Moon className="h-5 w-5 shrink-0" />
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
      className={cn(
        "w-full justify-start gap-3 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        state.collapsed && "justify-center px-2"
      )}
      onClick={() => {
        window.location.href = "/login";
      }}
    >
      <LogOut className="h-5 w-5 shrink-0" />
      {!state.collapsed && <span>Cerrar Sesión</span>}
    </Button>
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
Sidebar.ThemeToggle = SidebarThemeToggle;
Sidebar.LogoutButton = SidebarLogoutButton;

// Hook export for custom implementations
export { useSidebar } from "./sidebar-context";
export type { NavItem, NavSection } from "./sidebar-context";
