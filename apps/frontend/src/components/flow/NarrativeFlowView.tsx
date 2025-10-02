import React from 'react';
import { NarrativeFlow } from '@/types/SlideTypes';
import { Book, Target, Lightbulb, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NarrativeFlowViewProps {
  narrativeFlow: NarrativeFlow;
  className?: string;
}

export const NarrativeFlowView: React.FC<NarrativeFlowViewProps> = ({
  narrativeFlow,
  className
}) => {
  const getImportanceColor = (importance: string) => {
    switch (importance) {
      case 'high': return 'text-red-600 dark:text-red-400';
      case 'medium': return 'text-amber-600 dark:text-amber-400';
      case 'low': return 'text-gray-600 dark:text-gray-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300';
      case 'medium': return 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300';
      case 'low': return 'bg-gray-100 dark:bg-gray-900/20 text-gray-700 dark:text-gray-300';
      default: return 'bg-gray-100 dark:bg-gray-900/20 text-gray-700 dark:text-gray-300';
    }
  };

  return (
    <div className={cn("space-y-6 p-4", className)}>
      {/* Story Arc */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
          <Book className="h-4 w-4" />
          <span>Story Arc</span>
        </div>
        <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-4 space-y-2">
          <h4 className="font-medium text-sm">{narrativeFlow.story_arc.type}</h4>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {narrativeFlow.story_arc.description}
          </p>
          
          {/* Phases */}
          <div className="mt-3 space-y-2">
            {narrativeFlow.story_arc.phases.map((phase, index) => (
              <div key={index} className="border-l-2 border-[#FF4301]/20 pl-3 space-y-1">
                <h5 className="text-xs font-medium">{phase.name}</h5>
                <p className="text-xs text-gray-600 dark:text-gray-400">{phase.purpose}</p>
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500">
                  <span>Slides: {phase.slides.join(', ')}</span>
                  <span>•</span>
                  <span>{phase.suggested_duration} min</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Key Themes */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
          <Target className="h-4 w-4" />
          <span>Key Themes</span>
        </div>
        <div className="space-y-2">
          {narrativeFlow.key_themes.map((theme, index) => (
            <div key={index} className="bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">{theme.theme}</h4>
                <span className={cn("text-xs font-medium", getImportanceColor(theme.importance))}>
                  {theme.importance}
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">{theme.description}</p>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                Related slides: {theme.related_slides.join(', ')}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Flow Recommendations */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
          <MessageSquare className="h-4 w-4" />
          <span>Flow Recommendations</span>
        </div>
        <div className="space-y-2">
          {narrativeFlow.flow_recommendations.map((rec, index) => (
            <div 
              key={index} 
              className={cn(
                "rounded-lg px-3 py-2 text-xs",
                getPriorityColor(rec.priority)
              )}
            >
              <div className="font-medium mb-1">{rec.type}</div>
              <p>{rec.recommendation}</p>
              {rec.between_slides && (
                <p className="text-xs mt-1 opacity-75">
                  Between slides: {rec.between_slides.join(' → ')}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Presentation Tips */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
          <Lightbulb className="h-4 w-4" />
          <span>Presentation Tips</span>
        </div>
        <div className="space-y-2">
          {narrativeFlow.presentation_tips.map((tip, index) => (
            <div key={index} className="bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium capitalize text-gray-700 dark:text-gray-300">
                  {tip.category}
                </span>
                {tip.slide_id && (
                  <span className="text-xs text-gray-500 dark:text-gray-500">
                    • {tip.slide_id}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">{tip.tip}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tone and Style */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
          <Book className="h-4 w-4" />
          <span>Tone & Style</span>
        </div>
        <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-3 space-y-2">
          <div className="text-xs">
            <span className="font-medium">Overall Tone:</span>{' '}
            <span className="text-gray-600 dark:text-gray-400">
              {narrativeFlow.tone_and_style.overall_tone}
            </span>
          </div>
          <div className="text-xs">
            <span className="font-medium">Language Level:</span>{' '}
            <span className="text-gray-600 dark:text-gray-400">
              {narrativeFlow.tone_and_style.language_level}
            </span>
          </div>
          <div className="text-xs">
            <span className="font-medium">Engagement Techniques:</span>{' '}
            <span className="text-gray-600 dark:text-gray-400">
              {narrativeFlow.tone_and_style.engagement_techniques.join(', ')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}; 