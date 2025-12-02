import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
  BarChart3,
  ExternalLink,
} from 'lucide-react';

interface AdminLayoutV2Props {
  children: React.ReactNode;
}

const navItems = [
  { title: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { title: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { title: 'Users', href: '/admin/users', icon: Users },
  { title: 'Decks', href: '/admin/decks', icon: FileStack },
  { title: 'Brands', href: '/admin/brands', icon: Palette },
  { title: 'Services', href: '/admin/services', icon: Server },
];

const AdminLayoutV2: React.FC<AdminLayoutV2Props> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a]">
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
              <span className="font-semibold text-sm">nextslide</span>
              <span className="text-[#666] dark:text-[#888] text-xs">/</span>
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
                        ? 'bg-[#f3f3f3] dark:bg-[#222] text-black dark:text-white font-medium'
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
                      ? 'bg-[#f3f3f3] dark:bg-[#222] text-black dark:text-white font-medium'
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
      <main className="pt-12 min-h-screen">
        <div className="w-full">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AdminLayoutV2;
