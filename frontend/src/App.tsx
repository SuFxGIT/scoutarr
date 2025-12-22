import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Flex, Heading, Button, Separator } from '@radix-ui/themes';
import Settings from './pages/Settings';
import Dashboard from './pages/Dashboard';
import { GearIcon, HomeIcon } from '@radix-ui/react-icons';

function App() {
  return (
    <Router>
      <Flex direction="column" style={{ minHeight: '100vh' }} align="center">
        <div style={{ maxWidth: '1200px', width: '100%', padding: '1rem 1rem 0 1rem' }}>
          <Flex align="center" justify="between" mb="2">
            <Link to="/" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
              <Heading size="8" style={{ margin: 0 }}>scoutarr</Heading>
            </Link>
            <Flex gap="3">
              <Button variant="ghost" asChild>
                <Link to="/">
                  <HomeIcon /> Home
                </Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link to="/settings">
                  <GearIcon /> Settings
                </Link>
              </Button>
            </Flex>
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
    </Router>
  );
}

export default App;

