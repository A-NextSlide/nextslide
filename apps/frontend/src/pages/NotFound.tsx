import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5DC] dark:bg-zinc-900">
      <div className="text-center">
        <h1 
          className="text-[#383636] dark:text-gray-300 mb-4"
          style={{
            fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
            fontWeight: 900,
            fontSize: '72px',
            lineHeight: '100%',
            textTransform: 'uppercase'
          }}
        >
          404
        </h1>
        <p className="text-xl text-zinc-600 dark:text-zinc-400 mb-8">
          Oops! This page doesn't exist.
        </p>
        <div className="flex gap-4 justify-center">
          <a 
            href="/" 
            className="px-6 py-3 bg-[#FF4301] hover:bg-[#E63901] text-white rounded-lg transition-colors"
          >
            Go to Homepage
          </a>
          <a 
            href="/app" 
            className="px-6 py-3 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-lg transition-colors"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
