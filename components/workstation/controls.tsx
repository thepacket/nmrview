"use client";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useId, useRef, useEffect } from "react";
export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (s: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Range({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  unit = "",
  digits = 0,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  unit?: string;
  digits?: number;
}) {
  const id = useId();
  const slider = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    slider.current
      ?.querySelectorAll("[role=slider]")
      .forEach((thumb) => thumb.setAttribute("aria-labelledby", id));
  }, [id]);
  return (
    <div className="control">
      <label id={id}>
        {label}
        <span className="mono">
          {Number.isFinite(value) ? value.toFixed(digits) : "—"}
          {unit}
        </span>
      </label>
      <Slider
        ref={slider}
        aria-labelledby={id}
        value={[
          Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min,
        ]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  );
}
export function downloadBlob(
  data: Blob | string,
  name: string,
  type = "application/json",
) {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
