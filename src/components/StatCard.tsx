import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared admin stat / metric card.
 * Visual-only — callers pass the same value/label data they already render.
 *
 * The `.stat-card` class (scoped to `.admin-shell` in index.css) provides the
 * white container, 0.5px brand border, 10px radius, 14px padding, and a 3px
 * top accent bar driven by `currentColor` (set here to the accent color).
 */

export type StatAccent = "cyan" | "blue" | "purple" | "amber" | "red";

export const STAT_ACCENTS: Record<
  StatAccent,
  { bar: string; tint: string }
> = {
  cyan: { bar: "#0ABEDF", tint: "#E0F7FC" }, // applicants, jobs, recruitment
  blue: { bar: "#185FA5", tint: "#E6F1FB" }, // pipeline, in-progress
  purple: { bar: "#534AB7", tint: "#EEEDFE" }, // people, admin, contractors
  amber: { bar: "#B45309", tint: "#FAEEDA" }, // financial, revenue, PL
  red: { bar: "#E24B4A", tint: "#FCEBEB" }, // warnings, errors, flags
};

interface StatCardProps {
  accent: StatAccent;
  icon: LucideIcon;
  label: React.ReactNode;
  value: React.ReactNode;
  sublabel?: React.ReactNode;
  sublabelIcon?: LucideIcon;
  className?: string;
  style?: React.CSSProperties;
}

export function StatCard({
  accent,
  icon: Icon,
  label,
  value,
  sublabel,
  sublabelIcon: SubIcon,
  className,
  style,
}: StatCardProps) {
  const { bar, tint } = STAT_ACCENTS[accent];
  return (
    <div
      className={cn("stat-card", className)}
      style={{ color: bar, ...style }}
    >
      <div
        className="flex items-center justify-center mb-2.5"
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: tint,
        }}
        aria-hidden="true"
      >
        <Icon style={{ width: 16, height: 16, color: bar }} strokeWidth={2} />
      </div>
      <p className="text-[10px] uppercase tracking-[0.04em] font-medium text-muted-foreground mb-1">
        {label}
      </p>
      <p className="text-[22px] font-medium leading-none text-foreground">
        {value}
      </p>
      {sublabel != null && (
        <div
          className="flex items-center mt-1"
          style={{ gap: 3, color: bar, fontSize: 11, lineHeight: 1.2 }}
        >
          {SubIcon && (
            <SubIcon style={{ width: 11, height: 11 }} strokeWidth={2} />
          )}
          <span>{sublabel}</span>
        </div>
      )}
    </div>
  );
}

export default StatCard;
