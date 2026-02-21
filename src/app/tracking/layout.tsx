import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Seguimiento de entrega - BetterRoute",
  description: "Sigue el estado de tu entrega en tiempo real",
};

export default function TrackingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {children}
    </div>
  );
}
