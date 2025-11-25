import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Send, Sparkles, ArrowLeft, BarChart3, FileText, Upload, X, Link as LinkIcon } from 'lucide-react';
import { streamOutlineAgentChat, ChatMessage, AgentEvent, OutlineData } from '@/services/outlineAgentService';

// Helper to render markdown-like formatting
const renderText = (text: string) => {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  // Match **bold** text
  const boldRegex = /\*\*([^*]+)\*\*/g;
  let match;

  while ((match = boldRegex.exec(text)) !== null) {
    // Add text before bold
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    // Add bold text with theme font
    parts.push(
      <strong key={match.index} className="font-semibold">
        {match[1]}
      </strong>
    );
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
};

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  buttons?: Array<{
    label: string;
    action: string;
  }>;
  showPresentationSelection?: boolean;
}

interface CollectedData {
  topic?: string;
  stylePreferences?: string;
  slideCount?: number;
  detailLevel?: 'quick' | 'standard' | 'detailed';
  presentationType?: 'simple' | 'detailed';
  chatHistory?: { role: 'user' | 'assistant'; content: string }[];
  themeChanges?: any;
}

type ConversationStage =
  | 'conversing'
  | 'planning'
  | 'presentation_type_selection'
  | 'confirmed';

interface ConversationalOnboardingProps {
  onComplete: (data: CollectedData) => void;
  onCancel?: () => void;
  initialMessage?: string;
  slideCount?: number;
  onProcessingChange?: (isProcessing: boolean) => void;
}

const ConversationalOnboarding: React.FC<ConversationalOnboardingProps> = ({
  onComplete,
  onCancel,
  initialMessage,
  slideCount,
  onProcessingChange
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [collectedData, setCollectedData] = useState<CollectedData>({ slideCount });
  const [stage, setStage] = useState<ConversationStage>('conversing');
  const [outlineFlow, setOutlineFlow] = useState<any>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notify parent of processing state changes
  useEffect(() => {
    onProcessingChange?.(isProcessing || isAgentTyping);
  }, [isProcessing, isAgentTyping, onProcessingChange]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Initial welcome message or process initial message
  useEffect(() => {
    if (initialMessage) {
      handleSendMessage(initialMessage);
    } else {
      setTimeout(() => {
        addAgentMessage(
          "What would you like to create a presentation about?"
        );
      }, 500);
    }
  }, []);

  const addMessage = (role: 'user' | 'assistant', content: string, buttons?: Array<{ label: string; action: string }>, showPresentationSelection?: boolean) => {
    const newMessage: Message = {
      id: `${Date.now()}-${Math.random()}`,
      role,
      content,
      timestamp: new Date(),
      buttons,
      showPresentationSelection
    };
    setMessages(prev => [...prev, newMessage]);

    // Update chat history for agent (don't include presentation selection prompts)
    if (!showPresentationSelection) {
      setChatHistory(prev => [...prev, { role, content }]);
    }
  };

  const addAgentMessage = (content: string, buttons?: Array<{ label: string; action: string }>) => {
    setIsAgentTyping(true);
    setTimeout(() => {
      addMessage('assistant', content, buttons);
      setIsAgentTyping(false);
    }, 800);
  };

  const handleSendMessage = async (messageText?: string) => {
    const userMessage = messageText || input.trim();
    if (!userMessage || isProcessing) return;

    setInput('');
    setIsProcessing(true);
    onProcessingChange?.(true);
    addMessage('user', userMessage);

    // Auto-focus input after sending
    // Focus is handled in finally block to ensure input is enabled

    try {
      setIsAgentTyping(true);

      // Stream agent response
      let assistantMessage = '';
      let outlineData: OutlineData | null = null;

      const generator = streamOutlineAgentChat({
        message: userMessage,
        chat_history: chatHistory,
        context: collectedData
      });

      for await (const event of generator) {
        if (event.type === 'text') {
          assistantMessage += event.content;
        } else if (event.type === 'outline') {
          outlineData = event.data;
          console.log('[ConversationalOnboarding] Received outline data:', outlineData);
        } else if (event.type === 'error') {
          console.error('[ConversationalOnboarding] Agent error:', event.message);
          addAgentMessage("I apologize, but I encountered an error. Let's try again. What would you like your presentation to be about?");
          setIsAgentTyping(false);
          setIsProcessing(false);
          return;
        }
      }

      setIsAgentTyping(false);

      // Check if agent wants to generate outline
      if (outlineData && outlineData.action === 'generate_outline') {
        // Agent has created the flow! Show it and ask for presentation type
        setStage('planning');
        setOutlineFlow(outlineData);

        // Show the planning message
        addAgentMessage(
          assistantMessage || "Here's the plan for your presentation:"
        );

        // Show presentation type selection as a message
        setTimeout(() => {
          setStage('presentation_type_selection');
          addMessage('assistant', "Choose your presentation style:", undefined, true);
        }, 1000);
      } else if (outlineData && outlineData.action === 'update_theme') {
        // Agent wants to update the theme
        console.log('[ConversationalOnboarding] Received theme update:', outlineData.theme_changes);

        setCollectedData(prev => ({
          ...prev,
          themeChanges: outlineData.theme_changes
        }));

        // Clean the message to remove buttons and JSON
        const cleanedMessage = assistantMessage
          .replace(/\[Button:[^\]]+\]/g, '')
          .replace(/```json[\s\S]*?```/g, '')
          .trim();

        // Acknowledge the theme update
        addAgentMessage(cleanedMessage || "I've noted your branding preferences.");
      } else {
        // Continue conversation
        // Parse for suggested buttons in the message (format: [Button: Label | action])
        const buttonMatches = assistantMessage.matchAll(/\[Button:\s*([^\|]+)\s*\|\s*([^\]]+)\]/g);
        const buttons: Array<{ label: string; action: string }> = [];

        for (const match of buttonMatches) {
          buttons.push({
            label: match[1].trim(),
            action: match[2].trim()
          });
        }

        // Remove button markup and JSON blocks from message
        const cleanedMessage = assistantMessage
          .replace(/\[Button:[^\]]+\]/g, '')
          .replace(/```json[\s\S]*?```/g, '')
          .trim();

        // Update collected data if agent mentions specific details
        const newCollectedData = { ...collectedData };

        // Extract topic if mentioned
        if (assistantMessage.toLowerCase().includes('topic') || assistantMessage.toLowerCase().includes('about')) {
          newCollectedData.topic = userMessage;
        }

        // Extract style preferences if mentioned
        if (assistantMessage.toLowerCase().includes('style') || assistantMessage.toLowerCase().includes('vibe')) {
          newCollectedData.stylePreferences = userMessage;
        }

        setCollectedData(newCollectedData);
        addMessage('assistant', cleanedMessage, buttons.length > 0 ? buttons : undefined);
      }
    } catch (error) {
      console.error('[ConversationalOnboarding] Error:', error);
      addAgentMessage("I'm sorry, I encountered an issue. Could you please try rephrasing that?");
    } finally {
      setIsProcessing(false);
      // Auto-focus input after processing is done and input is re-enabled
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  };

  const handleButtonClick = (action: string) => {
    handleSendMessage(action);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  // File upload handlers
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadedFiles(prev => [...prev, ...files]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const files = Array.from(e.dataTransfer.files);
    setUploadedFiles(prev => [...prev, ...files]);
  };

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto w-full">
      {/* Header with back button */}
      {onCancel && (
        <div className="px-4 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to presentations
          </Button>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-8 space-y-6">
        {messages.map((message, index) => (
          <div key={message.id}>
            <div
              className={cn(
                "flex w-full animate-in slide-in-from-bottom-4 duration-500",
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-5 py-3.5 shadow-md",
                  message.role === 'user'
                    ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white'
                    : 'bg-gradient-to-br from-white to-zinc-50 dark:from-zinc-800 dark:to-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200/50 dark:border-zinc-700/50'
                )}
              >
                <div className="text-sm whitespace-pre-wrap leading-relaxed font-['Inter',system-ui,sans-serif]">
                  {renderText(message.content)}
                </div>
              </div>
            </div>

            {/* Agent-provided buttons */}
            {message.role === 'assistant' && message.buttons && message.buttons.length > 0 && (
              <div className="flex gap-2 mt-3 ml-2 animate-in slide-in-from-bottom-2 flex-wrap">
                {message.buttons.map((button, btnIndex) => (
                  <Button
                    key={btnIndex}
                    variant={btnIndex === 0 ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleButtonClick(button.action)}
                    disabled={isProcessing}
                    className={cn(
                      "flex items-center gap-2",
                      btnIndex === 0 && "bg-orange-500 hover:bg-orange-600"
                    )}
                  >
                    {button.label}
                  </Button>
                ))}
              </div>
            )}

            {/* Presentation Type Selection Cards */}
            {message.role === 'assistant' && message.showPresentationSelection && (
              <div className="mt-4 animate-in slide-in-from-bottom-4 space-y-6">
                <div className="grid grid-cols-2 gap-3 max-w-xl">
                  {/* Simple Presentation */}
                  <button
                    onClick={() => {
                      setCollectedData(prev => ({ ...prev, presentationType: 'simple', detailLevel: 'quick' }));
                      addMessage('user', `Simple presentation (${collectedData.slideCount ? `${collectedData.slideCount} slides` : 'Auto count'})`);
                      setStage('confirmed');
                      addAgentMessage("Creating your presentation...");
                      setTimeout(() => {
                        onComplete({
                          ...collectedData,
                          topic: outlineFlow?.topic || collectedData.topic,
                          slideCount: collectedData.slideCount || outlineFlow?.slide_count,
                          detailLevel: 'quick',
                          presentationType: 'simple',
                          chatHistory: chatHistory,
                          themeChanges: collectedData.themeChanges
                        });
                      }, 1500);
                    }}
                    className="group relative bg-white dark:bg-zinc-800 rounded-xl p-4 border-2 border-zinc-200 dark:border-zinc-700 hover:border-orange-400 dark:hover:border-orange-500 transition-all hover:shadow-lg text-left"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-zinc-100 dark:bg-zinc-700 rounded-lg group-hover:bg-orange-50 dark:group-hover:bg-orange-900/20 transition-colors">
                        <FileText className="w-5 h-5 text-zinc-600 dark:text-zinc-400 group-hover:text-orange-500 transition-colors" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-100">Simple</h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">Clean slides with key points</p>
                      </div>
                    </div>

                    {/* Simple slide preview SVG - Content Left, Image Right */}
                    <svg viewBox="0 0 200 100" className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
                      {/* Background */}
                      <rect width="200" height="100" fill="currentColor" className="text-zinc-50 dark:text-zinc-900" />

                      {/* Left Content */}
                      <rect x="15" y="20" width="70" height="8" rx="2" fill="currentColor" className="text-zinc-800 dark:text-zinc-300" />
                      <rect x="15" y="40" width="60" height="4" rx="1" fill="currentColor" className="text-zinc-400 dark:text-zinc-600" />
                      <rect x="15" y="50" width="50" height="4" rx="1" fill="currentColor" className="text-zinc-400 dark:text-zinc-600" />
                      <rect x="15" y="60" width="55" height="4" rx="1" fill="currentColor" className="text-zinc-400 dark:text-zinc-600" />

                      {/* Right Image Placeholder */}
                      <rect x="100" y="15" width="85" height="70" rx="2" fill="currentColor" className="text-orange-100 dark:text-orange-900/20" />
                      <circle cx="142.5" cy="50" r="15" fill="currentColor" className="text-orange-200 dark:text-orange-800/40" />
                    </svg>
                  </button>

                  {/* Detailed Presentation */}
                  <button
                    onClick={() => {
                      setCollectedData(prev => ({ ...prev, presentationType: 'detailed', detailLevel: 'detailed' }));
                      addMessage('user', `Detailed presentation (${collectedData.slideCount ? `${collectedData.slideCount} slides` : 'Auto count'})`);
                      setStage('confirmed');
                      addAgentMessage("Creating your detailed presentation...");
                      setTimeout(() => {
                        onComplete({
                          ...collectedData,
                          topic: outlineFlow?.topic || collectedData.topic,
                          slideCount: collectedData.slideCount || outlineFlow?.slide_count,
                          detailLevel: 'detailed',
                          presentationType: 'detailed',
                          chatHistory: chatHistory,
                          themeChanges: collectedData.themeChanges
                        });
                      }, 1500);
                    }}
                    className="group relative bg-white dark:bg-zinc-800 rounded-xl p-4 border-2 border-zinc-200 dark:border-zinc-700 hover:border-orange-400 dark:hover:border-orange-500 transition-all hover:shadow-lg text-left"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-zinc-100 dark:bg-zinc-700 rounded-lg group-hover:bg-orange-50 dark:group-hover:bg-orange-900/20 transition-colors">
                        <BarChart3 className="w-5 h-5 text-zinc-600 dark:text-zinc-400 group-hover:text-orange-500 transition-colors" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-100">Detailed</h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">Rich content with charts</p>
                      </div>
                    </div>

                    {/* Detailed slide preview SVG - Content Left, Image Right */}
                    <svg viewBox="0 0 200 100" className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
                      {/* Background */}
                      <rect width="200" height="100" fill="currentColor" className="text-zinc-50 dark:text-zinc-900" />

                      {/* Left Content - Title */}
                      <rect x="10" y="15" width="60" height="6" rx="2" fill="currentColor" className="text-zinc-800 dark:text-zinc-300" />
                      
                      {/* Left Content - Text blocks */}
                      <rect x="10" y="26" width="55" height="3" rx="1" fill="currentColor" className="text-zinc-400 dark:text-zinc-600" />
                      <rect x="10" y="32" width="52" height="3" rx="1" fill="currentColor" className="text-zinc-400 dark:text-zinc-600" />
                      <rect x="10" y="38" width="50" height="3" rx="1" fill="currentColor" className="text-zinc-400 dark:text-zinc-600" />
                      
                      {/* Left Content - Charts */}
                      <rect x="10" y="48" width="15" height="30" rx="1" fill="currentColor" className="text-blue-200 dark:text-blue-900" />
                      <rect x="28" y="55" width="15" height="23" rx="1" fill="currentColor" className="text-blue-300 dark:text-blue-800" />
                      <rect x="46" y="50" width="15" height="28" rx="1" fill="currentColor" className="text-blue-400 dark:text-blue-700" />
                      
                      {/* Additional text below chart */}
                      <rect x="10" y="83" width="45" height="2.5" rx="1" fill="currentColor" className="text-zinc-300 dark:text-zinc-700" />
                      <rect x="10" y="88" width="40" height="2.5" rx="1" fill="currentColor" className="text-zinc-300 dark:text-zinc-700" />

                      {/* Right Image Placeholder with more detail */}
                      <rect x="75" y="15" width="115" height="70" rx="2" fill="currentColor" className="text-indigo-100 dark:text-indigo-900/20" />
                      <rect x="82" y="22" width="50" height="35" rx="1" fill="currentColor" className="text-indigo-200 dark:text-indigo-800/30" />
                      <rect x="135" y="22" width="48" height="20" rx="1" fill="currentColor" className="text-purple-200 dark:text-purple-800/30" />
                      <rect x="135" y="45" width="48" height="12" rx="1" fill="currentColor" className="text-blue-200 dark:text-blue-800/30" />
                      
                      {/* Caption */}
                      <rect x="82" y="60" width="80" height="2" rx="1" fill="currentColor" className="text-zinc-300 dark:text-zinc-700" />
                      <rect x="82" y="65" width="70" height="2" rx="1" fill="currentColor" className="text-zinc-300 dark:text-zinc-700" />
                    </svg>
                  </button>
                </div>
                
                {/* Continue Chatting Link */}
                <div className="flex justify-center mt-2">
                  <button
                    onClick={() => {
                      // Allow user to continue asking questions
                      setStage('chat');
                      addMessage('user', 'I want to continue chatting');
                      setTimeout(() => {
                        addAgentMessage("Of course! What else would you like to discuss about your presentation?");
                      }, 500);
                    }}
                    className="text-xs font-bold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                  >
                    continue chatting
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Agent Typing Indicator */}
        {isAgentTyping && (
          <div className="flex justify-start animate-in slide-in-from-bottom-4">
            <div className="bg-white dark:bg-zinc-800 rounded-2xl px-4 py-3 border border-zinc-200 dark:border-zinc-700">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - Sticky Bottom */}
      {stage !== 'presentation_type_selection' && stage !== 'confirmed' && (
        <div className="sticky bottom-0 z-10 bg-white/80 dark:bg-black/80 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800">
          <div className="px-6 py-4">
            {/* File uploads preview */}
            {uploadedFiles.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {uploadedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="inline-flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3 py-2 text-sm"
                  >
                    <span className="text-zinc-700 dark:text-zinc-300 truncate max-w-[200px]">
                      {file.name}
                    </span>
                    <button
                      onClick={() => handleRemoveFile(index)}
                      className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div
              className={cn(
                "flex gap-3 items-end bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors",
                isDraggingOver && "border-orange-400 dark:border-orange-500 bg-orange-50 dark:bg-orange-950/20"
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder={isDraggingOver ? "Drop files here..." : "Type your message or drag & drop files..."}
                  disabled={isAgentTyping || isProcessing}
                  className="w-full bg-transparent border-0 text-[#383636] dark:text-gray-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 pt-4 pb-4 pl-4 pr-2 resize-none text-base overflow-y-auto max-h-[200px] min-h-[60px] font-sans"
                  rows={1}
                />
              </div>
              <div className="flex items-center gap-2 pb-2 pr-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileUpload}
                  accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAgentTyping || isProcessing}
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                >
                  <Upload className="w-4 h-4" />
                </Button>
                <Button
                  onClick={() => {
                    // TODO: Implement link input functionality
                    console.log('Link button clicked');
                  }}
                  disabled={isAgentTyping || isProcessing}
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                >
                  <LinkIcon className="w-4 h-4" />
                </Button>
                <Button
                  onClick={() => handleSendMessage()}
                  disabled={(!input.trim() && uploadedFiles.length === 0) || isAgentTyping || isProcessing}
                  size="icon"
                  className="h-10 w-10 rounded-xl bg-orange-500 hover:bg-orange-600 shrink-0 disabled:opacity-50"
                >
                  {isProcessing ? (
                    <Sparkles className="w-4 h-4 animate-pulse" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 text-center">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConversationalOnboarding;
