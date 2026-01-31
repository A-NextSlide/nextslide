import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/SupabaseAuthContext';
import { profileApi, type OwnProfile, type SocialLinks } from '@/services/profileApi';
import { trackProfileUpdated } from '@/services/analytics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import {
  User,
  Globe,
  Linkedin,
  Twitter,
  Link2,
  Eye,
  Loader2,
  Check,
  AlertCircle,
  ExternalLink,
  Sparkles,
} from 'lucide-react';

// Username validation (matches backend regex)
const USERNAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,28}[a-zA-Z0-9]$/;

function validateUsername(value: string): string | null {
  if (!value) return 'Username is required';
  if (value.length < 3) return 'Username must be at least 3 characters';
  if (value.length > 30) return 'Username must be 30 characters or less';
  if (!USERNAME_REGEX.test(value)) {
    return 'Only letters, numbers, and hyphens allowed. Cannot start or end with a hyphen.';
  }
  return null;
}

export default function ProfileSettings() {
  const { user } = useAuth();

  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [twitter, setTwitter] = useState('');
  const [website, setWebsite] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  // Validation
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSaving, setUsernameSaving] = useState(false);

  // Load profile
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const data = await profileApi.getOwnProfile();
        setProfile(data);
        setUsername(data.username || '');
        setBio(data.bio || '');
        setAvatarUrl(data.avatar_url || '');
        setLinkedin(data.social_links?.linkedin || '');
        setTwitter(data.social_links?.twitter || '');
        setWebsite(data.social_links?.website || '');
        setIsPublic(data.is_profile_public || false);
      } catch (error) {
        console.error('[ProfileSettings] Failed to load profile:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  // Save username
  const handleSaveUsername = useCallback(async () => {
    const error = validateUsername(username);
    if (error) {
      setUsernameError(error);
      return;
    }
    setUsernameError(null);
    setUsernameSaving(true);

    try {
      const result = await profileApi.setUsername(username.toLowerCase());
      if (result.success) {
        toast({
          title: 'Username saved',
          description: `Your profile will be at /u/${result.username}`,
        });
        trackProfileUpdated(['username']);
      } else {
        setUsernameError(result.error || 'Failed to save username');
      }
    } catch (error) {
      setUsernameError('Failed to save username');
    } finally {
      setUsernameSaving(false);
    }
  }, [username]);

  // Save profile fields
  const handleSaveProfile = useCallback(async () => {
    setSaving(true);
    const updatedFields: string[] = [];

    try {
      const socialLinks: SocialLinks = {};
      if (linkedin) socialLinks.linkedin = linkedin;
      if (twitter) socialLinks.twitter = twitter;
      if (website) socialLinks.website = website;

      const data: Record<string, unknown> = {};

      // Determine which fields changed
      if (bio !== (profile?.bio || '')) {
        data.bio = bio;
        updatedFields.push('bio');
      }
      if (avatarUrl !== (profile?.avatar_url || '')) {
        data.avatar_url = avatarUrl;
        updatedFields.push('avatar_url');
      }
      if (isPublic !== (profile?.is_profile_public || false)) {
        data.is_profile_public = isPublic;
        updatedFields.push('is_profile_public');
      }

      // Always send social links (they're a single JSON field)
      const prevLinks = profile?.social_links || {};
      if (
        linkedin !== (prevLinks.linkedin || '') ||
        twitter !== (prevLinks.twitter || '') ||
        website !== (prevLinks.website || '')
      ) {
        data.social_links = socialLinks;
        updatedFields.push('social_links');
      }

      if (Object.keys(data).length === 0) {
        toast({ title: 'No changes to save' });
        setSaving(false);
        return;
      }

      const result = await profileApi.updateProfile(data as Record<string, unknown> & { bio?: string; social_links?: SocialLinks; is_profile_public?: boolean; avatar_url?: string });
      if (result.success) {
        toast({ title: 'Profile updated' });
        trackProfileUpdated(updatedFields);
        // Refresh profile data
        if (result.profile) {
          setProfile(result.profile as OwnProfile);
        }
      } else {
        toast({ title: 'Error', description: result.error || 'Failed to update profile', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update profile', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [bio, avatarUrl, linkedin, twitter, website, isPublic, profile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const publicUrl = username ? `${window.location.origin}/u/${username}` : null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <User className="h-5 w-5" />
          Public Profile
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Customize how others see your profile on NextSlide.
        </p>
      </div>

      <Separator />

      {/* Public toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <div>
            <Label className="font-medium">Make profile public</Label>
            <p className="text-xs text-muted-foreground">
              Allow others to see your profile and presentations
            </p>
          </div>
        </div>
        <Switch checked={isPublic} onCheckedChange={setIsPublic} />
      </div>

      <Separator />

      {/* Username */}
      <div className="space-y-2">
        <Label htmlFor="username" className="flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Username
        </Label>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted rounded-l-md border border-r-0 px-3 h-9 text-sm text-muted-foreground">
            nextslide.ai/u/
          </div>
          <Input
            id="username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value.toLowerCase());
              setUsernameError(null);
            }}
            placeholder="your-username"
            className="rounded-l-none flex-1"
            maxLength={30}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveUsername}
            disabled={usernameSaving || !username}
          >
            {usernameSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </Button>
        </div>
        {usernameError && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {usernameError}
          </p>
        )}
        {publicUrl && !usernameError && (
          <p className="text-xs text-muted-foreground">
            Your profile: <span className="font-mono text-foreground">{publicUrl}</span>
          </p>
        )}
      </div>

      {/* Bio */}
      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell others about yourself..."
          rows={3}
          maxLength={500}
        />
        <p className="text-xs text-muted-foreground text-right">{bio.length}/500</p>
      </div>

      {/* Avatar URL */}
      <div className="space-y-2">
        <Label htmlFor="avatar_url">Avatar URL</Label>
        <Input
          id="avatar_url"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://example.com/avatar.jpg"
          type="url"
        />
        <p className="text-xs text-muted-foreground">
          Enter a URL for your profile picture.
        </p>
      </div>

      <Separator />

      {/* Social links */}
      <div className="space-y-4">
        <Label className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Social Links
        </Label>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Linkedin className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
              placeholder="https://linkedin.com/in/username"
              type="url"
            />
          </div>
          <div className="flex items-center gap-2">
            <Twitter className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              value={twitter}
              onChange={(e) => setTwitter(e.target.value)}
              placeholder="https://x.com/username"
              type="url"
            />
          </div>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://yoursite.com"
              type="url"
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Preview link */}
      {publicUrl && isPublic && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm">
            Profile preview:
          </span>
          <a
            href={`/u/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            /u/{username}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSaveProfile} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Saving...
            </>
          ) : (
            'Save Profile'
          )}
        </Button>
      </div>
    </div>
  );
}
