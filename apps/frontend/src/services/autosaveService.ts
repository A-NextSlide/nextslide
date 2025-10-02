import { versionHistoryService } from '@/lib/versionHistoryService';
import { useDeckStore } from '@/stores/deckStore';
import { supabase } from '@/integrations/supabase/client';

export class AutosaveService {
  private autosaveInterval: NodeJS.Timeout | null = null;
  private lastSaveHash: string | null = null;
  private isAutosaving = false;
  private autosaveIntervalMs = 5 * 60 * 1000; // 5 minutes

  /**
   * Start autosaving for a deck
   */
  startAutosave(getDeckState: () => ReturnType<typeof useDeckStore.getState>) {
    this.stopAutosave(); // Clear any existing interval

    // Initial save after 1 minute to capture early changes
    setTimeout(() => {
      this.performAutosave(getDeckState);
    }, 60 * 1000);

    // Then save every 5 minutes
    this.autosaveInterval = setInterval(() => {
      this.performAutosave(getDeckState);
    }, this.autosaveIntervalMs);
  }

  /**
   * Stop autosaving
   */
  stopAutosave() {
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
      this.autosaveInterval = null;
    }
  }

  /**
   * Perform an autosave
   */
  private async performAutosave(getDeckState: () => ReturnType<typeof useDeckStore.getState>) {
    if (this.isAutosaving) return; // Prevent concurrent autosaves

    try {
      this.isAutosaving = true;
      const state = getDeckState();
      const { deckData } = state;

      if (!deckData?.uuid) return;

      // Create a hash of the current state to detect changes
      const currentData = {
        ...deckData,
        slides: deckData.slides || []
      };
      const currentHash = this.hashDeckData(currentData);

      // Skip if nothing has changed
      if (currentHash === this.lastSaveHash) {
              return;
      }

  

      // Get user info for the save
      const { data: { user } } = await supabase.auth.getUser();

      // TEMPORARILY DISABLED: Version creation causing infinite recursion in RLS policies
      // TODO: Re-enable once RLS policies are fixed
      const versionId = null;
      /*
      const versionId = await versionHistoryService.createVersion(
        deckData.uuid,
        `Autosave ${new Date().toLocaleTimeString()}`,
        {
          description: 'Automatic save',
          isAutoSave: true,
          deckData: currentData,
          notes: `Autosaved at ${new Date().toLocaleString()}`
        }
      );
      */

      // Update tracking info
      this.lastSaveHash = currentHash;

    } catch (error) {
      console.error('[Autosave] Error during autosave:', error);
    } finally {
      this.isAutosaving = false;
    }
  }

  /**
   * Force an immediate autosave
   */
  async forceAutosave(getDeckState: () => ReturnType<typeof useDeckStore.getState>) {
    await this.performAutosave(getDeckState);
  }

  /**
   * Generate a hash of deck data to detect changes
   */
  private hashDeckData(data: any): string {
    // Simple JSON stringification for now
    // Could use a proper hash function for better performance
    return JSON.stringify({
      name: data.name,
      slides: data.slides?.map((s: any) => ({
        id: s.id,
        title: s.title,
        components: s.components?.map((c: any) => ({
          id: c.id,
          type: c.type,
          props: c.props
        }))
      }))
    });
  }

  /**
   * Clean up old autosaves, keeping only the most recent ones
   */
  private async cleanupOldAutosaves(deckId: string): Promise<void> {
    try {
      const allVersions = await versionHistoryService.getVersionHistory(deckId);
      
      // Filter autosave versions
      const autosaves = allVersions
        .filter(v => v.is_auto_save === true)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      // Keep only the most recent autosaves
      const maxAutosaves = 10; // Keep last 10 autosaves
      if (autosaves.length > maxAutosaves) {
        const idsToDelete = autosaves.slice(maxAutosaves).map(v => v.id);
        
        // Delete old autosaves
        for (const id of idsToDelete) {
          await versionHistoryService.deleteVersion(id);
        }
      }
    } catch (error) {
      // Silently fail cleanup - not critical
    }
  }

  /**
   * Get autosave status
   */
  getAutosaveStatus() {
    return {
      isRunning: this.autosaveInterval !== null,
      isCurrentlySaving: this.isAutosaving,
      intervalMs: this.autosaveIntervalMs
    };
  }

  /**
   * Update autosave interval
   */
  setAutosaveInterval(minutes: number) {
    this.autosaveIntervalMs = minutes * 60 * 1000;
    
    // Restart autosave with new interval if it's running
    if (this.autosaveInterval) {
      const getDeckState = () => (window as any).__deckStore?.getState();
      if (getDeckState) {
        this.startAutosave(getDeckState);
      }
    }
  }
}

// Export singleton instance
export const autosaveService = new AutosaveService(); 