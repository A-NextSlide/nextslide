import { Type } from '@sinclair/typebox';
import { UIProperty, UIEnum, UIObject } from '../schemas';

/**
 * Image Properties Library
 * 
 * Common image property definitions for component schemas
 * Includes support for media tagging and AI interpretation
 */

/**
 * Object fit options
 */
export const OBJECT_FIT_OPTIONS = {
  cover: 'cover',
  contain: 'contain',
  fill: 'fill',
  none: 'none',
  'scale-down': 'scale-down'
};

/**
 * Image size options for backgrounds
 */
export const IMAGE_SIZE_OPTIONS = {
  cover: 'cover',
  contain: 'contain',
  auto: 'auto'
};

/**
 * Image repeat options
 */
export const IMAGE_REPEAT_OPTIONS = {
  'no-repeat': 'no-repeat',
  repeat: 'repeat',
  'repeat-x': 'repeat-x',
  'repeat-y': 'repeat-y'
};

/**
 * Object fit property
 */
export const ObjectFitProperty = UIEnum("Object Fit", OBJECT_FIT_OPTIONS, "Controls how the content fills the component dimensions", {
  control: 'dropdown',
  label: 'Object Fit',
});

/**
 * Image size property for backgrounds
 */
export const BackgroundImageSizeProperty = UIEnum("Background Image Size", IMAGE_SIZE_OPTIONS, "How the background image should be sized", {
  control: 'dropdown',
  label: 'Image Size',
});

/**
 * Image repeat property for backgrounds
 */
export const BackgroundImageRepeatProperty = UIEnum("Background Image Repeat", IMAGE_REPEAT_OPTIONS, "How the background image should repeat", {
  control: 'dropdown',
  label: 'Image Repeat',
});

/**
 * Image source URL property
 */
export const ImageSourceUrlProperty = UIProperty(Type.String(), {
  control: 'input',
  label: 'URL',
  description: 'URL to the image source'
});

/**
 * Background image URL property
 */
export const BackgroundImageUrlProperty = UIProperty(Type.String(), { 
  control: 'input',
  label: 'Image URL',
  description: 'URL of the background image',
});

/**
 * Background image opacity property
 */
export const BackgroundImageOpacityProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Image Opacity',
  description: 'Transparency level of the background image',
  controlProps: {
    min: 0,
    max: 1,
    step: 0.01
  }
});

/**
 * Alt text property
 */
export const AltTextProperty = UIProperty(Type.String(), {
  control: 'input',
  label: 'Alt Text',
  description: 'Alternative text for accessibility'
});

/**
 * Media source ID property - used to track the original media
 */
export const MediaSourceIdProperty = UIProperty(Type.String(), {
  control: 'input',
  label: 'Media Source ID',
  description: 'ID of the original tagged media',
  advanced: true,
  hidden: true, // Hidden from the UI but stored in the component
});

/**
 * Original filename property
 */
export const OriginalFilenameProperty = UIProperty(Type.String(), {
  control: 'input',
  label: 'Original Filename',
  description: 'Original filename of the uploaded media',
  advanced: true,
  hidden: true, // Hidden from the UI but stored in the component
});

/**
 * AI interpretation property
 */
export const AIInterpretationProperty = UIProperty(Type.String(), {
  control: 'textarea',
  label: 'AI Interpretation',
  description: 'AI-generated description or analysis of the image content',
  advanced: true,
});

/**
 * Media slide association property
 */
export const MediaSlideIdProperty = UIProperty(Type.String(), {
  control: 'input',
  label: 'Associated Slide',
  description: 'ID of the slide this media is associated with',
  advanced: true,
  hidden: true, // Hidden from the UI but stored in the component
}); 