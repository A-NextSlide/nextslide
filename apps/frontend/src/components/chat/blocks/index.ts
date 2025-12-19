/**
 * Chat Block Components
 * Rich, interactive components that appear inline in chat
 * Scalable architecture for future chat artifacts
 */

export { default as ChatBlockContainer } from './ChatBlockContainer';
export { default as ThemeChatBlock } from './ThemeChatBlock';
export type { ThemeBlockData } from './ThemeChatBlock';
export { default as DropdownOutlineChatBlock } from './DropdownOutlineChatBlock';
export type { DropdownOutlineBlockData } from './DropdownOutlineChatBlock';
export type { OutlineSlide as DropdownOutlineSlide } from './DropdownOutlineChatBlock';

// Generic integration blocks (scalable architecture)
export { default as IntegrationResultsBlock } from './IntegrationResultsBlock';
export type { IntegrationResult, IntegrationResultsBlockProps } from './IntegrationResultsBlock';
export { default as IntegrationResultCard } from './IntegrationResultCard';
export type { IntegrationResultCardProps } from './IntegrationResultCard';

// LinkedIn integration blocks (built on generic blocks)
export { default as LinkedInProfileCard } from './LinkedInProfileCard';
export type { LinkedInProfile, LinkedInProfileCardProps } from './LinkedInProfileCard';
export { default as LinkedInSearchResults } from './LinkedInSearchResults';
export type { LinkedInSearchResultsProps } from './LinkedInSearchResults';
