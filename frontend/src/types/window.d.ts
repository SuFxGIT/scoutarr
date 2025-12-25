/**
 * Extended window interface for Scoutarr
 */
declare global {
  interface Window {
    __scoutarr_handleNavigation?: (path: string) => void;
  }
}

export {};
