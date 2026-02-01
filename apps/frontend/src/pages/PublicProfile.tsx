import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/SupabaseAuthContext';
import { profileApi, type PublicProfile as PublicProfileType, type ProfilePresentation } from '@/services/profileApi';
import { trackProfileViewed, trackProfileFollowed, trackProfileUnfollowed } from '@/services/analytics';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  Users,
  Eye,
  Presentation,
  Flame,
  Calendar,
  Globe,
  Linkedin,
  Twitter,
  ExternalLink,
  UserPlus,
  UserMinus,
  ArrowLeft,
  Loader2,
  Sparkles,
  Copy,
  Award,
} from 'lucide-react';
import DynamicMeta from '@/components/seo/DynamicMeta';

// Creator tier config
const TIER_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  diamond: { label: 'Diamond', color: 'text-cyan-400', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500/30' },
  platinum: { label: 'Platinum', color: 'text-purple-400', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/30' },
  gold: { label: 'Gold', color: 'text-yellow-500', bgColor: 'bg-yellow-500/10', borderColor: 'border-yellow-500/30' },
  silver: { label: 'Silver', color: 'text-gray-400', bgColor: 'bg-gray-500/10', borderColor: 'border-gray-500/30' },
  bronze: { label: 'Bronze', color: 'text-orange-500', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/30' },
  none: { label: '', color: '', bgColor: '', borderColor: '' },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(num);
}

export default function PublicProfile() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { user: currentUser, isAuthenticated } = useAuth();

  const [profile, setProfile] = useState<PublicProfileType | null>(null);
  const [presentations, setPresentations] = useState<ProfilePresentation[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);

  // Fetch profile data
  useEffect(() => {
    if (!username) return;

    const fetchProfile = async () => {
      setLoading(true);
      setNotFound(false);

      try {
        const profileData = await profileApi.getPublicProfile(username);

        if (!profileData) {
          setNotFound(true);
          return;
        }

        setProfile(profileData);
        setIsFollowing(profileData.is_following);
        setFollowerCount(profileData.stats.follower_count);

        trackProfileViewed(username);

        // Fetch presentations
        const presData = await profileApi.getUserPresentations(username);
        setPresentations(presData.presentations);
      } catch (error) {
        console.error('[PublicProfile] Failed to load profile:', error);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [username]);

  // Follow / unfollow handler
  const handleFollowToggle = useCallback(async () => {
    if (!username || !isAuthenticated) {
      navigate('/login');
      return;
    }

    setFollowLoading(true);
    try {
      if (isFollowing) {
        const result = await profileApi.unfollowUser(username);
        if (result.success) {
          setIsFollowing(false);
          setFollowerCount((c) => Math.max(0, c - 1));
          trackProfileUnfollowed(username);
        }
      } else {
        const result = await profileApi.followUser(username);
        if (result.success) {
          setIsFollowing(true);
          setFollowerCount((c) => c + 1);
          trackProfileFollowed(username);
        }
      }
    } catch (error) {
      console.error('[PublicProfile] Follow toggle failed:', error);
    } finally {
      setFollowLoading(false);
    }
  }, [username, isAuthenticated, isFollowing, navigate]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not found state
  if (notFound || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <h1 className="text-2xl font-bold mb-2">Profile not found</h1>
        <p className="text-muted-foreground mb-6">
          This user does not exist or their profile is private.
        </p>
        <Button variant="outline" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to home
        </Button>
      </div>
    );
  }

  const tier = TIER_CONFIG[profile.creator_tier] || TIER_CONFIG.none;
  const isOwnProfile = currentUser?.id === profile.id;

  const displayName = profile.full_name || profile.username;
  const profileCanonical = `https://nextslide.ai/u/${profile.username}`;
  const profileDescription = profile.bio || `View presentations by ${displayName} on NextSlide`;
  const personSchema = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: displayName,
    url: profileCanonical,
    description: profileDescription,
    ...(profile.avatar_url ? { image: profile.avatar_url } : {}),
  };

  return (
    <div className="min-h-screen bg-background">
      <DynamicMeta
        title={`${displayName}'s Presentations | NextSlide`}
        description={profileDescription}
        url={profileCanonical}
        canonical={profileCanonical}
        image={profile.avatar_url || undefined}
        schema={personSchema}
      />
      {/* Header bar */}
      <div className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Link to="/" className="text-sm font-semibold text-foreground hover:opacity-80">
            NextSlide
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Profile header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col md:flex-row gap-6 items-start md:items-center"
        >
          {/* Avatar */}
          <Avatar className="h-24 w-24 md:h-28 md:w-28 border-2 border-border">
            {profile.avatar_url ? (
              <AvatarImage src={profile.avatar_url} alt={profile.full_name || profile.username} />
            ) : null}
            <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
              {(profile.full_name || profile.username || '?').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          {/* Info */}
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h1 className="text-2xl md:text-3xl font-bold">{profile.full_name || profile.username}</h1>
              {tier.label && (
                <Badge
                  variant="outline"
                  className={`${tier.bgColor} ${tier.color} ${tier.borderColor} text-xs font-semibold`}
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  {tier.label} Creator
                </Badge>
              )}
            </div>

            <p className="text-muted-foreground text-sm mb-2">@{profile.username}</p>

            {profile.bio && (
              <p className="text-sm text-foreground/80 max-w-lg mb-3">{profile.bio}</p>
            )}

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Joined {formatDate(profile.created_at)}
              </span>
              {profile.stats.streak_count > 0 && (
                <span className="flex items-center gap-1 text-orange-500">
                  <Flame className="h-3.5 w-3.5" />
                  {profile.stats.streak_count}-day streak
                </span>
              )}
            </div>

            {/* Social links */}
            {profile.social_links && Object.keys(profile.social_links).length > 0 && (
              <div className="flex items-center gap-3 mt-3">
                {profile.social_links.linkedin && (
                  <a
                    href={profile.social_links.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Linkedin className="h-4 w-4" />
                  </a>
                )}
                {profile.social_links.twitter && (
                  <a
                    href={profile.social_links.twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Twitter className="h-4 w-4" />
                  </a>
                )}
                {profile.social_links.website && (
                  <a
                    href={profile.social_links.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Globe className="h-4 w-4" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Follow button */}
          <div className="flex flex-col items-end gap-2">
            {!isOwnProfile && (
              <Button
                variant={isFollowing ? 'outline' : 'default'}
                size="sm"
                onClick={handleFollowToggle}
                disabled={followLoading}
              >
                {followLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isFollowing ? (
                  <>
                    <UserMinus className="h-4 w-4 mr-1.5" />
                    Following
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-1.5" />
                    Follow
                  </>
                )}
              </Button>
            )}
            {isOwnProfile && (
              <Button variant="outline" size="sm" onClick={() => navigate('/profile')}>
                Edit Profile
              </Button>
            )}
          </div>
        </motion.div>

        <Separator className="my-8" />

        {/* Stats cards */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
        >
          <StatCard
            icon={<Presentation className="h-4 w-4" />}
            label="Presentations"
            value={formatNumber(profile.stats.total_presentations)}
          />
          <StatCard
            icon={<Eye className="h-4 w-4" />}
            label="Total Views"
            value={formatNumber(profile.stats.total_views)}
          />
          <StatCard
            icon={<Copy className="h-4 w-4" />}
            label="Remixes"
            value={formatNumber(profile.stats.total_remixes)}
          />
          <StatCard
            icon={<Users className="h-4 w-4" />}
            label="Followers"
            value={formatNumber(followerCount)}
          />
        </motion.div>

        {/* Presentations grid */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <h2 className="text-lg font-semibold mb-4">
            Presentations
            {presentations.length > 0 && (
              <span className="text-muted-foreground font-normal ml-2 text-sm">
                ({profile.stats.total_presentations})
              </span>
            )}
          </h2>

          {presentations.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Presentation className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No public presentations yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {presentations.map((pres) => (
                <PresentationCard key={pres.uuid} presentation={pres} />
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Sub-components
// -------------------------------------------------------------------

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        {icon}
        {label}
      </div>
      <span className="text-2xl font-bold">{value}</span>
    </div>
  );
}

function PresentationCard({ presentation }: { presentation: ProfilePresentation }) {
  const navigate = useNavigate();

  // Try to get a thumbnail from first_slide
  const thumbnail = presentation.first_slide as Record<string, unknown> | null;

  return (
    <div
      className="group rounded-lg border bg-card overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate(`/p/${presentation.uuid}`)}
    >
      {/* Thumbnail area */}
      <div className="aspect-video bg-muted relative overflow-hidden">
        {thumbnail ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            <Presentation className="h-8 w-8 opacity-30" />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Presentation className="h-8 w-8 opacity-30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Card body */}
      <div className="p-3">
        <h3 className="font-medium text-sm truncate">{presentation.name}</h3>
        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
          <span>{presentation.slide_count} slides</span>
          <span>{formatDate(presentation.updated_at)}</span>
        </div>
      </div>
    </div>
  );
}
