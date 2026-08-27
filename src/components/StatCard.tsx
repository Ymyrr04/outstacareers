import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared admin stat / metric card.
 * Visual-only — callers pass the same value/label data they already render.
 *
 * The `.stat-card` class (scoped to `.admin-shell` in index.css) provides the
 * white container, 0.5px border, 10px radius, and 12px padding. No top accent
 * bar — color comes from the icon and the top-right badge.
 */

export type StatAccent = "cyan" | "purple" | "blue" | "amber" | "red" | "teal";

export const STAT_ACCENTS: Record<
  StatAccent,
  { icon: string; badgeBg: string; badgeColor: string }
> = {
  cyan: { icon: "#0ABEDF", badgeBg: "#E0F7FC", badgeColor: "#066F85" }, // recruitment, applicants, jobs
  purple: { icon: "#534AB7", badgeBg: "#EEEDFE", badgeColor: "#3C3489" }, // pipeline, in-progress
  blue: { icon: "#185FA5", badgeBg: "#E6F1FB", badgeColor: "#0C447C" }, // people, contractors, admins
  amber: { icon: "#B45309", badgeBg: "#FAEEDA", badgeColor: "#633806" }, // financial, revenue, PL
  red: { icon: "#E24B4A", badgeBg: "#FCEBEB", badgeColor: "#A32D2D" }, // warnings, flags, errors
  teal: { icon: "#0D9488", badgeBg: "#EAF3DE", badgeColor: "#27500A" }, // success, hired, approved
};

interface StatCardProps {
  accent: StatAccent;
  icon: LucideIcon;
  label: React.ReactNode;
  value: React.ReactNode;
  /** Small delta/context pill rendered top-right, e.g. "+89" or "8 stages". */
  badge?: React.ReactNode;
  sublabel?: React.ReactNode;
  sublabelIcon?: LucideIcon;
  footer?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function StatCard({
  accent,
  icon: Icon,
  label,
  value,
  badge,
  sublabel,
  sublabelIcon: SubIcon,
  footer,
  className,
  style,
}: StatCardProps) {
  const colors = STAT_ACCENTS[accent];
  return (
    <div className={cn("stat-card", className)} style={style}>
      <div className="flex items-center justify-between">
        <Icon
          style={{ width: 16, height: 16, color: colors.icon }}
          strokeWidth={2}
          aria-hidden="true"
        />
        {badge != null && (
          <span
            style={{
              fontSize: 10,
              lineHeight: 1.4,
              padding: "2px 6px",
              borderRadius: 8,
              background: colors.badgeBg,
              color: colors.badgeColor,
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            {badge}
          </span>
        )}
      </div>
      <p className="text-[20px] font-medium leading-none text-foreground mt-2">
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
      {sublabel != null && (
        <div
          className="flex items-center mt-1"
          style={{ gap: 3, color: colors.icon, fontSize: 11, lineHeight: 1.2 }}
        >
          {SubIcon && (
            <SubIcon style={{ width: 11, height: 11 }} strokeWidth={2} />
          )}
          <span>{sublabel}</span>
        </div>
      )}
      {footer && <div className="mt-2">{footer}</div>}
    </div>
  );
}

export default StatCard;
