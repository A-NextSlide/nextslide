import './utils/consoleSuppressor'; // Initialize console suppressor first
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './components/ColorPickerStyles.css'
import './styles/presentation.css'
import { useEditorSettingsStore } from '@/stores/editorSettingsStore'
import { configureLogging, enableRegistryLogsOnly, LogLevel } from '@/utils/logging'
import { setupGlobalErrorHandlers } from '@/utils/errorHandler'
import { initializeStorage } from '@/integrations/supabase/client'
import { BROWSER } from '@/utils/browser'

// Configure logging to suppress all logs as early as possible
configureLogging({
  globalLevel: LogLevel.NONE,
  useColors: false
});

// Set up global error handlers before any runtime logging
setupGlobalErrorHandlers();

// Add browser classes for CSS overrides (e.g., disable heavy effects on Safari/Firefox)
try {
  const root = document.documentElement;
  if (BROWSER.isSafari) root.classList.add('safari');
  if (BROWSER.isFirefox) root.classList.add('firefox');
  if (BROWSER.isChrome) root.classList.add('chrome');
} catch {}

// Removed font optimization test utilities
if (import.meta.env.DEV) {
  import('./utils/authDebug');
  import('./utils/debugFetch');
  import('./utils/quickAuthCheck');
  import('./utils/testDeckLoading');
  import('./utils/testImageCaching');
  import('./utils/testCustomComponentOptimization');
}

// Remove font optimization; keep slide completion handler if used for other flows
import { SlideCompletionHandler } from './services/SlideCompletionHandler';
import { CustomComponentOptimizationService } from './services/CustomComponentOptimizationService';

// Initialize slide completion handler FIRST to ensure status updates
SlideCompletionHandler.getInstance().initialize();

// Font optimization removed

// Set up custom component optimization
try {
  console.warn('[Main] Setting up custom component optimization...');
  CustomComponentOptimizationService.setupAutoOptimization();
  console.warn('[Main] Custom component optimization setup complete');
} catch (error) {
  console.error('[Main] Failed to setup custom component optimization:', error);
}

// Initialize Supabase storage bucket (if needed)
initializeStorage()

// console.log('Rendering app...');

// TEMPORARY: To debug duplicate deck generation, you can disable StrictMode
// by commenting out the React.StrictMode wrapper below and using just <App />
// StrictMode causes components to render twice in development which can trigger
// duplicate API calls if not properly guarded.
const DISABLE_STRICT_MODE = true; // Temporarily disabled to fix duplicate generation

createRoot(document.getElementById('root')!).render(
  DISABLE_STRICT_MODE ? (
    <App />
  ) : (
    // React.StrictMode helps detect problems but causes double-rendering in development
    // This can lead to duplicate API calls if effects are not properly handled
    // Comment out StrictMode temporarily if you need to debug API call issues
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
)
