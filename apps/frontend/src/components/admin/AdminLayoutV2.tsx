import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/context/SupabaseAuthContext';
import {
  LayoutDashboard,
  Users,
  FileStack,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  Shield,
  Activity,
  Database,
  AlertCircle,
  Sparkles,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';

interface AdminLayoutV2Props {
  children: React.ReactNode;
}

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  description?: string;
}

const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard,
    description: 'Overview & metrics'
  },
  {
    title: 'Users',
    href: '/admin/users',
    icon: Users,
    description: 'Manage users'
  },
  {
    title: 'Decks',
    href: '/admin/decks',
    icon: FileStack,
    description: 'View all decks'
  },
  {
    title: 'Analytics',
    href: '/admin/analytics',
    icon: BarChart3,
    description: 'Platform insights'
  },
];

const AdminLayoutV2: React.FC<AdminLayoutV2Props> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Get current page title
  const currentPage = navItems.find(item => 
    location.pathname === item.href || 
    (item.href !== '/admin' && location.pathname.startsWith(item.href))
  );

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      {/* Modern Sidebar */}
      <aside 
        className={cn(
          "hidden lg:flex flex-col transition-all duration-300 ease-in-out bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800",
          sidebarCollapsed ? "w-20" : "w-72"
        )}
      >
        {/* Logo Header */}
        <div className="h-20 flex items-center justify-between px-6 border-b border-gray-200 dark:border-gray-800">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-600/20">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 
                  className="text-lg font-semibold tracking-tight"
                  style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif' }}
                >
                  Admin Panel
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">next.slide</p>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-6">
          <nav className="px-3 space-y-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href || 
                (item.href !== '/admin' && location.pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 group relative overflow-hidden',
                    isActive
                      ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-600/20'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  )}
                >
                  <item.icon className={cn(
                    "h-5 w-5 transition-transform duration-200 group-hover:scale-110",
                    isActive && "text-white"
                  )} />
                  {!sidebarCollapsed && (
                    <>
                      <div className="flex-1">
                        <p className={cn(
                          "font-medium",
                          isActive ? "text-white" : "text-gray-900 dark:text-gray-100"
                        )}>
                          {item.title}
                        </p>
                        {item.description && !isActive && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {item.description}
                          </p>
                        )}
                      </div>
                      {item.badge && (
                        <span className={cn(
                          "ml-auto rounded-full px-2 py-0.5 text-xs font-medium",
                          isActive 
                            ? "bg-white/20 text-white" 
                            : "bg-violet-100 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400"
                        )}>
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                  {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -skew-x-12 translate-x-full group-hover:translate-x-0 transition-transform duration-700" />
                  )}
                </Link>
              );
            })}
          </nav>

          {!sidebarCollapsed && (
            <>
              <div className="mt-8 mb-4 px-6">
                <div className="h-px bg-gray-200 dark:bg-gray-800" />
              </div>

              {/* System Status */}
              <div className="px-6 space-y-3">
                <h3 
                  className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif' }}
                >
                  System Status
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
                    <Activity className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-900 dark:text-green-100">All Systems Operational</p>
                      <p className="text-xs text-green-700 dark:text-green-300">Last checked 2 mins ago</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </ScrollArea>

        {/* User Footer */}
        <div className="border-t border-gray-200 dark:border-gray-800 p-4">
          {!sidebarCollapsed ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 px-2">
                <div className="relative">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-600/20">
                    <span className="text-sm font-semibold text-white">
                      {user?.email?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-900" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {user?.email}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Administrator</p>
                </div>
              </div>
              <div className="space-y-1">
                <Link to="/app">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="w-full justify-start hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Back to Editor
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/10"
                  onClick={handleSignOut}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-600/20">
                <span className="text-sm font-semibold text-white">
                  {user?.email?.charAt(0).toUpperCase()}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/10"
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Menu Button */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-white dark:bg-gray-900 shadow-lg"
      >
        {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Mobile Sidebar */}
      <aside 
        className={cn(
          "lg:hidden fixed top-0 left-0 h-full w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 z-50 transform transition-transform duration-300",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Similar content as desktop sidebar but always expanded */}
        <div className="h-20 flex items-center px-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-600/20">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 
                className="text-lg font-semibold tracking-tight"
                style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif' }}
              >
                Admin Panel
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">next.slide</p>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 py-6">
          <nav className="px-3 space-y-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href || 
                (item.href !== '/admin' && location.pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-600/20'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <div className="flex-1">
                    <p className={cn(
                      "font-medium",
                      isActive ? "text-white" : "text-gray-900 dark:text-gray-100"
                    )}>
                      {item.title}
                    </p>
                    {item.description && !isActive && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {item.description}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </nav>
        </ScrollArea>

        <div className="border-t border-gray-200 dark:border-gray-800 p-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3 px-2">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center">
                <span className="text-sm font-semibold text-white">
                  {user?.email?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {user?.email}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Administrator</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-red-600 hover:text-red-700"
              onClick={handleSignOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 w-full">
        {/* Top Header Bar */}
        <header className="h-20 bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800 flex items-center px-6 lg:px-8">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-4 lg:ml-0 ml-12">
              <h1 
                className="text-2xl font-bold text-gray-900 dark:text-gray-100"
                style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif' }}
              >
                {currentPage?.title || 'Admin'}
              </h1>
              {currentPage?.description && (
                <span className="hidden sm:inline-block text-sm text-gray-500 dark:text-gray-400">
                  {currentPage.description}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {new Date().toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </span>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto w-full">
          <div className="p-6 lg:p-8 w-full">
            <div className="w-full">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayoutV2;