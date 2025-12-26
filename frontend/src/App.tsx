import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Flex, Heading, Button, Separator } from '@radix-ui/themes';
import Settings from './pages/Settings';
import Dashboard from './pages/Dashboard';
import { GearIcon, HomeIcon } from '@radix-ui/react-icons';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';

function NavigationLinks() {
  const { handleNavigation } = useNavigation();

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    // Always intercept navigation to allow guards to check
    e.preventDefault();
    handleNavigation(path);
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
