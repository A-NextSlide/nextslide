import { Navigate, useLocation } from 'react-router-dom';
import { getToolPageBySlug } from '@/config/toolPages';
import ToolLanding from './ToolLanding';

export default function ToolPageRouter() {
  const location = useLocation();

  // Extract slug from the URL pathname (e.g. "/pdf-to-ppt" -> "pdf-to-ppt")
  const slug = location.pathname.replace(/^\//, '').replace(/\/$/, '');
  const config = getToolPageBySlug(slug);

  if (!config) {
    return <Navigate to="/not-found" replace />;
  }

  return <ToolLanding config={config} />;
}
