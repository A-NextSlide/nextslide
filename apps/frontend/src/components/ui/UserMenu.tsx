import React from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/context/SupabaseAuthContext';
import { User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function UserMenu() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

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

  const getInitials = (name?: string) => {
    if (!name) return user?.email?.[0].toUpperCase() || 'U';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return parts[0][0].toUpperCase() + parts[parts.length - 1][0].toUpperCase();
    }
    return name[0].toUpperCase();
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="relative h-8 w-8 rounded-full ring-1 ring-transparent hover:ring-[#FF4301]/40 transition"
      title="Settings"
      onClick={() => navigate('/profile')}
    >
      <Avatar className="h-8 w-8">
        <AvatarFallback className="bg-[#FF4301] text-white font-semibold text-xs">
          {getInitials(user?.user_metadata?.full_name)}
        </AvatarFallback>
      </Avatar>
    </Button>
  );
}
