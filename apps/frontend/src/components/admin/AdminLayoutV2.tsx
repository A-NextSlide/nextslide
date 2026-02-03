import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BROWSER } from '@/utils/browser';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/SupabaseAuthContext';
import {
  LayoutDashboard,
  Users,
  FileStack,
  LogOut,
  Menu,
  X,
  Palette,
  Server,
  DollarSign,
  ExternalLink,
  Bot,
  TrendingUp,
} from 'lucide-react';

interface AdminLayoutV2Props {
  children: React.ReactNode;
}

const navItems = [
  { title: 'Agent', href: '/admin', icon: Bot },
  { title: 'Overview', href: '/admin/overview', icon: LayoutDashboard },
  { title: 'Users', href: '/admin/users', icon: Users },
  { title: 'Decks', href: '/admin/decks', icon: FileStack },
  { title: 'Growth', href: '/admin/growth', icon: TrendingUp },
  { title: 'Brands', href: '/admin/brands', icon: Palette },
  { title: 'System', href: '/admin/services', icon: Server },
  { title: 'Costs', href: '/admin/costs', icon: DollarSign },
];

const AdminLayoutV2: React.FC<AdminLayoutV2Props> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  const handleSignOut = async () => {
    await signOut();
    navigate(BROWSER.isNativeApp ? '/app' : '/');
  };

  // Reset scroll position and close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    // Reset scroll to top when navigating
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  return (
    <div className="h-screen w-full bg-[#fafafa] dark:bg-[#0a0a0a] flex flex-col overflow-hidden">
      {/* Top Bar */}
      <header className="h-12 bg-white dark:bg-[#111] border-b border-[#eaeaea] dark:border-[#333] fixed top-0 left-0 right-0 z-40">
        <div className="h-full flex items-center justify-between px-4">
          {/* Left */}
          <div className="flex items-center gap-6">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-1.5 -ml-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <Link to="/admin" className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>nextslide</span>
              <span className="text-[#FF4301] text-xs font-bold">/</span>
              <span className="text-[#666] dark:text-[#888] text-sm">admin</span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = location.pathname === item.href ||
                  (item.href !== '/admin' && location.pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={cn(
                      'px-3 py-1.5 text-sm rounded-md transition-colors',
                      isActive
                        ? 'bg-[#FF4301]/10 text-[#FF4301] font-medium'
                        : 'text-[#666] dark:text-[#888] hover:text-black dark:hover:text-white hover:bg-[#f5f5f5] dark:hover:bg-[#1a1a1a]'
                    )}
                  >
                    {item.title}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right */}
          <div className="flex items-center gap-3">
            <Link
              to="/app"
              className="text-xs text-[#666] dark:text-[#888] hover:text-black dark:hover:text-white flex items-center gap-1"
            >
              App
              <ExternalLink className="h-3 w-3" />
            </Link>
            <div className="w-px h-4 bg-[#eaeaea] dark:bg-[#333]" />
            <button
              onClick={handleSignOut}
              className="text-xs text-[#666] dark:text-[#888] hover:text-black dark:hover:text-white flex items-center gap-1.5"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <>
          <div className="lg:hidden fixed inset-0 z-30 bg-black/20" onClick={() => setMobileMenuOpen(false)} />
          <div className="lg:hidden fixed top-12 left-0 right-0 z-30 bg-white dark:bg-[#111] border-b border-[#eaeaea] dark:border-[#333] p-2">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href ||
                (item.href !== '/admin' && location.pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 text-sm rounded-md',
                    isActive
                      ? 'bg-[#FF4301]/10 text-[#FF4301] font-medium'
                      : 'text-[#666] dark:text-[#888]'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.title}
                </Link>
              );
            })}
          </div>
        </>
      )}

      {/* Main Content */}
      <main ref={mainRef} className="pt-12 flex-1 w-full min-h-0 overflow-auto">
        <div className="w-full max-w-[1400px] mx-auto px-4 py-3">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AdminLayoutV2;
