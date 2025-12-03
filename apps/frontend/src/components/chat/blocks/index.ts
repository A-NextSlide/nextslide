/**
 * Chat Block Components
 * Rich, interactive components that appear inline in chat
 * Scalable architecture for future chat artifacts
 */

export { default as ChatBlockContainer } from './ChatBlockContainer';
export { default as ThemeChatBlock } from './ThemeChatBlock';
export type { ThemeBlockData } from './ThemeChatBlock';
export { default as OutlineChatBlock } from './OutlineChatBlock';
export type { OutlineBlockData, OutlineSlide } from './OutlineChatBlock';
export { default as DropdownOutlineChatBlock } from './DropdownOutlineChatBlock';
export type { DropdownOutlineBlockData } from './DropdownOutlineChatBlock';
export type { OutlineSlide as DropdownOutlineSlide } from './DropdownOutlineChatBlock';
