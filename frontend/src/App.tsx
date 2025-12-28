import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Flex, Heading, Button, Separator, Box } from '@radix-ui/themes';
import Settings from './pages/Settings';
import Dashboard from './pages/Dashboard';
import MediaLibrary from './pages/MediaLibrary';
import { GearIcon, HomeIcon, ArchiveIcon } from '@radix-ui/react-icons';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import { ThemeToggle } from './components/ThemeToggle';

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
        style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
        onClick={(e) => handleLinkClick(e, '/')}
      >
        <Flex align="center" gap="3">
          <img src="/headerlogo.png" alt="scoutarr" style={{ height: '2.5rem' }} />
          <Heading size="8" m="0">scoutarr</Heading>
        </Flex>
      </Link>
      <Flex gap="3" align="center">
        <Button variant="ghost" asChild>
          <Link to="/" onClick={(e) => handleLinkClick(e, '/')}>
            <HomeIcon /> Home
          </Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/library" onClick={(e) => handleLinkClick(e, '/library')}>
            <ArchiveIcon /> Library
          </Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/settings" onClick={(e) => handleLinkClick(e, '/settings')}>
            <GearIcon /> Settings
          </Link>
        </Button>
        <ThemeToggle />
      </Flex>
    </>
  );
}

function AppContent() {
  return (
    <Flex direction="column" minHeight="100vh" align="center">
      <Box maxWidth="1200px" width="100%" pt="4" px="4">
        <Flex align="center" justify="between" mb="2">
          <NavigationLinks />
        </Flex>
        <Separator size="4" mb="0" />
      </Box>

      <Box maxWidth="1200px" width="100%" p="4" mx="auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/library" element={<MediaLibrary />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Box>
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
