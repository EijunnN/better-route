"use client";

import {
  Award,
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  Clock,
  LogOut,
  Map as MapIcon,
  MapPin,
  Package,
  Route,
  Truck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
}

const navItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: BarChart3 },
  { title: "Pedidos", href: "/orders", icon: Package },
  { title: "Optimización", href: "/optimization", icon: Route },
  { title: "Monitoreo", href: "/monitoring", icon: MapIcon },
  { title: "Usuarios", href: "/users", icon: Users },
  { title: "Vehículos", href: "/vehicles", icon: Truck },
  { title: "Flotas", href: "/fleets", icon: Building2 },
  { title: "Zonas", href: "/zones", icon: MapPin },
  { title: "Empresas", href: "/companies", icon: Building2 },
];

const configItems: NavItem[] = [
  { title: "Ventanas de Tiempo", href: "/time-window-presets", icon: Clock },
  { title: "Habilidades Vehículos", href: "/vehicle-skills", icon: Award },
  { title: "Habilidades Usuarios", href: "/user-skills", icon: Award },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard" || pathname === "/";
    }
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Route className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sidebar-foreground">
              Planeamiento
            </span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {!collapsed && (
            <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
              Principal
            </p>
          )}
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-2",
              )}
              title={collapsed ? item.title : undefined}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.title}</span>}
              {!collapsed && item.badge && (
                <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
        </div>

        <div className="space-y-1 pt-4">
          {!collapsed && (
            <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
              Configuración
            </p>
          )}
          {configItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-2",
              )}
              title={collapsed ? item.title : undefined}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.title}</span>}
            </Link>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start gap-3 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed && "justify-center px-2",
          )}
          onClick={() => {
            // Logout logic
            window.location.href = "/login";
          }}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Cerrar Sesión</span>}
        </Button>
      </div>
    </aside>
  );
}
