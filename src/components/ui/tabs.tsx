"use client";

import { createContext, use } from "react";
import { cn } from "@/lib/utils";

const TabsContext = createContext<{
  value: string;
  onValueChange: (value: string) => void;
}>({
  value: "",
  onValueChange: () => {},
});

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  onValueChange: (value: string) => void;
  ref?: React.Ref<HTMLDivElement>;
}

function Tabs({ className, value, onValueChange, ref, ...props }: TabsProps) {
  return (
    <TabsContext value={{ value, onValueChange }}>
      <div ref={ref} className={cn("w-full", className)} {...props} />
    </TabsContext>
  );
}

interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>;
}

function TabsList({ className, ref, ...props }: TabsListProps) {
  return (
    <div
      ref={ref}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

interface TabsTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  ref?: React.Ref<HTMLButtonElement>;
}

function TabsTrigger({ className, value, ref, ...props }: TabsTriggerProps) {
  const context = use(TabsContext);

  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        context.value === value
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:bg-background/50",
        className,
      )}
      onClick={() => context.onValueChange(value)}
      {...props}
    />
  );
}

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  ref?: React.Ref<HTMLDivElement>;
}

function TabsContent({ className, value, ref, ...props }: TabsContentProps) {
  const context = use(TabsContext);

  if (context.value !== value) return null;

  return (
    <div
      ref={ref}
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
