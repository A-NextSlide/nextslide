import { create } from 'zustand';

// Define the store state interface for editor settings
interface EditorSettingsState {
  isSnapEnabled: boolean; // Global snap setting
  isTextEditing: boolean; // Tracks if text is currently being edited
  zoomLevel: number; // Zoom level for the slide viewport (percentage)
  
  // Image cropping mode
  isCroppingImage: boolean;
  croppingComponentId: string | null;

  // Editor settings functions
  toggleSnap: () => void;
  setTextEditing: (isEditing: boolean) => void;
  setZoomLevel: (level: number) => void;
  
  // Image cropping controls
  startImageCrop: (componentId: string) => void;
  stopImageCrop: () => void;
}

// Create and export the editor settings store
export const useEditorSettingsStore = create<EditorSettingsState>((set) => ({
  // Initial state
  isSnapEnabled: true, // Snap is enabled by default
  isTextEditing: false, // Text editing mode is disabled by default
  zoomLevel: 100, // Default zoom level is 100%
  isCroppingImage: false,
  croppingComponentId: null,

  // Toggle snap setting
  toggleSnap: () => set(state => ({ isSnapEnabled: !state.isSnapEnabled })),

  // Set text editing mode
  setTextEditing: (isEditing: boolean) => set({ isTextEditing: isEditing }),

  // Set zoom level
  setZoomLevel: (level: number) => set({ zoomLevel: level }),
  
  // Cropping controls
  startImageCrop: (componentId: string) => set({ isCroppingImage: true, croppingComponentId: componentId }),
  stopImageCrop: () => set({ isCroppingImage: false, croppingComponentId: null })
})); 