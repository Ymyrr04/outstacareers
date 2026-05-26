import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface SignaturePadProps {
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  signerName: string;
}

// Captures signature as PNG data URL. Two modes: draw or type.
export const SignaturePad = ({ value, onChange, signerName }: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [typed, setTyped] = useState(signerName);
  const [mode, setMode] = useState<"draw" | "type">("type");

  useEffect(() => {
    if (mode === "type") {
      renderTyped(typed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, typed]);

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
    if (mode !== "draw") return;
    setDrawing(true);
    const ctx = getCtx();
    const p = pointerPos(e);
    ctx?.beginPath();
    ctx?.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing || mode !== "draw") return;
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

  const renderTyped = (txt: string) => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#0a0a0a";
    ctx.font = "italic 600 56px 'Dancing Script', 'Brush Script MT', cursive";
    ctx.textBaseline = "middle";
    ctx.fillText(txt || "", 16, c.height / 2);
    onChange(c.toDataURL("image/png"));
  };

  return (
    <div className="space-y-2">
      <Tabs value={mode} onValueChange={(v) => setMode(v as "draw" | "type")}>
        <TabsList>
          <TabsTrigger value="type">Type</TabsTrigger>
          <TabsTrigger value="draw">Draw</TabsTrigger>
        </TabsList>
        <TabsContent value="type" className="pt-2">
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type your full name" />
        </TabsContent>
        <TabsContent value="draw" className="pt-2">
          <p className="text-xs text-muted-foreground">Draw your signature in the box below</p>
        </TabsContent>
      </Tabs>
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
