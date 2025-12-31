import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

function MediaLibrary() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Redirect to Dashboard with preserved query params
    navigate(`/${location.search}`, { replace: true });
  }, [navigate, location.search]);

  return null;
}

export default MediaLibrary;
