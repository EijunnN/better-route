"use client";

import { Card, CardContent } from "@/components/ui/card";
import { User } from "lucide-react";

interface TrackingDriverInfoProps {
  name: string;
  photo?: string | null;
}

export function TrackingDriverInfo({ name, photo }: TrackingDriverInfoProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3 px-4">
        {photo ? (
          <img
            src={photo}
            alt={name}
            className="h-10 w-10 rounded-full object-cover border"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div>
          <p className="text-xs text-muted-foreground">Tu repartidor</p>
          <p className="text-sm font-medium">{name}</p>
        </div>
      </CardContent>
    </Card>
  );
}
