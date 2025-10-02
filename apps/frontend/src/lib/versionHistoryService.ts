import { supabase } from '../integrations/supabase/client';
import { CompleteDeckData } from '../types/DeckTypes';
import { DeckVersion, VersionDiff } from '../types/VersionTypes';
import { v4 as uuidv4 } from 'uuid';

export class VersionHistoryService {
  /**
   * Creates a new version of a deck
   */
  async createVersion(deckId: string, versionName: string, options: {
    description?: string;
    isAutoSave?: boolean;
    deckData: CompleteDeckData;
    parentVersionId?: string;
    bookmarked?: boolean;
    notes?: string;
  }): Promise<string> {
    const {
      description = null,
      isAutoSave = false,
      deckData,
      parentVersionId = null,
      bookmarked = false,
      notes = null
    } = options;
    
    try {
      // Get the current highest version number
      const { data: versions, error: countError } = await supabase
        .from('deck_versions')
        .select('version_number')
        .eq('deck_id', deckId)
        .order('version_number', { ascending: false })
        .limit(1);
      
      if (countError) {
        console.error('Error getting highest version number:', countError);
        throw countError;
      }
      
      const nextVersionNumber = versions && versions.length > 0 ? versions[0].version_number + 1 : 1;
      const versionId = uuidv4();
      
      // Create the version record
      const { data, error } = await supabase
        .from('deck_versions')
        .insert({
          id: versionId,
          deck_id: deckId,
          version_name: versionName,
          version_number: nextVersionNumber,
          data: deckData,
          created_at: new Date().toISOString(),
          is_auto_save: isAutoSave,
          parent_version_id: parentVersionId,
          metadata: {
            description,
            tags: [],
            thumbnail_url: null,
            bookmarked,
            notes
          }
        });
      
      if (error) {
        console.error('Error creating version:', error);
        throw error;
      }
      
      return versionId;
    } catch (error) {
      console.error('Failed to create version:', error);
      throw error;
    }
  }
  
  /**
   * Gets a specific version by ID
   */
  async getVersion(versionId: string): Promise<DeckVersion | null> {
    try {
      const { data, error } = await supabase
        .from('deck_versions')
        .select('*')
        .eq('id', versionId)
        .single();
      
      if (error) {
        console.error(`Error fetching version ${versionId}:`, error);
        return null;
      }
      
      return data;
    } catch (error) {
      console.error(`Failed to fetch version ${versionId}:`, error);
      return null;
    }
  }
  
  /**
   * Gets all versions for a deck
   */
  async getVersionHistory(deckId: string): Promise<DeckVersion[]> {
    try {
      const { data, error } = await supabase
        .from('deck_versions')
        .select('*')
        .eq('deck_id', deckId)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error(`Error fetching version history for deck ${deckId}:`, error);
        return [];
      }
      
      // Sort versions with bookmarked ones first, then by created date
      const sortedData = data ? [...data].sort((a, b) => {
        const aBookmarked = a.metadata?.bookmarked || false;
        const bBookmarked = b.metadata?.bookmarked || false;
        
        if (aBookmarked && !bBookmarked) return -1;
        if (!aBookmarked && bBookmarked) return 1;
        
        // If bookmark status is the same, sort by date (newest first)
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }) : [];
      
      return sortedData;
    } catch (error) {
      console.error(`Failed to fetch version history for deck ${deckId}:`, error);
      return [];
    }
  }
  
  /**
   * Compares two versions and returns the differences
   */
  async compareVersions(versionId1: string, versionId2: string): Promise<VersionDiff> {
    try {
      // Get both versions
      const [version1, version2] = await Promise.all([
        this.getVersion(versionId1),
        this.getVersion(versionId2)
      ]);
      
      if (!version1 || !version2) {
        throw new Error('One or both versions not found');
      }
      
      const deck1 = version1.data;
      const deck2 = version2.data;
      
      // Compare slides
      const slideIds1 = new Set(deck1.slides.map(s => s.id));
      const slideIds2 = new Set(deck2.slides.map(s => s.id));
      
      const addedSlides = deck2.slides
        .filter(s => !slideIds1.has(s.id))
        .map(s => s.id);
      
      const removedSlides = deck1.slides
        .filter(s => !slideIds2.has(s.id))
        .map(s => s.id);
      
      // Find modified slides
      const modifiedSlides = [];
      for (const slide1 of deck1.slides) {
        // Skip if slide was removed
        if (removedSlides.includes(slide1.id)) continue;
        
        // Find corresponding slide in deck2
        const slide2 = deck2.slides.find(s => s.id === slide1.id);
        if (!slide2) continue;
        
        // Compare components
        const componentIds1 = new Set((slide1.components || []).map(c => c.id));
        const componentIds2 = new Set((slide2.components || []).map(c => c.id));
        
        const addedComponents = (slide2.components || [])
          .filter(c => !componentIds1.has(c.id))
          .map(c => c.id);
        
        const removedComponents = (slide1.components || [])
          .filter(c => !componentIds2.has(c.id))
          .map(c => c.id);
        
        // Find modified components
        const modifiedComponents = [];
        for (const comp1 of (slide1.components || [])) {
          // Skip if component was removed
          if (removedComponents.includes(comp1.id)) continue;
          
          // Find corresponding component in slide2
          const comp2 = (slide2.components || []).find(c => c.id === comp1.id);
          if (!comp2) continue;
          
          // Compare props
          if (JSON.stringify(comp1.props) !== JSON.stringify(comp2.props)) {
            modifiedComponents.push(comp1.id);
          }
        }
        
        // Add slide to modified list if there are any differences
        if (addedComponents.length > 0 || removedComponents.length > 0 || modifiedComponents.length > 0) {
          modifiedSlides.push({
            slideId: slide1.id,
            addedComponents,
            removedComponents,
            modifiedComponents
          });
        }
      }
      
      // Compare deck properties
      const deckPropertyChanges = [];
      for (const key of Object.keys(deck1)) {
        // Skip slides since we already compared them
        if (key === 'slides') continue;
        
        // Check if property exists in both and is different
        if (key in deck2 && JSON.stringify(deck1[key]) !== JSON.stringify(deck2[key])) {
          deckPropertyChanges.push(key);
        }
      }
      
      return {
        addedSlides,
        removedSlides,
        modifiedSlides,
        deckPropertyChanges
      };
    } catch (error) {
      console.error(`Failed to compare versions ${versionId1} and ${versionId2}:`, error);
      throw error;
    }
  }
  
  /**
   * Updates a version's metadata
   */
  async updateVersionMetadata(versionId: string, updates: {
    name?: string;
    description?: string;
    bookmarked?: boolean;
    notes?: string;
  }): Promise<boolean> {
    try {
      // First get the current version to update properly
      const version = await this.getVersion(versionId);
      if (!version) {
        console.error(`Version ${versionId} not found for updating metadata`);
        return false;
      }
      
      // Prepare the update object
      const updateData: any = {};
      
      // Update name if provided
      if (updates.name) {
        updateData.version_name = updates.name;
      }
      
      // Update metadata if needed
      const updatedMetadata = { ...version.metadata };
      
      if (updates.description !== undefined) {
        updatedMetadata.description = updates.description;
      }
      
      if (updates.bookmarked !== undefined) {
        updatedMetadata.bookmarked = updates.bookmarked;
      }
      
      updateData.metadata = updatedMetadata;
      
      // Only proceed if we have something to update
      if (Object.keys(updateData).length === 0) {
        return true; // Nothing to update
      }
      
      // Perform the update
      const { error } = await supabase
        .from('deck_versions')
        .update(updateData)
        .eq('id', versionId);
      
      if (error) {
        console.error(`Error updating version ${versionId} metadata:`, error);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error(`Failed to update version ${versionId} metadata:`, error);
      return false;
    }
  }

  /**
   * Deletes a version
   */
  async deleteVersion(versionId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('deck_versions')
        .delete()
        .eq('id', versionId);
      
      if (error) {
        console.error(`Error deleting version ${versionId}:`, error);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error(`Failed to delete version ${versionId}:`, error);
      return false;
    }
  }
}

export const versionHistoryService = new VersionHistoryService();