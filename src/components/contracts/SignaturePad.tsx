import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface SignaturePadProps {
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  allowType?: boolean;
}

// Renders a typed string to a PNG data URL using a script-style font.
const typedToDataUrl = (text: string): string | null => {
  if (!text.trim()) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 140;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0a0a0a";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.font = "italic 64px 'Brush Script MT', 'Segoe Script', 'Lucida Handwriting', cursive";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  return canvas.toDataURL("image/png");
};

export const SignaturePad = ({ value, onChange, allowType = false }: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [typed, setTyped] = useState("");
  const [mode, setMode] = useState<"draw" | "type">("draw");

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx?.clearRect(0, 0, c.width, c.height);
    onChange(null);
    setTyped("");
  }, []);

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
    if (c) c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setTyped("");
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

  const drawPanel = (
    <>
      <p className="text-xs text-muted-foreground">Draw in the box below</p>
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
    </>
  );

  if (!allowType) {
    return (
      <div className="space-y-2">
        {drawPanel}
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={clear}>Clear</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Tabs value={mode} onValueChange={(v) => { setMode(v as "draw" | "type"); clear(); }}>
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="draw">Draw</TabsTrigger>
          <TabsTrigger value="type">Type</TabsTrigger>
        </TabsList>
        <TabsContent value="draw" className="space-y-2 mt-2">
          {drawPanel}
        </TabsContent>
        <TabsContent value="type" className="space-y-2 mt-2">
          <p className="text-xs text-muted-foreground">Type your initials</p>
          <Input
            value={typed}
            maxLength={6}
            onChange={(e) => {
              const t = e.target.value;
              setTyped(t);
              onChange(typedToDataUrl(t));
            }}
            placeholder="e.g. JD"
            className="text-center text-2xl"
            style={{ fontFamily: "'Brush Script MT', 'Segoe Script', 'Lucida Handwriting', cursive", fontStyle: "italic" }}
          />
        </TabsContent>
      </Tabs>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={clear}>Clear</Button>
      </div>
    </div>
  );
};
