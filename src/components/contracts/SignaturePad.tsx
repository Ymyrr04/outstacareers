import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface SignaturePadProps {
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  signerName: string;
}

// Captures signature as PNG data URL. Draw-only mode.
export const SignaturePad = ({ value, onChange }: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);

  const getCtx = () => {
    const c = canvasRef.current;
    if (!c) return null;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#0a0a0a";
    }
    return ctx;
  };

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx?.clearRect(0, 0, c.width, c.height);
    onChange(null);
  };

  const pointerPos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };

  const start = (e: React.PointerEvent) => {
    setDrawing(true);
    const ctx = getCtx();
    const p = pointerPos(e);
    ctx?.beginPath();
    ctx?.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing) return;
    const ctx = getCtx();
    const p = pointerPos(e);
    ctx?.lineTo(p.x, p.y);
    ctx?.stroke();
  };
  const end = () => {
    if (!drawing) return;
    setDrawing(false);
    const c = canvasRef.current;
    if (c) onChange(c.toDataURL("image/png"));
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Draw your signature in the box below</p>
      <div className="border rounded-md bg-white">
        <canvas
          ref={canvasRef}
          width={600}
          height={140}
          className="w-full touch-none cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={clear}>Clear</Button>
      </div>
    </div>
  );
};
