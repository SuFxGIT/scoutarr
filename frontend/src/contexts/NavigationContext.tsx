import { createContext, useContext, useCallback, ReactNode, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface NavigationContextType {
  handleNavigation: (path: string) => void;
  registerNavigationGuard: (guard: (path: string) => boolean | Promise<boolean>) => void;
  unregisterNavigationGuard: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const navigationGuardRef = useRef<((path: string) => boolean | Promise<boolean>) | null>(null);

  const handleNavigation = useCallback(async (path: string) => {
    // If there's a navigation guard, check if navigation is allowed
    if (navigationGuardRef.current) {
      const canNavigate = await navigationGuardRef.current(path);
      if (!canNavigate) {
        return; // Navigation blocked
      }
    }
    navigate(path);
  }, [navigate]);

  const registerNavigationGuard = useCallback((guard: (path: string) => boolean | Promise<boolean>) => {
    navigationGuardRef.current = guard;
  }, []);

  const unregisterNavigationGuard = useCallback(() => {
    navigationGuardRef.current = null;
  }, []);

  return (
    <NavigationContext.Provider value={{ handleNavigation, registerNavigationGuard, unregisterNavigationGuard }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}

