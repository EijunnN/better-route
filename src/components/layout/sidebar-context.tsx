"use client";

import {
  createContext,
  use,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { usePermissions } from "@/hooks/use-permissions";
import type { Permission } from "@/lib/auth/permissions";

// Types
export interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
  children?: NavItem[];
  /**
   * Permission required to see this item. Typed — TS rejects typos like
   * `"order:edit"` (should be `"order:update"`).
   */
  requiredPermission?: Permission;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

// State
export interface SidebarState {
  collapsed: boolean;
  expandedItems: Set<string>;
  pathname: string;
}

// Actions
export interface SidebarActions {
  toggleCollapse: () => void;
  setCollapsed: (collapsed: boolean) => void;
  toggleExpanded: (href: string) => void;
  isActive: (href: string, exact?: boolean) => boolean;
}

// Meta
export interface SidebarMeta {
  /** Filtered navigation sections based on user permissions */
  navSections: NavSection[];
  /** Original unfiltered sections */
  allNavSections: NavSection[];
  /** Whether permissions are still loading */
  isLoadingPermissions: boolean;
}

interface SidebarContextValue {
  state: SidebarState;
  actions: SidebarActions;
  meta: SidebarMeta;
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

export interface SidebarProviderProps {
  children: ReactNode;
  navSections: NavSection[];
  defaultCollapsed?: boolean;
}

/**
 * Filters navigation items based on user permissions
 */
function filterNavItemsByPermissions(
  sections: NavSection[],
  checkPermission: (permission: Permission) => boolean,
): NavSection[] {
  return sections
    .map((section) => {
      const filteredItems = section.items
        .filter((item) => {
          if (!item.requiredPermission) return true;
          return checkPermission(item.requiredPermission);
        })
        .map((item) => {
          if (item.children) {
            const filteredChildren = item.children.filter((child) => {
              if (!child.requiredPermission) return true;
              return checkPermission(child.requiredPermission);
            });
            return { ...item, children: filteredChildren };
          }
          return item;
        });

      return { ...section, items: filteredItems };
    })
    .filter((section) => section.items.length > 0);
}

export function SidebarProvider({
  children,
  navSections,
  defaultCollapsed = false,
}: SidebarProviderProps) {
  const pathname = usePathname();
  const { hasPermission, isLoading: isLoadingPermissions } = usePermissions();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Wildcard handling lives inside hasPermission already.
  const checkPermission = (perm: Permission): boolean => hasPermission(perm);

  // Filter navigation sections based on permissions
  const filteredNavSections = isLoadingPermissions
    ? []
    : filterNavItemsByPermissions(navSections, checkPermission);

  const toggleCollapse = () => {
    setCollapsed((prev) => !prev);
  };

  const toggleExpanded = (href: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(href)) {
        next.delete(href);
      } else {
        next.add(href);
      }
      return next;
    });
  };

  const isActive = (href: string, exact?: boolean) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard" || pathname === "/";
    }
    if (exact) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  // Auto-expand items that have active children
  useEffect(() => {
    filteredNavSections.forEach((section) => {
      section.items.forEach((item) => {
        if (item.children && pathname.startsWith(item.href)) {
          setExpandedItems((prev) => new Set([...prev, item.href]));
        }
      });
    });
  }, [pathname, filteredNavSections]);

  const state: SidebarState = {
    collapsed,
    expandedItems,
    pathname,
  };

  const actions: SidebarActions = {
    toggleCollapse,
    setCollapsed,
    toggleExpanded,
    isActive,
  };

  const meta: SidebarMeta = {
    navSections: filteredNavSections,
    allNavSections: navSections,
    isLoadingPermissions,
  };

  return (
    <SidebarContext value={{ state, actions, meta }}>
      {children}
    </SidebarContext>
  );
}

export function useSidebar(): SidebarContextValue {
  const context = use(SidebarContext);
  if (context === undefined) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
