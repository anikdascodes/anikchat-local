import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner, toast } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/hooks/useTheme";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useRegisterSW } from 'virtual:pwa-register/react';
import { logger } from "@/lib/logger";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";

// Debug log helper (dev only)
declare global { interface Window { debugLog?: (msg: string, data?: unknown, hyp?: string) => void } }

// #region dev lag monitor
if (import.meta.env.DEV) {
  window.debugLog = (message: string, data?: unknown) => {
    if (message.includes('Chunk') || message.includes('render (streaming)')) {
      if (Math.random() > 0.02) return;
    }
    logger.debug(`[DEBUG] ${message}`, data);
  };
} else {
  window.debugLog = () => {};
}

let lastFrameTime = performance.now();
const monitorLag = () => {
  if (!import.meta.env.DEV) return;
  const now   = performance.now();
  const delta = now - lastFrameTime;
  if (delta > 150) window.debugLog?.('UI JANK DETECTED', { duration: Math.round(delta) });
  lastFrameTime = now;
  requestAnimationFrame(monitorLag);
};
if (import.meta.env.DEV) requestAnimationFrame(monitorLag);
// #endregion

// Lazy load pages for faster initial load
const Settings = lazy(() => import("./pages/Settings"));
const TranscribeVideo = lazy(() => import("./pages/TranscribeVideo"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Login = lazy(() => import("./pages/Login"));

const queryClient = new QueryClient();

const App = () => {
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

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <AuthProvider>
                <Suspense fallback={<div className="h-screen flex items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">Loading...</div></div>}>
                  <Routes>
                    {/* Public route */}
                    <Route path="/login" element={<Login />} />
                    {/* Protected routes */}
                    <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                    <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                    <Route path="/transcribe" element={<ProtectedRoute><TranscribeVideo /></ProtectedRoute>} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </AuthProvider>
            </BrowserRouter>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
