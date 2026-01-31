import { useParams, useLocation, Navigate } from 'react-router-dom';
import { getLandingPageBySlug, industryLandingPages } from '@/config/landingPages';
import UseCaseLanding from './UseCaseLanding';
import IndustryLanding from './IndustryLanding';

export default function LandingPageRouter() {
  const { slug: routeSlug } = useParams<{ slug: string }>();
  const location = useLocation();

  // Legacy /for/:slug → redirect to /for-:slug
  if (routeSlug && location.pathname.startsWith('/for/')) {
    return <Navigate to={`/for-${routeSlug}`} replace />;
  }

  // Extract slug from path:
  //   /pitch-deck    → "pitch-deck"
  //   /for-startups  → "startups"
  //   /for-educators → "educators"
  const path = location.pathname.replace(/^\//, '');
  const slug = path.startsWith('for-') ? path.replace('for-', '') : path;

  const config = getLandingPageBySlug(slug);

  if (!config) {
    return <Navigate to="/404" replace />;
  }

  const isIndustry = industryLandingPages.some(p => p.slug === slug);

  return isIndustry ? <IndustryLanding config={config} /> : <UseCaseLanding config={config} />;
}
