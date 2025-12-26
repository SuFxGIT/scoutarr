import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Flex, Heading, Button, Separator, Tooltip } from '@radix-ui/themes';
import Settings from './pages/Settings';
import Dashboard from './pages/Dashboard';
import { GearIcon, HomeIcon, ReloadIcon } from '@radix-ui/react-icons';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

function NavigationLinks() {
  const location = useLocation();
  const { handleNavigation } = useNavigation();
  const queryClient = useQueryClient();

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    // Only intercept if we're navigating away from settings
    if (location.pathname === '/settings' && path !== '/settings') {
      e.preventDefault();
      handleNavigation(path);
      return;
    }
    // Otherwise, let default Link behavior handle it
  };

  const handleRefresh = async () => {
    // Refetch all queries that should be refreshed
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['status'] }),
      queryClient.refetchQueries({ queryKey: ['schedulerHistory'] }),
      queryClient.refetchQueries({ queryKey: ['runPreview'] }),
      queryClient.refetchQueries({ queryKey: ['stats'] }),
    ]);
    toast.success('Refreshed');
  };

  return (
    <>
      <Link 
        to="/" 
        style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
        onClick={(e) => handleLinkClick(e, '/')}
      >
        <img src="/headerlogo.png" alt="scoutarr" style={{ height: '2.5rem' }} />
        <Heading size="8" style={{ margin: 0 }}>scoutarr</Heading>
      </Link>
      <Flex gap="3">
        <Button variant="ghost" asChild>
          <Link to="/" onClick={(e) => handleLinkClick(e, '/')}>
            <HomeIcon /> Home
          </Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/settings" onClick={(e) => handleLinkClick(e, '/settings')}>
            <GearIcon /> Settings
          </Link>
        </Button>
        <Tooltip content="Refresh app">
          <Button variant="ghost" onClick={handleRefresh}>
            <ReloadIcon /> Refresh
          </Button>
        </Tooltip>
      </Flex>
    </>
  );
}

function AppContent() {
  return (
    <Flex direction="column" style={{ minHeight: '100vh' }} align="center">
      <div style={{ maxWidth: '1200px', width: '100%', padding: '1rem 1rem 0 1rem' }}>
        <Flex align="center" justify="between" mb="2">
          <NavigationLinks />
        </Flex>
        <Separator size="4" mb="0" />
      </div>

      <div style={{ maxWidth: '1200px', width: '100%', padding: '1rem', margin: '0 auto' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </Flex>
  );
}

function App() {
  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <NavigationProvider>
        <AppContent />
      </NavigationProvider>
    </Router>
  );
}

export default App;
