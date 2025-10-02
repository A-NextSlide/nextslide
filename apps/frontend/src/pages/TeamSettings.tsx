import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Users, Shield, UserPlus, X } from 'lucide-react';

type TeamMember = { email: string; role: 'admin' | 'member' };

const TEAM_KEY = 'team_members';

const TeamSettings: React.FC = () => {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'member'>('member');
  const selfEmail = (user?.email || '').toLowerCase();

  const isSelfAdmin = useMemo(() => {
    try {
      const raw = localStorage.getItem(TEAM_KEY);
      if (!raw) return true; // default to admin if no team yet
      const team = JSON.parse(raw) as TeamMember[];
      const me = team.find(m => m.email.toLowerCase() === selfEmail);
      return (me?.role || 'admin') === 'admin';
    } catch {
      return true;
    }
  }, [selfEmail]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TEAM_KEY);
      if (raw) {
        setMembers(JSON.parse(raw));
      } else if (selfEmail) {
        // seed with self as admin if empty
        const seed = [{ email: selfEmail, role: 'admin' as const }];
        setMembers(seed);
        localStorage.setItem(TEAM_KEY, JSON.stringify(seed));
      }
    } catch {}
  }, [selfEmail]);

  const persist = (list: TeamMember[]) => {
    setMembers(list);
    try { localStorage.setItem(TEAM_KEY, JSON.stringify(list)); } catch {}
  };

  const addMember = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    if (members.some(m => m.email.toLowerCase() === email)) return;
    const updated = [...members, { email, role: newRole }];
    persist(updated);
    setNewEmail('');
  };

  const removeMember = (email: string) => {
    const lower = email.toLowerCase();
    // prevent removing self if last admin
    const isRemovingSelf = lower === selfEmail;
    const admins = members.filter(m => m.role === 'admin');
    if (isRemovingSelf && admins.length <= 1) return;
    persist(members.filter(m => m.email.toLowerCase() !== lower));
  };

  const updateRole = (email: string, role: 'admin' | 'member') => {
    const lower = email.toLowerCase();
    const updated = members.map(m => m.email.toLowerCase() === lower ? { ...m, role } : m);
    // ensure at least one admin remains
    if (!updated.some(m => m.role === 'admin')) return;
    persist(updated);
  };

  return (
    <div className="min-h-screen bg-[#F5F5DC] dark:bg-zinc-900">
      <div className="bg-white dark:bg-zinc-950 border-b">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold flex items-center gap-2"><Users size={16} /> Team Settings</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <Card className="bg-white dark:bg-zinc-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shield size={16} /> Members</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs">Email</Label>
                <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="teammate@example.com" />
              </div>
              <div>
                <Label className="text-xs">Role</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as 'admin' | 'member')}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="h-9" onClick={addMember} disabled={!isSelfAdmin || !newEmail.trim()}>
                <UserPlus size={14} className="mr-2" /> Add
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              {members.map(m => (
                <div key={m.email} className="flex items-center justify-between p-3 rounded border">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-[#FF4301]/10 text-[#FF4301] flex items-center justify-center text-xs font-medium">
                      {m.email.substring(0,2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{m.email}</div>
                      <div className="text-[11px] text-muted-foreground">{m.email.toLowerCase() === selfEmail ? 'You' : ''}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={m.role} onValueChange={(v) => isSelfAdmin && updateRole(m.email, v as any)} disabled={!isSelfAdmin}>
                      <SelectTrigger className="w-[120px] h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <Badge variant={m.role === 'admin' ? 'default' : 'secondary'} className="text-[10px] h-5">{m.role}</Badge>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeMember(m.email)} disabled={!isSelfAdmin}>
                      <X size={14} />
                    </Button>
                  </div>
                </div>
              ))}
              {members.length === 0 && (
                <div className="text-sm text-muted-foreground">No team members yet.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TeamSettings;


