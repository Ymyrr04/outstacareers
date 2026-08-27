import { ReactNode } from 'react';

interface AdminHeroBannerProps {
  eyebrow: string;
  title: ReactNode;
  chips?: string[];
  right?: ReactNode;
}

/**
 * Context-aware hero banner shown at the top of admin tab content areas.
 * Purely presentational - all numbers come from the caller.
 */
export function AdminHeroBanner({ eyebrow, title, chips = [], right }: AdminHeroBannerProps) {
  return (
    <div className="admin-hero-banner">
      <div className="admin-hero-banner__main">
        <div className="admin-hero-banner__eyebrow">{eyebrow}</div>
        <div className="admin-hero-banner__title">{title}</div>
        {chips.length > 0 && (
          <div className="admin-hero-banner__chips">
            {chips.map((chip, i) => (
              <span key={`${chip}-${i}`} className="admin-hero-banner__chip">{chip}</span>
            ))}
          </div>
        )}
      </div>
      {right && <div className="admin-hero-banner__right">{right}</div>}
    </div>
  );
}

export default AdminHeroBanner;
