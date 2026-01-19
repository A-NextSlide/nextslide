/**
 * Teams API Service
 *
 * Handles all team-related API calls:
 * - Team CRUD operations
 * - Team member management
 * - Invitations
 */

import { authService } from './authService';

// Remove trailing /api if present since we add it in the endpoints
// Use empty string in dev so relative URLs work with the proxy from any device
const rawApiBase = import.meta.env.VITE_API_URL || '';
const API_BASE = rawApiBase.replace(/\/api\/?$/, '');

// Types
export interface Team {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  role?: 'owner' | 'admin' | 'member';
}

export interface TeamMember {
  user_id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  token: string;
  team_id: string;
  invited_by_user_id: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface CreateTeamRequest {
  name: string;
}

export interface InviteMemberRequest {
  email: string;
  role: 'admin' | 'member';
}

export interface UpdateMemberRequest {
  role: 'owner' | 'admin' | 'member';
}

class TeamsApi {
  private getHeaders(): Record<string, string> {
    let token: string | null = null;
    try {
      token = authService.getAuthToken();
    } catch (e) {
      console.warn('[TeamsApi] Failed to get auth token:', e);
    }
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private async safeJsonParse<T>(response: Response): Promise<T> {
    const text = await response.text();
    if (!text || !text.trim()) throw new Error('Empty response');
    return JSON.parse(text);
  }

  // Team CRUD
  async createTeam(name: string): Promise<Team> {
    const response = await fetch(`${API_BASE}/api/teams`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Failed to create team');
    }
    return this.safeJsonParse(response);
  }

  async listTeams(): Promise<Team[]> {
    const response = await fetch(`${API_BASE}/api/teams`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch teams');
    return this.safeJsonParse(response);
  }

  async getTeam(teamId: string): Promise<Team> {
    const response = await fetch(`${API_BASE}/api/teams/${teamId}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch team');
    return this.safeJsonParse(response);
  }

  async updateTeam(teamId: string, name: string): Promise<Team> {
    const response = await fetch(`${API_BASE}/api/teams/${teamId}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error('Failed to update team');
    return this.safeJsonParse(response);
  }

  async deleteTeam(teamId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/teams/${teamId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to delete team');
  }

  // Team Members
  async listMembers(teamId: string): Promise<TeamMember[]> {
    const response = await fetch(`${API_BASE}/api/teams/${teamId}/members`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch team members');
    return this.safeJsonParse(response);
  }

  async addMember(teamId: string, email: string, role: 'admin' | 'member' = 'member'): Promise<{ user_id?: string; invitation_id?: string; token?: string; role: string }> {
    const response = await fetch(`${API_BASE}/api/teams/${teamId}/members`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ email, role }),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Failed to add member');
    }
    return this.safeJsonParse(response);
  }

  async updateMemberRole(teamId: string, userId: string, role: 'owner' | 'admin' | 'member'): Promise<void> {
    const response = await fetch(`${API_BASE}/api/teams/${teamId}/members/${userId}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify({ role }),
    });
    if (!response.ok) throw new Error('Failed to update member role');
  }

  async removeMember(teamId: string, userId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/teams/${teamId}/members/${userId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to remove member');
  }

  // Invitations
  async createInvitation(teamId: string, email: string, role: 'admin' | 'member' = 'member'): Promise<{ invitation_id: string; token: string }> {
    const response = await fetch(`${API_BASE}/api/teams/${teamId}/invitations`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ email, role }),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Failed to create invitation');
    }
    return this.safeJsonParse(response);
  }

  async acceptInvitation(token: string): Promise<{ message: string; team_id: string }> {
    const response = await fetch(`${API_BASE}/api/teams/invitations/${token}/accept`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Failed to accept invitation');
    }
    return this.safeJsonParse(response);
  }

  // Get pending invitations for a team (not implemented in backend yet, but useful)
  async listInvitations(teamId: string): Promise<Invitation[]> {
    const response = await fetch(`${API_BASE}/api/teams/${teamId}/invitations`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      // If endpoint doesn't exist yet, return empty array
      if (response.status === 404) return [];
      throw new Error('Failed to fetch invitations');
    }
    return this.safeJsonParse(response);
  }

  async cancelInvitation(teamId: string, invitationId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/teams/${teamId}/invitations/${invitationId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Failed to cancel invitation');
    }
  }

  async resendInvitation(teamId: string, email: string, role: 'admin' | 'member' = 'member'): Promise<{ invitation_id: string; token: string }> {
    // Cancel any existing invitation for this email, then create a new one
    return this.createInvitation(teamId, email, role);
  }
}

export const teamsApi = new TeamsApi();
