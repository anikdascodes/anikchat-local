import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect } from 'react';

interface ImageLightboxProps {
  src: string;
  onClose: () => void;
}

export function ImageLightbox({ src, onClose }: ImageLightboxProps) {
  // Lock body scroll when lightbox is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const lightboxContent = (
    <div
      className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh'
      }}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-[10000]"
        aria-label="Close image"
      >
        <X className="h-8 w-8" />
      </button>
      <img
        src={src}
        alt="Expanded view"
        className="object-contain rounded-lg shadow-2xl"
        style={{
          maxWidth: '95vw',
          maxHeight: '95vh',
          width: 'auto',
          height: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );

  // Use portal to render directly on document.body, bypassing any parent CSS constraints
  return createPortal(lightboxContent, document.body);
}
