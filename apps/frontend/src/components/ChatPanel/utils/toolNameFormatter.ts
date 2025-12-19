const FUN_TOOL_NAMES: Record<string, string[]> = {
  'custom_component_str_replace': [
    'Making a quick tweak',
    'Sprucing up the content',
    'Polishing the details',
    'Touching things up',
  ],
  'custom_component_rewrite': [
    'Giving it a fresh look',
    'Reworking the design',
    'Shaking things up',
    'Breathing new life into it',
  ],
  'apply_theme_to_custom_components': [
    'Spreading the style love',
    'Making everything match',
    'Syncing up the styles',
    'Painting with your palette',
  ],
  'apply_theme': [
    'Setting the mood',
    'Dressing things up',
    'Adding some flair',
    'Styling it out',
  ],
  'edit_slide': [
    'Working on your slide',
    'Giving it some attention',
    'Spicing things up',
    'Making it shine',
  ],
  'create_slide': [
    'Crafting a new slide',
    'Spinning up fresh content',
    'Building something new',
    'Whipping up a slide',
  ],
  'delete_slide': [
    'Tidying up the deck',
    'Clearing that out',
    'Making some room',
  ],
  'search_images': [
    'Hunting for the perfect image',
    'Scouting some visuals',
    'Finding you something nice',
    'Browsing the gallery',
  ],
  'edit_image_with_ai': [
    'Working some AI magic',
    'Transforming your image',
    'Giving the image a makeover',
    'Letting AI do its thing',
  ],
  'replace_image': [
    'Swapping in a new image',
    'Freshening up the visuals',
    'Switching things out',
  ],
  'view_component': [
    'Taking a closer look',
    'Scoping out the details',
    'Checking things out',
  ],
  'edit_component': [
    'Fine-tuning the element',
    'Tweaking the details',
    'Making some adjustments',
  ],
  'component_prop_update': [
    'Dialing in the settings',
    'Adjusting the knobs',
    'Fine-tuning things',
  ],
  'duplicate_slide': [
    'Making a copy',
    'Cloning the slide',
    'Doubling up',
  ],
  'reorder_slides': [
    'Shuffling things around',
    'Rearranging the deck',
    'Finding the right order',
  ],
  'create_component': [
    'Adding something new',
    'Dropping in an element',
    'Building a new piece',
  ],
  'delete_component': [
    'Clearing that out',
    'Tidying things up',
    'Making some space',
  ],
};

export function getFunToolName(tool: string): string {
  const variations = FUN_TOOL_NAMES[tool];
  if (variations && variations.length > 0) {
    return variations[Math.floor(Math.random() * variations.length)];
  }
  return tool.replace(/_/g, ' ').replace(/\./g, ' › ');
}
