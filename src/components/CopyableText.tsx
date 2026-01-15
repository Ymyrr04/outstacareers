import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CopyableTextProps {
  text: string;
  children?: React.ReactNode;
  className?: string;
  showIcon?: boolean;
}

export function CopyableText({ text, children, className = '', showIcon = false }: CopyableTextProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: 'Copied!',
        description: text,
        duration: 2000,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: 'Failed to copy',
        variant: 'destructive',
      });
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 hover:text-primary cursor-pointer transition-colors ${className}`}
      title="Click to copy"
    >
      {children || text}
      {showIcon && (
        copied ? (
          <Check className="w-3 h-3 text-green-500" />
        ) : (
          <Copy className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
        )
      )}
    </button>
  );
}
