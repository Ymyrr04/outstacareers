import { useRef } from "react";
import { File as FileIcon, FileText, Image as ImageIcon, Paperclip, X } from "lucide-react";

export interface PendingAttachment {
  id: string;
  file: File;
}

export const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

export function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(((reader.result as string) || "").split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function serializeAttachments(items: PendingAttachment[]) {
  return Promise.all(
    items.map(async (a) => ({
      filename: a.file.name,
      mimeType: a.file.type || "application/octet-stream",
      data: await toBase64(a.file),
    })),
  );
}

function fileIcon(type: string) {
  if (type.startsWith("image/")) return ImageIcon;
  if (type.includes("pdf") || type.includes("word") || type.includes("text") || type.includes("document")) return FileText;
  return FileIcon;
}

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachButton({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />
      <button
        type="button"
        title="Attach files"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center justify-center rounded"
        style={{ width: 28, height: 28, borderRadius: 4 }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "#E0F7FC"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <Paperclip className="w-3.5 h-3.5" />
      </button>
    </>
  );
}

export function AttachmentList({
  items,
  onRemove,
}: {
  items: PendingAttachment[];
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) return null;
  const total = items.reduce((s, a) => s + a.file.size, 0);
  return (
    <div className="px-1 pt-2 space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {items.map((a) => {
          const Icon = fileIcon(a.file.type);
          return (
            <span
              key={a.id}
              className="inline-flex items-center gap-1.5"
              style={{ background: "#F8FFFD", border: "0.5px solid #C8F0F8", borderRadius: 6, padding: "4px 8px" }}
            >
              <Icon className="w-3 h-3 text-muted-foreground" />
              <span style={{ fontSize: 11, fontWeight: 500 }} className="max-w-[160px] truncate">{a.file.name}</span>
              <span style={{ fontSize: 10 }} className="text-muted-foreground">{humanSize(a.file.size)}</span>
              <button type="button" onClick={() => onRemove(a.id)} className="text-muted-foreground hover:text-red-500">
                <X style={{ width: 10, height: 10 }} />
              </button>
            </span>
          );
        })}
      </div>
      {total > MAX_TOTAL_BYTES && (
        <p className="text-[11px] text-amber-600">Total attachment size exceeds Gmail's 25MB limit</p>
      )}
    </div>
  );
}
