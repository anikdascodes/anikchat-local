export {};

declare global {
  interface Window {
    debugLog?: (message: string, data?: unknown, hypothesisId?: string) => void;
  }
}

