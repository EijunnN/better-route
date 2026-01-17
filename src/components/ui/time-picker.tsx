"use client";

import { Clock } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface TimePickerProps {
  value?: string | null;
  onChange?: (time: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

const hours = Array.from({ length: 24 }, (_, i) =>
  i.toString().padStart(2, "0")
);
const minutes = Array.from({ length: 12 }, (_, i) =>
  (i * 5).toString().padStart(2, "0")
);

export function TimePicker({
  value,
  onChange,
  placeholder = "Seleccionar hora",
  disabled = false,
  className,
  id,
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false);

  const [selectedHour, selectedMinute] = React.useMemo(() => {
    if (!value) return ["", ""];
    const [h, m] = value.split(":");
    return [h || "", m || ""];
  }, [value]);

  const handleHourChange = (hour: string) => {
    const newTime = `${hour}:${selectedMinute || "00"}`;
    onChange?.(newTime);
  };

  const handleMinuteChange = (minute: string) => {
    const newTime = `${selectedHour || "00"}:${minute}`;
    onChange?.(newTime);
  };

  const handleClear = () => {
    onChange?.(null);
    setOpen(false);
  };

  const formatTime = (time: string) => {
    const [h, m] = time.split(":");
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <Clock className="mr-2 h-4 w-4" />
          {value ? formatTime(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="flex gap-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Hora
            </label>
            <Select value={selectedHour} onValueChange={handleHourChange}>
              <SelectTrigger className="w-[70px]">
                <SelectValue placeholder="--" />
              </SelectTrigger>
              <SelectContent>
                {hours.map((hour) => (
                  <SelectItem key={hour} value={hour}>
                    {hour}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Min
            </label>
            <Select value={selectedMinute} onValueChange={handleMinuteChange}>
              <SelectTrigger className="w-[70px]">
                <SelectValue placeholder="--" />
              </SelectTrigger>
              <SelectContent>
                {minutes.map((minute) => (
                  <SelectItem key={minute} value={minute}>
                    {minute}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4 flex justify-between">
          <Button variant="ghost" size="sm" onClick={handleClear}>
            Limpiar
          </Button>
          <Button size="sm" onClick={() => setOpen(false)}>
            Aceptar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
