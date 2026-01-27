/**
 * Format tool/skill names for display
 * Shows actual tool names instead of random "fun" phrases
 */

// Human-readable labels for common tools (no randomization)
const TOOL_LABELS: Record<string, string> = {
  // Status events
  'agent.verifying': 'Verifying updates',
  'agent.verification_warning': 'Found issue',

  // Tool names - use actual descriptive names
  'custom_component_str_replace': 'Editing component',
  'custom_component_rewrite': 'Rewriting component',
  'apply_theme_to_custom_components': 'Applying theme',
  'apply_theme': 'Applying theme',
  'edit_slide': 'Editing slide',
  'create_slide': 'Creating slide',
  'delete_slide': 'Deleting slide',
  'search_images': 'Searching images',
  'edit_image_with_ai': 'Editing image with AI',
  'replace_image': 'Replacing image',
  'view_component': 'Viewing component',
  'edit_component': 'Editing component',
  'component_prop_update': 'Updating props',
  'duplicate_slide': 'Duplicating slide',
  'reorder_slides': 'Reordering slides',
  'create_component': 'Creating component',
  'delete_component': 'Deleting component',
  'web_search': 'Searching web',
  'linkedin_lookup': 'Looking up LinkedIn',
  'analyze_slide': 'Analyzing slide',
};

/**
 * Get a human-readable name for a tool
 * Returns actual tool name, not random phrases
 */
export function getFunToolName(tool: string): string {
  // Check for direct label mapping
  const label = TOOL_LABELS[tool];
  if (label) {
    return label;
  }

  // Format unknown tools: replace underscores/dots with spaces, capitalize
  return tool
    .replace(/_/g, ' ')
    .replace(/\./g, ' › ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Format skill name for display
 */
export function formatSkillName(skill: string): string {
  const skillLabels: Record<string, string> = {
    'text_edit': 'Text Edit',
    'slide_delete': 'Slide Delete',
    'slide_create': 'Slide Create',
    'image_edit': 'Image Edit',
    'theme_edit': 'Theme Edit',
    'chat': 'Chat',
    'layout_edit': 'Layout Edit',
  };

  return skillLabels[skill] || skill.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Format model name for display
 */
export function formatModelName(model: string): string {
  if (!model) return '';
  // Shorten common model names
  if (model.includes('gemini')) return 'Gemini';
  if (model.includes('claude')) return 'Claude';
  if (model.includes('gpt')) return 'GPT';
  return model;
}
