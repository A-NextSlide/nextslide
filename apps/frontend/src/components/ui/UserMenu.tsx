import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/context/SupabaseAuthContext';
import { User, LogOut, Settings, HelpCircle, Shield, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authService } from '@/services/authService';

export function UserMenu() {
  const { user, signOut, isAuthenticated, isAdmin, adminRole, refreshAdminStatus } = useAuth();
  const navigate = useNavigate();
  const hasTriggeredAdminCheckRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [adminVerified, setAdminVerified] = useState<boolean>(false);

  // Direct verification as a hard fallback to reflect backend truth immediately in UI
  const verifyAdminDirect = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch('/api/admin/check', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) return;
      const raw = await res.json();
      const flag = Boolean(
        raw?.isAdmin === true ||
        raw?.is_admin === true ||
        (raw?.role && (raw.role === 'admin' || raw.role === 'super_admin' || raw.role === 'superadmin'))
      );
      if (flag) setAdminVerified(true);
    } catch {}
  };

  // Do not proactively check admin on mount; keep the request on demand when opening the menu

  // Add handler for sign out
  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  if (!isAuthenticated || !user) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate('/login')}
        className="h-8 px-3 border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-900/40 dark:text-orange-400 dark:hover:bg-orange-950/30"
        title="Sign in"
      >
        <User className="h-4 w-4 mr-1" />
        Sign In
      </Button>
    );
  }

  // Get initials for avatar
  const getInitials = (name?: string) => {
    if (!name) return user?.email?.[0].toUpperCase() || 'U';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return parts[0][0].toUpperCase() + parts[parts.length - 1][0].toUpperCase();
    }
    return name[0].toUpperCase();
  };

  const hasAdminAccess = isAdmin || adminVerified || adminRole === 'admin' || adminRole === 'super_admin' || adminRole === 'superadmin';

  return (
    <DropdownMenu open={open} onOpenChange={async (o) => {
      setOpen(o);
      if (o && isAuthenticated) {
        try { await refreshAdminStatus(); } catch {}
        if (!isAdmin) { await verifyAdminDirect(); }
      }
    }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative h-8 w-8 rounded-full ring-1 ring-transparent hover:ring-[#FF4301]/40 transition" title="Account">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-[#FF4301] text-white font-semibold">
              {getInitials(user?.user_metadata?.full_name)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium leading-none">{user?.user_metadata?.full_name || 'User'}</p>
              {hasAdminAccess && (
                <span className="text-[10px] font-medium text-orange-700 bg-orange-50 dark:text-orange-300 dark:bg-orange-950/40 rounded px-1.5 py-0.5">Admin</span>
              )}
            </div>
            <p className="text-xs leading-none text-muted-foreground">
              {user?.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hasAdminAccess && (
          <>
            <DropdownMenuItem onClick={() => navigate('/admin')} className="cursor-pointer">
              <Shield className="mr-2 h-4 w-4" />
              <span>Admin Panel</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={() => navigate('/team')} className="cursor-pointer">
          <Users className="mr-2 h-4 w-4" />
          <span>Team Settings</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('/profile')} className="cursor-pointer">
          <Settings className="mr-2 h-4 w-4" />
          <span>Profile Settings</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('/help')} className="cursor-pointer">
          <HelpCircle className="mr-2 h-4 w-4" />
          <span>Help & Support</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="text-red-600 dark:text-red-500 cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
} 