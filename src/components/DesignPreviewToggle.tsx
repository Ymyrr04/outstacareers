import { useEffect, useState } from "react";
import {
  isDesignPreviewEnabled,
  isDesignPreviewToggleVisible,
  setDesignPreviewEnabled,
} from "@/lib/designPreview";

/**
 * Small floating switch to turn experimental CSS on/off.
 * Rendered only in dev, or when ?design is present / preview already enabled.
 */
export default function DesignPreviewToggle() {
  const [visible, setVisible] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setVisible(isDesignPreviewToggleVisible());
    setEnabled(isDesignPreviewEnabled());
  }, []);

  if (!visible) return null;

  const toggle = () => {
    const next = !enabled;
    setDesignPreviewEnabled(next);
    setEnabled(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      title="Toggle experimental design styles (preview only)"
      className="fixed bottom-3 left-3 z-[9999] flex items-center gap-2 rounded-full border border-border bg-background/90 px-3 py-1.5 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          enabled ? "bg-primary" : "bg-muted-foreground/40"
        }`}
      />
      Design preview {enabled ? "on" : "off"}
    </button>
  );
}
