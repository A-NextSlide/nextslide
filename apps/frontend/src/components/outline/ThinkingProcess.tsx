import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Search, Globe, FileText, Brain, CheckCircle2, AlertCircle, Palette, Wand2, Sparkles } from 'lucide-react';

type ResearchEvent =
  | { type: 'research_started'; message?: string; progress?: number }
  | { type: 'research_plan'; queries: string[]; progress?: number }
  | { type: 'research_search_results'; results: Record<string, { title: string; url: string; snippet: string }[]>; progress?: number }
  | { type: 'research_page_fetched'; url: string; chars?: number; progress?: number }
  | { type: 'research_synthesis'; count: number; progress?: number }
  | { type: 'research_complete'; findings: { title: string; summary: string; url?: string; source?: string }[]; progress?: number }
  | { type: 'research_error'; error: string; progress?: number };

type ThemeEvent = 
  | { type: 'agent_event'; agent: string; phase: string; summary: string }
  | { type: 'tool_call'; name: string; args?: any }
  | { type: 'tool_result'; name: string; result_keys?: string[] }
  | { type: 'artifact'; kind: string; content?: any }
  | { type: 'palette_search'; query: string; count?: number }
  | { type: 'vector_search'; query: string; matches?: number };

type ProcessEvent = ResearchEvent | ThemeEvent;

interface ThinkingProcessProps {
  events: ProcessEvent[];
  isVisible: boolean;
  className?: string;
}

const ThinkingProcess: React.FC<ThinkingProcessProps> = ({ events, isVisible, className }) => {
  const [currentMessage, setCurrentMessage] = useState<string>('');
  const [messageIndex, setMessageIndex] = useState(0);
  const [lastEventType, setLastEventType] = useState<string>('');
  // Start expanded by default
  const [expandedHistory, setExpandedHistory] = useState(true);
  const [visibleProgress, setVisibleProgress] = useState(0);
  const [forceComplete, setForceComplete] = useState(false);
  const historyRef = React.useRef<HTMLDivElement | null>(null);

  // Avoid noisy console logs to prevent devtools spam and potential perf issues

  const latestEvent = useMemo(() => (events && events.length > 0 ? events[events.length - 1] : undefined), [events]);

  // Auto-scroll expanded history to bottom when new events arrive
  useEffect(() => {
    if (historyRef.current) {
      try {
        historyRef.current.scrollTop = historyRef.current.scrollHeight;
      } catch {}
    }
  }, [events?.length, expandedHistory]);

  useEffect(() => {
    // Always process events to keep state updated, even when not visible
    if (!events || events.length === 0) {
      setCurrentMessage('');
      if (!isVisible) {
        setVisibleProgress(0);
      }
      return;
    }
    
    if (!latestEvent) return;
    
    // Force update when we detect completion
    if (latestEvent.type === 'research_complete' || latestEvent.type === 'research_error') {
      setForceComplete(true);
      setVisibleProgress(100);
    }
    

    
    // Generate message based on event type
    let message = '';
    let icon = <Brain className="w-4 h-4" />;
    
    // Progress mapping per event type; ensures smooth forward-only progression
    const progressForType = (type?: string): number => {
      switch (type) {
        case 'research_started':
          return 5;
        case 'research_plan':
          return 12;
        case 'research_search_results':
          return 28;
        case 'research_page_fetched':
          return 35; // many of these will slowly advance
        case 'research_synthesis':
          return 80;
        case 'research_complete':
          return 100;
        case 'research_error':
          return 100;
        default:
          return 0;
      }
    };
    
    switch (latestEvent?.type) {
      case 'research_started':
        message = (latestEvent as ResearchEvent).message || 'Starting research...';
        icon = <Brain className="w-4 h-4 animate-pulse" />;
        break;
        
      case 'research_plan':
        const queries = (latestEvent as any).queries;
        message = queries && Array.isArray(queries) ? `Planning ${queries.length} research queries...` : 'Planning research...';
        icon = <Search className="w-4 h-4 animate-pulse" />;
        break;
        
      case 'research_search_results':
        const results = (latestEvent as any).results;
        if (results && typeof results === 'object') {
          const totalResults = Object.values(results).reduce((acc: number, arr: any) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
          message = `Found ${totalResults} relevant sources...`;
        } else {
          message = 'Searching for information...';
        }
        icon = <Globe className="w-4 h-4 animate-pulse" />;
        break;
        
      case 'research_page_fetched':
        const url = (latestEvent as any).url;
        if (url) {
          try {
            const domain = new URL(url).hostname.replace('www.', '');
            message = `Reading ${domain}...`;
          } catch {
            message = 'Reading source...';
          }
        } else {
          message = 'Fetching information...';
        }
        icon = <FileText className="w-4 h-4 animate-pulse" />;
        break;
        
      case 'research_synthesis':
        const count = (latestEvent as ResearchEvent).count;
        message = count ? `Analyzing ${count} findings...` : 'Analyzing findings...';
        icon = <Brain className="w-4 h-4 animate-pulse" />;
        break;
        
      case 'research_complete':
        const findings = (latestEvent as ResearchEvent).findings;
        if (findings && Array.isArray(findings) && findings.length > 0) {
          message = `Research complete! Found ${findings.length} key insights.`;
        } else {
          message = 'Research complete!';
        }
        icon = <CheckCircle2 className="w-4 h-4 text-green-600" />;
        // Force completion state immediately
        setForceComplete(true);
        setVisibleProgress(100);
        break;
        
      case 'research_error':
        message = `Error: ${(latestEvent as ResearchEvent).error}`;
        icon = <AlertCircle className="w-4 h-4 text-red-600" />;
        break;
        
      // Theme generation events
      case 'agent_event':
        const agentEvent = latestEvent as ThemeEvent;
        if (agentEvent.agent === 'ThemeDirector') {
          message = agentEvent.summary || 'Designing theme...';
          icon = <Palette className="w-4 h-4 animate-pulse" />;
        } else {
          message = `${agentEvent.agent}: ${agentEvent.summary}`;
          icon = <Sparkles className="w-4 h-4 animate-pulse" />;
        }
        break;
        
      case 'tool_call':
        const toolCall = latestEvent as ThemeEvent;
        const toolParts = toolCall.name.split('.');
        const toolClassName = toolParts.length > 1 ? toolParts[0] : '';
        const toolMethodName = toolParts[toolParts.length - 1];
        
        // Create more descriptive messages based on tool name
        if (toolCall.name.includes('analyze_theme_and_style')) {
          message = `🎨 Analyzing theme and style preferences...`;
        } else if (toolCall.name.includes('select_colors')) {
          message = `🎨 Selecting color palette...`;
        } else if (toolCall.name.includes('select_fonts')) {
          message = `🔤 Selecting fonts...`;
        } else if (toolCall.name.includes('generate_palette')) {
          message = `🎨 Generating custom palette...`;
        } else if (toolCall.name.includes('search')) {
          message = `🔍 Searching for: ${toolCall.args?.query || 'information'}...`;
        } else {
          message = `⏺ ${toolClassName ? `${toolClassName}.` : ''}${toolMethodName}...`;
        }
        icon = <Wand2 className="w-4 h-4 animate-pulse" />;
        break;
        
      case 'tool_result':
        const toolResult = latestEvent as ThemeEvent;
        const resultParts = toolResult.name.split('.');
        const resultClassName = resultParts.length > 1 ? resultParts[0] : '';
        const resultMethodName = resultParts[resultParts.length - 1];
        
        // Create completion messages based on tool name
        if (toolResult.name.includes('analyze_theme_and_style')) {
          message = `✓ Theme analysis complete`;
        } else if (toolResult.name.includes('select_colors')) {
          const colorCount = toolResult.result_keys?.includes('colors') ? ' - found colors' : '';
          message = `✓ Color selection complete${colorCount}`;
        } else if (toolResult.name.includes('select_fonts')) {
          const fontCount = toolResult.result_keys?.includes('fonts') ? ' - selected fonts' : '';
          message = `✓ Font selection complete${fontCount}`;
        } else if (toolResult.name.includes('generate_palette')) {
          message = `✓ Palette generated`;
        } else if (toolResult.name.includes('search')) {
          message = `✓ Search complete`;
        } else {
          message = `✓ ${resultClassName ? `${resultClassName}.` : ''}${resultMethodName} complete`;
        }
        icon = <CheckCircle2 className="w-4 h-4 text-green-600" />;
        break;
        
      case 'artifact':
        message = 'Theme generated!';
        icon = <Sparkles className="w-4 h-4 text-purple-600" />;
        break;
        
      case 'palette_search':
        const paletteSearch = latestEvent as ThemeEvent;
        message = `🎨 Searching palettes: "${(paletteSearch.query || '').slice(0, 40)}..."`;
        icon = <Search className="w-4 h-4 text-purple-600 animate-pulse" />;
        break;
        
      case 'vector_search':
        const vectorSearch = latestEvent as ThemeEvent;
        message = vectorSearch.matches 
          ? `🔍 Found ${vectorSearch.matches} semantic matches`
          : `🔍 Searching with embeddings...`;
        icon = <Search className="w-4 h-4 text-indigo-600 animate-pulse" />;
        break;
        
      default:
        message = 'Processing...';
    }

    // Animate message transition
    if (latestEvent.type !== lastEventType) {
      setLastEventType(latestEvent.type);
      setMessageIndex(prev => prev + 1);
    }
    
    setCurrentMessage(message);

    // Reset progress at the start of a new generation
    if (latestEvent.type === 'research_started' && visibleProgress === 100) {
      // Only reset if we were previously at 100%
      setVisibleProgress(5); // Start at 5% instead of 0
      setForceComplete(false);
    } else if (latestEvent.type === 'research_started') {
      setVisibleProgress(5);
      setForceComplete(false);
    } else {
      // Update visible progress monotonically
      const mapped = progressForType(latestEvent.type);
      const numeric = (typeof (latestEvent as any).progress === 'number') ? (latestEvent as any).progress as number : undefined;
      const nextProgress = Math.max(mapped, numeric ?? 0);
      
      // Always update progress if we have a mapped value
      if (mapped > 0 || nextProgress > 0) {
        setVisibleProgress(prev => {
          const newProgress = Math.max(prev, nextProgress);
          return Math.min(newProgress, 100);
        });
      }
    }
  }, [events, isVisible, lastEventType, latestEvent]);

  // Force progress to 100% when research_complete event is present
  useEffect(() => {
    // Check for completion in multiple ways
    const hasCompleteEvent = events.some(e => {
      // Check exact type match
      if (e.type === 'research_complete' || e.type === 'research_error') return true;
      
      // Check if message indicates completion
      if (typeof e.message === 'string') {
        const lowerMsg = e.message.toLowerCase();
        if (lowerMsg.includes('complete') || lowerMsg.includes('finished') || lowerMsg.includes('done')) {
          return true;
        }
      }
      
      // Check if it's the last event and looks like a summary
      const isLastEvent = events[events.length - 1] === e;
      if (isLastEvent && e.type === 'research_synthesis' && (e as any).count) {
        return true;
      }
      
      return false;
    });
    

    
    if (hasCompleteEvent) {
      // Use setTimeout to ensure state update happens in next tick
      setTimeout(() => {
        setForceComplete(true);
        setVisibleProgress(100);
      }, 0);
    } else {
      setForceComplete(false);
    }
  }, [events]); // Removed visibleProgress to avoid circular dependency

  // Force a re-render when component becomes visible
  useEffect(() => {
    if (isVisible && latestEvent) {
      // Trigger a small state update to force re-render
      setMessageIndex(prev => prev + 0.001);
    }
  }, [isVisible, latestEvent]);

  // Always update state, but only render when visible
  if (!isVisible) {
    return null;
  }
  
  // Show something even if currentMessage is empty initially
  const displayMessage = currentMessage || 'Starting AI processing...';
  
  // More comprehensive completion detection
  const hasComplete = React.useMemo(() => {
    return events.some(e => {
      // Direct type check
      if (e.type === 'research_complete' || e.type === 'research_error') {
        return true;
      }
      
      // Check if last event message looks complete
      const isLast = events[events.length - 1] === e;
      if (isLast && (e as any).message) {
        const msg = ((e as any).message || '').toLowerCase();
        if (msg.includes('completed') || msg.includes('complete') || msg.includes('found') && msg.includes('insights')) {
          return true;
        }
      }
      
      return false;
    });
  }, [events]);
  
  const isComplete = visibleProgress >= 100 || hasComplete || forceComplete;

  return (
    <div className={cn(
      "relative overflow-hidden transition-all duration-300",
      "bg-gradient-to-r from-orange-50/80 to-purple-50/80 dark:from-orange-950/30 dark:to-purple-950/30",
      "backdrop-blur-sm rounded-lg p-4 shadow-sm border border-orange-200/50 dark:border-orange-800/30",
      className
    )}>
      {/* Background animation */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-400 to-purple-400 animate-pulse blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-full bg-white/80 dark:bg-neutral-900/80 shadow-sm">
            <Brain className="w-4 h-4 text-orange-600 dark:text-orange-400 animate-pulse" />
          </div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {(() => {
              const hasThemeEvents = events.some(e => ['agent_event', 'tool_call', 'tool_result', 'artifact'].includes(e.type));
              const hasResearchEvents = events.some(e => e.type?.startsWith('research_'));
              
              if (hasThemeEvents && hasResearchEvents) {
                return 'AI Research & Theme Designer';
              } else if (hasThemeEvents) {
                return 'AI Theme Designer';
              } else {
                return 'AI Research Agent';
              }
            })()}
          </h3>
        </div>

        {/* Current action */}
        <div className="space-y-2">
          <p 
            key={messageIndex}
            className={cn(
              "text-sm font-medium text-neutral-700 dark:text-neutral-300",
              "animate-in fade-in slide-in-from-bottom-1 duration-500",
              "flex items-center gap-2"
            )}
          >
            {getIconForEventType(latestEvent?.type)}
            <span>{displayMessage}</span>
          </p>

          {/* Progress indicator - sticky and driven by mapped progress */}
          <div className="w-full bg-white/50 dark:bg-neutral-900/50 rounded-full h-1.5 overflow-hidden">
            <div 
              key={`progress-${Date.now()}-${isComplete ? 'complete' : visibleProgress}`} // Force re-render with timestamp
              className={cn(
                "h-full transition-all duration-500 ease-out",
                isComplete ? "bg-green-500" : "bg-gradient-to-r from-orange-500 to-purple-500"
              )}
              style={{ 
                width: `${isComplete ? 100 : Math.max(visibleProgress, 3)}%`,
                minWidth: '3%', // Ensure minimum visibility
                transform: 'translateZ(0)' // Force GPU acceleration
              }}
            />
          </div>


          {isComplete && (
            <div className="text-xs text-green-700 dark:text-green-400 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Completed
            </div>
          )}

          {/* Sub-details for specific events */}
          {latestEvent?.type === 'research_plan' && (latestEvent as ResearchEvent).queries && (
            <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
              <p className="font-medium mb-1">Research queries:</p>
              <ul className="space-y-0.5 ml-4">
                {(latestEvent as ResearchEvent).queries.slice(0, 3).map((query, i) => (
                  <li key={i} className="truncate">• {query}</li>
                ))}
                {(latestEvent as ResearchEvent).queries.length > 3 && (
                  <li className="text-neutral-500">• and {(latestEvent as ResearchEvent).queries.length - 3} more...</li>
                )}
              </ul>
            </div>
          )}
          
          {/* Tool call details for theme events */}
          {latestEvent?.type === 'tool_call' && (latestEvent as ThemeEvent).args && (
            <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
              <p className="font-medium">Tool: {(latestEvent as ThemeEvent).name}</p>
            </div>
          )}

          {/* History toggle */}
          {events.length > 1 && (
            <button
              onClick={() => setExpandedHistory(!expandedHistory)}
              className="mt-3 text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors flex items-center gap-1"
            >
              {expandedHistory ? 'Hide' : 'Show'} research history ({events.length} steps)
              <svg className={cn("w-3 h-3 transition-transform", expandedHistory && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}

          {/* Expanded history */}
          {expandedHistory && (
            <div ref={historyRef} className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700 space-y-2 max-h-72 overflow-y-auto">
              {events.map((event, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <div className="mt-0.5">{getIconForEventType(event.type)}</div>
                  <div className="flex-1">
                    <p className="font-medium text-neutral-700 dark:text-neutral-300">
                      {getMessageForEvent(event)}
                    </p>
                    {event.type === 'research_page_fetched' && (event as ResearchEvent).url && (
                      <p className="text-neutral-500 dark:text-neutral-400 truncate">
                        {new URL((event as ResearchEvent).url).hostname}
                      </p>
                    )}
                    {event.type === 'tool_call' && (
                      <div className="text-neutral-500 dark:text-neutral-400 text-xs space-y-0.5">
                        <p className="font-mono text-[10px]">{(event as ThemeEvent).name}</p>
                        {(event as ThemeEvent).args && (
                          <div className="ml-2 text-[10px]">
                            {Object.entries((event as ThemeEvent).args).slice(0, 2).map(([key, value]) => (
                              <p key={key} className="truncate">
                                {key}: {typeof value === 'string' ? value : JSON.stringify(value)}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  function getMessageForEvent(event: ProcessEvent): string {
    switch (event.type) {
      case 'research_started':
        return (event as ResearchEvent).message || 'Started research';
      case 'research_plan':
        const eventQueries = (event as any).queries;
        return eventQueries && Array.isArray(eventQueries) ? `Planned ${eventQueries.length} research queries` : 'Planned research queries';
      case 'research_search_results':
        const eventResults = (event as any).results;
        if (eventResults && typeof eventResults === 'object') {
          const totalResults = Object.values(eventResults).reduce((acc: number, arr: any) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
          return `Found ${totalResults} relevant sources`;
        }
        return 'Found sources';
      case 'research_page_fetched':
        const eventUrl = (event as any).url;
        if (eventUrl) {
          try {
            return `Read content from ${new URL(eventUrl).hostname}`;
          } catch {
            return 'Read content from source';
          }
        }
        return 'Read content';
      case 'research_synthesis':
        const eventCount = (event as any).count;
        return eventCount ? `Analyzing ${eventCount} findings` : 'Analyzing findings';
      case 'research_complete':
        const eventFindings = (event as any).findings;
        if (eventFindings && Array.isArray(eventFindings) && eventFindings.length > 0) {
          return `Completed with ${eventFindings.length} key insights`;
        } else {
          return 'Completed';
        }
      case 'research_error':
        return `Error: ${(event as ResearchEvent).error}`;
      // Theme events
      case 'agent_event':
        const agentEvent = event as ThemeEvent;
        return agentEvent.summary || `${agentEvent.agent} processing`;
      case 'tool_call':
        const toolCall = event as ThemeEvent;
        const toolParts = toolCall.name.split('.');
        const toolClassName = toolParts.length > 1 ? toolParts[0] : '';
        const toolMethodName = toolParts[toolParts.length - 1];
        
        if (toolCall.name.includes('analyze_theme_and_style')) {
          return `🎨 Analyzing theme and style preferences`;
        } else if (toolCall.name.includes('select_colors')) {
          return `🎨 Selecting color palette`;
        } else if (toolCall.name.includes('select_fonts')) {
          return `🔤 Selecting fonts`;
        } else if (toolCall.name.includes('generate_palette')) {
          return `🎨 Generating custom palette`;
        } else if (toolCall.name.includes('search')) {
          return `🔍 Searching for: ${toolCall.args?.query || 'information'}`;
        } else {
          return `⏺ ${toolClassName ? `${toolClassName}.` : ''}${toolMethodName}`;
        }
      case 'tool_result':
        const toolResult = event as ThemeEvent;
        const resultParts = toolResult.name.split('.');
        const resultClassName = resultParts.length > 1 ? resultParts[0] : '';
        const resultMethodName = resultParts[resultParts.length - 1];
        
        if (toolResult.name.includes('analyze_theme_and_style')) {
          return `✓ Theme analysis complete`;
        } else if (toolResult.name.includes('select_colors')) {
          const colorCount = toolResult.result_keys?.includes('colors') ? ' - found colors' : '';
          return `✓ Color selection complete${colorCount}`;
        } else if (toolResult.name.includes('select_fonts')) {
          const fontCount = toolResult.result_keys?.includes('fonts') ? ' - selected fonts' : '';
          return `✓ Font selection complete${fontCount}`;
        } else if (toolResult.name.includes('generate_palette')) {
          return `✓ Palette generated`;
        } else if (toolResult.name.includes('search')) {
          return `✓ Search complete`;
        } else {
          return `✓ ${resultClassName ? `${resultClassName}.` : ''}${resultMethodName} complete`;
        }
      case 'artifact':
        return 'Theme generated';
      case 'palette_search':
        const paletteSearch = event as ThemeEvent;
        return `🎨 Searching palettes: "${(paletteSearch.query || '').slice(0, 40)}..."`;
      case 'vector_search':
        const vectorSearch = event as ThemeEvent;
        return vectorSearch.matches 
          ? `🔍 Found ${vectorSearch.matches} semantic matches`
          : `🔍 Searching with embeddings`;
      default:
        return 'Processing...';
    }
  }

  function getIconForEventType(type?: string) {
    switch (type) {
      case 'research_started':
        return <Brain className="w-4 h-4 text-orange-600 animate-pulse" />;
      case 'research_plan':
        return <Search className="w-4 h-4 text-blue-600 animate-pulse" />;
      case 'research_search_results':
        return <Globe className="w-4 h-4 text-green-600 animate-pulse" />;
      case 'research_page_fetched':
        return <FileText className="w-4 h-4 text-purple-600 animate-pulse" />;
      case 'research_synthesis':
        return <Brain className="w-4 h-4 text-indigo-600 animate-pulse" />;
      case 'research_complete':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'research_error':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      // Theme events
      case 'agent_event':
        return <Palette className="w-4 h-4 text-purple-600 animate-pulse" />;
      case 'tool_call':
        return <Wand2 className="w-4 h-4 text-indigo-600 animate-pulse" />;
      case 'tool_result':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'artifact':
        return <Sparkles className="w-4 h-4 text-purple-600" />;
      case 'palette_search':
        return <Search className="w-4 h-4 text-purple-600 animate-pulse" />;
      case 'vector_search':
        return <Search className="w-4 h-4 text-indigo-600 animate-pulse" />;
      default:
        return <Brain className="w-4 h-4 text-neutral-600 animate-pulse" />;
    }
  }
};

export default ThinkingProcess;
