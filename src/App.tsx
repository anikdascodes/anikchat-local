import { lazy, Suspense, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner, toast } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/hooks/useTheme";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useRegisterSW } from 'virtual:pwa-register/react';
import { storageService } from "@/lib/storageService";
import { StorageSetup } from "@/components/StorageSetup";
import { logger } from "@/lib/logger";
import Index from "./pages/Index";

// #region agent log
if (import.meta.env.DEV) {
  window.debugLog = (message: string, data?: unknown, hypothesisId?: string) => {
    if (message.includes('Chunk') || message.includes('render (streaming)')) {
      if (Math.random() > 0.02) return; // Extreme throttling for high-freq logs
    }

    const timestamp = Date.now();
    logger.debug(`[DEBUG] ${message}`, data);

    try {
      const logs = JSON.parse(localStorage.getItem('anikchat-debug-logs') || '[]');
      logs.push({ message, data, hypothesisId, timestamp });
      if (logs.length > 100) logs.shift();
      localStorage.setItem('anikchat-debug-logs', JSON.stringify(logs));
    } catch (error) {
      logger.debug('Failed to persist debug logs:', error);
    }
  };
} else {
  window.debugLog = () => {};
}

// High-precision Lag Monitor (only active in dev or manually enabled)
let lastFrameTime = performance.now();
const monitorLag = () => {
  if (!import.meta.env.DEV) return; // Disabled in production
  const now = performance.now();
  const delta = now - lastFrameTime;
  if (delta > 150) {
    window.debugLog?.('UI JANK DETECTED', { duration: Math.round(delta) }, 'H1');
  }
  lastFrameTime = now;
  requestAnimationFrame(monitorLag);
};
if (import.meta.env.DEV) requestAnimationFrame(monitorLag);

window.debugLog?.('App initialized');
// #endregion

// Lazy load pages for faster initial load
const Settings = lazy(() => import("./pages/Settings"));
const TranscribeVideo = lazy(() => import("./pages/TranscribeVideo"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => {
  const [showStorageSetup, setShowStorageSetup] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      logger.info('SW Registered: ' + r);
    },
    onRegisterError(error) {
      logger.error('SW registration error', error);
    },
  });

  // Initialize storage on app load
  useEffect(() => {
    const initStorage = async () => {
      await storageService.init();

      if (storageService.isFirstTime()) {
        setShowStorageSetup(true);
      } else if (storageService.needsReauthorization()) {
        setNeedsReauth(true);
      }
      setIsReady(true);
    };
    initStorage();
  }, []);

  // Handle re-authorization for file system
  useEffect(() => {
    if (needsReauth) {
      toast.info("Storage access needed", {
        description: "Click to reconnect to your storage folder",
        action: {
          label: "Reconnect",
          onClick: async () => {
            const success = await storageService.reauthorize();
            if (success) {
              setNeedsReauth(false);
              toast.success("Storage reconnected");
            } else {
              await storageService.switchToIndexedDB();
              setNeedsReauth(false);
              toast.error("Could not reconnect. Switched to browser storage.");
            }
          },
        },
        duration: 60000,
      });
    }
  }, [needsReauth]);

  useEffect(() => {
    if (needRefresh) {
      toast.info("New content available", {
        description: "Click to reload and get the latest version.",
        action: {
          label: "Reload",
          onClick: () => updateServiceWorker(true),
        },
        duration: 60000, // 60 seconds, then auto-dismiss
      });
    }
  }, [needRefresh, updateServiceWorker]);

  // Show loading while initializing
  if (!isReady) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            {showStorageSetup ? (
              <StorageSetup onComplete={() => setShowStorageSetup(false)} isFirstTime />
            ) : (
              <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <Suspense fallback={<div className="h-screen flex items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">Loading...</div></div>}>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/transcribe" element={<TranscribeVideo />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </BrowserRouter>
            )}
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
