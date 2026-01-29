"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { usePermissions } from "@/hooks/use-permissions";

// Types
export interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
  children?: NavItem[];
  /** Permission required to see this item (format: "entity:action") */
  requiredPermission?: string;
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
  checkPermission: (permission: string) => boolean
): NavSection[] {
  return sections
    .map((section) => {
      const filteredItems = section.items
        .filter((item) => {
          // If no permission required, show the item
          if (!item.requiredPermission) return true;
          // Check if user has the required permission
          const [entity, action] = item.requiredPermission.split(":");
          return checkPermission(`${entity}:${action}`);
        })
        .map((item) => {
          // Also filter children if they exist
          if (item.children) {
            const filteredChildren = item.children.filter((child) => {
              if (!child.requiredPermission) return true;
              const [entity, action] = child.requiredPermission.split(":");
              return checkPermission(`${entity}:${action}`);
            });
            return { ...item, children: filteredChildren };
          }
          return item;
        });

      return { ...section, items: filteredItems };
    })
    // Remove empty sections
    .filter((section) => section.items.length > 0);
}

export function SidebarProvider({
  children,
  navSections,
  defaultCollapsed = false,
}: SidebarProviderProps) {
  const pathname = usePathname();
  const { hasPermission, isLoading: isLoadingPermissions, permissions } = usePermissions();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Check permission including wildcard for admins
  const checkPermission = useCallback(
    (permission: string): boolean => {
      if (permissions.includes("*")) return true;
      const [entity, action] = permission.split(":");
      return hasPermission(entity, action);
    },
    [hasPermission, permissions]
  );

  // Filter navigation sections based on permissions
  const filteredNavSections = useMemo(() => {
    if (isLoadingPermissions) return [];
    return filterNavItemsByPermissions(navSections, checkPermission);
  }, [navSections, checkPermission, isLoadingPermissions]);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const toggleExpanded = useCallback((href: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(href)) {
        next.delete(href);
      } else {
        next.add(href);
      }
      return next;
    });
  }, []);

  const isActive = useCallback(
    (href: string, exact?: boolean) => {
      if (href === "/dashboard") {
        return pathname === "/dashboard" || pathname === "/";
      }
      if (exact) {
        return pathname === href;
      }
      return pathname.startsWith(href);
    },
    [pathname]
  );

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
