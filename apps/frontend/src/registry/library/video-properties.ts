import { Type } from '@sinclair/typebox';
import { UIProperty } from '../schemas';
import { ObjectFitProperty } from './image-properties';

/**
 * Video Properties Library
 * 
 * Common video property definitions for component schemas
 */

/**
 * Video source URL property
 */
export const VideoSourceUrlProperty = UIProperty(Type.String(), {
  control: 'input',
  label: 'URL',
  description: 'URL to the video source'
});

/**
 * Video poster image URL property
 */
export const PosterUrlProperty = UIProperty(Type.String(), {
  control: 'input',
  label: 'Poster Image URL',
  description: 'Image displayed before video starts playing'
});

/**
 * Video autoplay property
 */
export const AutoplayProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Autoplay',
  description: 'Automatically start playing when component loads'
});

/**
 * Video controls property
 */
export const ControlsProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Show Controls',
  description: 'Show or hide video player controls'
});

/**
 * Video loop property
 */
export const LoopProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Loop',
  description: 'Continuously replay video when it reaches the end'
});

/**
 * Video muted property
 */
export const MutedProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Muted',
  description: 'Play video without sound'
}); 