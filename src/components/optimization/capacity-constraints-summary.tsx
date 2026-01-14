"use client";

import { Loader2, Package, Volume, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface PendingOrdersSummary {
  totalOrders: number;
  totalWeight: number;
  maxWeight: number;
  totalVolume: number;
  maxVolume: number;
  ordersWithWeightRequirements: number;
  ordersWithVolumeRequirements: number;
  requiredSkills: Array<{
    code: string;
    name: string;
    category: string;
    description: string | null;
  }>;
  orders: Array<{
    id: string;
    trackingId: string;
    address: string;
    weightRequired: number | null;
    volumeRequired: number | null;
    requiredSkills: string | null;
  }>;
}

interface CapacityConstraintsSummaryProps {
  companyId: string;
}

export function CapacityConstraintsSummary({
  companyId,
}: CapacityConstraintsSummaryProps) {
  const [summary, setSummary] = useState<PendingOrdersSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSummary = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/orders/pending-summary", {
          headers: {
            "x-company-id": companyId,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch pending orders summary");
        }

        const data = await response.json();
        setSummary(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSummary();
  }, [companyId]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pending Orders Summary</CardTitle>
          <CardDescription>
            Capacity and skill requirements for pending orders
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pending Orders Summary</CardTitle>
          <CardDescription>
            Capacity and skill requirements for pending orders
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return null;
  }

  const skillCategoryColors: Record<string, string> = {
    EQUIPMENT: "bg-blue-100 text-blue-800 hover:bg-blue-200",
    TEMPERATURE: "bg-cyan-100 text-cyan-800 hover:bg-cyan-200",
    CERTIFICATIONS: "bg-purple-100 text-purple-800 hover:bg-purple-200",
    SPECIAL: "bg-orange-100 text-orange-800 hover:bg-orange-200",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending Orders Summary</CardTitle>
        <CardDescription>
          Capacity and skill requirements for {summary.totalOrders} pending
          orders
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overview Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <Package className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Total Orders</p>
              <p className="text-lg font-semibold">{summary.totalOrders}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <Package className="w-5 h-5 text-blue-500" />
            <div>
              <p className="text-sm text-muted-foreground">Total Weight</p>
              <p className="text-lg font-semibold">
                {summary.totalWeight.toLocaleString()} kg
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <Volume className="w-5 h-5 text-green-500" />
            <div>
              <p className="text-sm text-muted-foreground">Total Volume</p>
              <p className="text-lg font-semibold">
                {summary.totalVolume.toLocaleString()} m³
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <Wrench className="w-5 h-5 text-orange-500" />
            <div>
              <p className="text-sm text-muted-foreground">Required Skills</p>
              <p className="text-lg font-semibold">
                {summary.requiredSkills.length}
              </p>
            </div>
          </div>
        </div>

        {/* Weight Requirements */}
        {summary.ordersWithWeightRequirements > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Weight Requirements</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">
                  Max single order:{" "}
                </span>
                <span className="font-medium">
                  {summary.maxWeight.toLocaleString()} kg
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">
                  Orders with weight:{" "}
                </span>
                <span className="font-medium">
                  {summary.ordersWithWeightRequirements} / {summary.totalOrders}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Volume Requirements */}
        {summary.ordersWithVolumeRequirements > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Volume Requirements</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">
                  Max single order:{" "}
                </span>
                <span className="font-medium">
                  {summary.maxVolume.toLocaleString()} m³
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">
                  Orders with volume:{" "}
                </span>
                <span className="font-medium">
                  {summary.ordersWithVolumeRequirements} / {summary.totalOrders}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Required Skills */}
        {summary.requiredSkills.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Required Skills</h4>
            <div className="flex flex-wrap gap-2">
              {summary.requiredSkills.map((skill) => (
                <Badge
                  key={skill.code}
                  variant="secondary"
                  className={
                    skillCategoryColors[skill.category] ||
                    "bg-gray-100 text-gray-800"
                  }
                >
                  {skill.name}
                  <span className="ml-1 text-xs opacity-70">
                    ({skill.code})
                  </span>
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Vehicles and drivers must have these skills when capacity
              constraints are enabled
            </p>
          </div>
        )}

        {/* No Requirements Notice */}
        {summary.ordersWithWeightRequirements === 0 &&
          summary.ordersWithVolumeRequirements === 0 &&
          summary.requiredSkills.length === 0 && (
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground text-center">
                No capacity or skill requirements found in pending orders. You
                can disable capacity constraints for faster optimization.
              </p>
            </div>
          )}
      </CardContent>
    </Card>
  );
}
