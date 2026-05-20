"use client";

import { createContext, type ReactNode, use, useEffect, useState } from "react";

interface LayoutContextType {
  hideHeader: boolean;
  setHideHeader: (hide: boolean) => void;
  fullWidth: boolean;
  setFullWidth: (full: boolean) => void;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [hideHeader, setHideHeader] = useState(false);
  const [fullWidth, setFullWidth] = useState(false);

  return (
    <LayoutContext
      value={{ hideHeader, setHideHeader, fullWidth, setFullWidth }}
    >
      {children}
    </LayoutContext>
  );
}

export function useLayoutContext() {
  const context = use(LayoutContext);
  if (context === undefined) {
    throw new Error("useLayoutContext must be used within a LayoutProvider");
  }
  return context;
}

export function useFullScreenLayout() {
  const { setHideHeader, setFullWidth } = useLayoutContext();

  useEffect(() => {
    setHideHeader(true);
    setFullWidth(true);

    return () => {
      setHideHeader(false);
      setFullWidth(false);
    };
  }, [setHideHeader, setFullWidth]);
}
