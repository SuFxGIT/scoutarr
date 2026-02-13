import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import React, { lazy, Suspense } from 'react';
import { Flex, Heading, Button, Separator, Box, Spinner, Text } from '@radix-ui/themes';
import { GearIcon, HomeIcon } from '@radix-ui/react-icons';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import { ThemeToggle } from './components/ThemeToggle';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const MediaLibrary = lazy(() => import('./pages/MediaLibrary'));
const Settings = lazy(() => import('./pages/Settings'));
const CfScoreHistory = lazy(() => import('./pages/CfScoreHistory'));

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
        onClick={(e: React.MouseEvent<HTMLAnchorElement>) => handleLinkClick(e, '/')}
      >
        <Flex align="center" gap="3">
          <img src="/headerlogo.png" alt="scoutarr" style={{ height: '2.5rem' }} />
          <Heading size="8" m="0">scoutarr</Heading>
        </Flex>
      </Link>
      <Flex gap="3" align="center">
        <Button variant="ghost" asChild>
          <Link to="/" onClick={(e: React.MouseEvent<HTMLAnchorElement>) => handleLinkClick(e, '/')}>
            <HomeIcon /> Home
          </Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/settings" onClick={(e: React.MouseEvent<HTMLAnchorElement>) => handleLinkClick(e, '/settings')}>
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
        <Suspense
          fallback={(
            <Flex align="center" justify="center" gap="2" style={{ padding: '2rem' }}>
              <Spinner size="2" />
              <Text size="2" color="gray">Loading...</Text>
            </Flex>
          )}
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/library" element={<MediaLibrary />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/cf-history/:appType/:instanceId/:mediaId" element={<CfScoreHistory />} />
          </Routes>
        </Suspense>
      </Box>
    </Flex>
  );
}

function App() {
  return (
    <Router>
      <NavigationProvider>
        <AppContent />
      </NavigationProvider>
    </Router>
  );
}

export default App;
