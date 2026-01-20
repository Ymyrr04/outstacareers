import { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface CVImagePreviewProps {
  pdfUrl: string;
  fileName: string;
}

export const CVImagePreview = ({ pdfUrl, fileName }: CVImagePreviewProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const isPdf = fileName.toLowerCase().endsWith('.pdf');

  useEffect(() => {
    if (!isPdf) {
      setLoading(false);
      setError('Only PDF files can be previewed as images');
      return;
    }

    const renderPdfAsImages = async () => {
      setLoading(true);
      setError(null);
      setPageImages([]);

      try {
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        setTotalPages(pdf.numPages);

        const images: string[] = [];

        // Render each page as an image
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2 }); // Higher scale for better quality

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          
          if (!context) {
            throw new Error('Could not get canvas context');
          }

          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({
            canvasContext: context,
            viewport: viewport,
          }).promise;

          // Convert canvas to image data URL
          const imageUrl = canvas.toDataURL('image/png');
          images.push(imageUrl);
        }

        setPageImages(images);
      } catch (err) {
        console.error('Error rendering PDF:', err);
        setError('Failed to render PDF preview');
      } finally {
        setLoading(false);
      }
    };

    renderPdfAsImages();
  }, [pdfUrl, isPdf]);

  const handleZoomIn = useCallback(() => setScale(prev => Math.min(prev + 0.1, 3)), []);
  const handleZoomOut = useCallback(() => setScale(prev => Math.max(prev - 0.1, 0.5)), []);

  // Use native event listener with passive: false to properly prevent browser zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        if (e.deltaY < 0) {
          setScale(prev => Math.min(prev + 0.1, 3));
        } else {
          setScale(prev => Math.max(prev - 0.1, 0.5));
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Rendering CV preview...</p>
      </div>
    );
  }

  if (error || !isPdf) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <FileText className="w-16 h-16 text-muted-foreground" />
        <div>
          <p className="text-lg font-medium">Image Preview Not Available</p>
          <p className="text-sm text-muted-foreground mt-1">
            {error || 'This file format cannot be previewed as an image. Use the download option instead.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage >= totalPages}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleZoomOut} disabled={scale <= 0.5}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button variant="outline" size="sm" onClick={handleZoomIn} disabled={scale >= 3}>
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Image Preview */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto bg-muted/20 p-4"
      >
        <div className="flex justify-center">
          {pageImages[currentPage - 1] && (
            <img
              src={pageImages[currentPage - 1]}
              alt={`CV Page ${currentPage}`}
              style={{ 
                maxWidth: `${scale * 100}%`,
                height: 'auto',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
              }}
              className="rounded-lg border bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
};
