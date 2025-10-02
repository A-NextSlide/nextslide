// Mock implementation of share service for demonstration
// This simulates the backend functionality locally

interface MockShareLink {
  id: string;
  short_code: string;
  share_type: 'view' | 'edit';
  full_url: string;
  expires_at: string | null;
  created_at: string;
  access_count: number;
  last_accessed_at: string | null;
  is_active: boolean;
  deck_uuid: string;
}

class MockShareService {
  private mockShares: Map<string, MockShareLink[]> = new Map();
  
  constructor() {
    // Load any persisted shares from localStorage
    const savedShares = localStorage.getItem('mock_deck_shares');
    if (savedShares) {
      try {
        const parsed = JSON.parse(savedShares);
        this.mockShares = new Map(Object.entries(parsed));
      } catch (e) {
        console.error('Failed to parse saved shares:', e);
      }
    }
  }
  
  private saveShares() {
    const obj = Object.fromEntries(this.mockShares);
    localStorage.setItem('mock_deck_shares', JSON.stringify(obj));
  }
  
  private generateShortCode(): string {
    // Generate 8-character code excluding ambiguous characters
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
  
  async createShareLink(deckUuid: string, request: {
    share_type: 'view' | 'edit';
    expires_in_hours?: number;
    metadata?: Record<string, any>;
  }) {
    const shortCode = this.generateShortCode();
    const now = new Date();
    const expiresAt = request.expires_in_hours 
      ? new Date(now.getTime() + request.expires_in_hours * 60 * 60 * 1000).toISOString()
      : null;
    
    const shareLink: MockShareLink = {
      id: `share_${Date.now()}`,
      short_code: shortCode,
      share_type: request.share_type,
      full_url: `/${request.share_type === 'view' ? 'p' : 'e'}/${shortCode}`,
      expires_at: expiresAt,
      created_at: now.toISOString(),
      access_count: 0,
      last_accessed_at: null,
      is_active: true,
      deck_uuid: deckUuid
    };
    
    const deckShares = this.mockShares.get(deckUuid) || [];
    deckShares.push(shareLink);
    this.mockShares.set(deckUuid, deckShares);
    this.saveShares();
    
    
    return {
      success: true,
      data: {
        id: shareLink.id,
        short_code: shareLink.short_code,
        share_type: shareLink.share_type,
        full_url: shareLink.full_url,
        expires_at: shareLink.expires_at,
        created_at: shareLink.created_at
      }
    };
  }
  
  async getShareLinks(deckUuid: string) {
    const shares = this.mockShares.get(deckUuid) || [];
    const activeShares = shares.filter(share => {
      if (!share.is_active) return false;
      if (share.expires_at) {
        const expiryDate = new Date(share.expires_at);
        if (expiryDate < new Date()) return false;
      }
      return true;
    });
    
    
    return {
      success: true,
      data: activeShares
    };
  }
  
  async revokeShareLink(shareId: string) {
    for (const [deckUuid, shares] of this.mockShares) {
      const share = shares.find(s => s.id === shareId);
      if (share) {
        share.is_active = false;
        this.saveShares();
        return { success: true, data: undefined };
      }
    }
    
    return {
      success: false,
      error: 'Share link not found'
    };
  }
  
  async getShareStatistics(shareId: string) {
    for (const shares of this.mockShares.values()) {
      const share = shares.find(s => s.id === shareId);
      if (share) {
        return {
          success: true,
          data: {
            access_count: share.access_count,
            last_accessed_at: share.last_accessed_at,
            created_at: share.created_at,
            expires_at: share.expires_at
          }
        };
      }
    }
    
    return {
      success: false,
      error: 'Share link not found'
    };
  }
  
  async addCollaborator(deckUuid: string, email: string, permissions: string[] = ['view', 'edit']) {
    // For mock, create an edit link and return in the new format
    const shareLinkResponse = await this.createShareLink(deckUuid, {
      share_type: 'edit',
      metadata: { email, permissions }
    });
    
    if (shareLinkResponse.success && shareLinkResponse.data) {
      const shareLink = shareLinkResponse.data;
      
      // Mock response matching the backend format
      return {
        success: true,
        data: {
          share_link: {
            id: shareLink.id,
            short_code: shareLink.short_code,
            share_type: shareLink.share_type,
            full_url: shareLink.full_url,
            expires_at: shareLink.expires_at,
            created_at: shareLink.created_at,
            access_count: 0,
            last_accessed_at: null,
            is_active: true
          },
          collaborator_email: email,
          collaborator_exists: false, // In mock, assume new user
          invitation_sent: true, // Mock always "sends" invite
          invitation_error: null,
          user_id: null,
          message: `Collaborator ${email} added successfully and an invitation email has been sent`
        }
      };
    }
    
    return shareLinkResponse;
  }
  
  async getPublicDeck(shortCode: string) {
    // Find the share link
    for (const [deckUuid, shares] of this.mockShares) {
      const share = shares.find(s => s.short_code === shortCode && s.is_active);
      if (share) {
        // Update access stats
        share.access_count++;
        share.last_accessed_at = new Date().toISOString();
        this.saveShares();
        
        // For mock, we'll need to get the deck data from the store
        // This would normally come from the backend
        const { deckSyncService } = await import('@/lib/deckSyncService');
        try {
          const deck = await deckSyncService.getFullDeck(deckUuid);
          
          return {
            success: true,
            data: {
              deck: {
                ...deck,
                read_only: share.share_type === 'view'
              },
              share_info: {
                share_type: share.share_type,
                accessed_at: new Date().toISOString()
              },
              is_editable: share.share_type === 'edit',
              access_recorded: true
            }
          };
        } catch (error) {
          console.error('[MockShareService] Error loading deck:', error);
          return {
            success: false,
            error: 'Deck not found'
          };
        }
      }
    }
    
    return {
      success: false,
      error: 'Share link not found or expired'
    };
  }
  
  async duplicatePublicDeck(shortCode: string) {
    // For mock, create a new deck ID
    const deckId = `deck_${Date.now()}`;
    
    return {
      success: true,
      data: { deck_id: deckId }
    };
  }
  
  getShareUrl(shortCode: string, shareType: 'view' | 'edit'): string {
    const baseUrl = window.location.origin;
    const path = shareType === 'view' ? `/p/${shortCode}` : `/e/${shortCode}`;
    return `${baseUrl}${path}`;
  }
}

export const mockShareService = new MockShareService(); 