import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Send, Sparkles, ArrowLeft, FileText, Upload, X, Link as LinkIcon, Image as ImageIcon, Table, Presentation, File, Paperclip, Loader2 } from 'lucide-react';
import { streamOutlineAgentChat, ChatMessage, AgentEvent, OutlineData, FileAttachment } from '@/services/outlineAgentService';
import { fileToBase64, getFileCategory, formatFileSize, createImagePreview, revokeImagePreview } from '@/services/fileAnalysisService';

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

interface AttachmentPreview {
  id: string;
  name: string;
  type: string;
  size: number;
  previewUrl?: string;
}

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
  showSlideModeSelection?: boolean;
  attachments?: AttachmentPreview[];
}

interface CollectedData {
  topic?: string;
  stylePreferences?: string;
  slideCount?: number;
  detailLevel?: 'quick' | 'standard' | 'detailed';
  presentationType?: 'simple' | 'detailed';
  slideMode?: 'interactive' | 'static';
  chatHistory?: { role: 'user' | 'assistant'; content: string }[];
  themeChanges?: any;
  uploadedFiles?: File[];
  uploadedMedia?: Array<{
    id: string;
    name: string;
    type: string;
    content?: string;
    url?: string;
    size?: number;
  }>;
}

type ConversationStage =
  | 'conversing'
  | 'planning'
  | 'slide_mode_selection'
  | 'confirmed'
  | 'chat';

interface ConversationalOnboardingProps {
  onComplete: (data: CollectedData) => void;
  onCancel?: () => void;
  initialMessage?: string;
  slideCount?: number;
  onProcessingChange?: (isProcessing: boolean) => void;
  initialUploadedFiles?: File[];
}

const ConversationalOnboarding: React.FC<ConversationalOnboardingProps> = ({
  onComplete,
  onCancel,
  initialMessage,
  slideCount,
  onProcessingChange,
  initialUploadedFiles = []
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [collectedData, setCollectedData] = useState<CollectedData>({ slideCount });
  const [stage, setStage] = useState<ConversationStage>('conversing');
  const [outlineFlow, setOutlineFlow] = useState<any>(null);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ file: File; previewUrl?: string }>>(
    initialUploadedFiles.map(f => ({
      file: f,
      previewUrl: f.type.startsWith('image/') ? createImagePreview(f) : undefined
    }))
  );
  // Persistent files that have been sent but need to be resent with each message until outline is generated
  const [persistentFiles, setPersistentFiles] = useState<FileAttachment[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusPhase, setStatusPhase] = useState<string | null>(null);

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

  const addMessage = (
    role: 'user' | 'assistant',
    content: string,
    buttons?: Array<{ label: string; action: string }>,
    showPresentationSelection?: boolean,
    attachments?: AttachmentPreview[],
    showSlideModeSelection?: boolean
  ) => {
    const newMessage: Message = {
      id: `${Date.now()}-${Math.random()}`,
      role,
      content,
      timestamp: new Date(),
      buttons,
      showPresentationSelection,
      showSlideModeSelection,
      attachments
    };
    setMessages(prev => [...prev, newMessage]);

    // Update chat history for agent (don't include selection prompts)
    if (!showPresentationSelection && !showSlideModeSelection) {
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
    if ((!userMessage && uploadedFiles.length === 0) || isProcessing) return;

    // Snapshot current files for this message
    const currentFiles = [...uploadedFiles];
    const hasFiles = currentFiles.length > 0;

    // Create attachment previews for the message before clearing
    const messageAttachments: AttachmentPreview[] = currentFiles.map((f, idx) => ({
      id: `file-${Date.now()}-${idx}`,
      name: f.file.name,
      type: f.file.type || 'application/octet-stream',
      size: f.file.size,
      previewUrl: f.previewUrl
    }));

    setInput('');
    setIsProcessing(true);
    onProcessingChange?.(true);

    // Add user message WITH attachments shown in the message
    addMessage('user', userMessage || (hasFiles ? `Shared ${currentFiles.length} file${currentFiles.length > 1 ? 's' : ''}` : ''), undefined, undefined, messageAttachments.length > 0 ? messageAttachments : undefined);

    // Clear uploaded files UI after adding to message (but keep references for API call)
    setUploadedFiles([]);

    try {
      setIsAgentTyping(true);

      // Convert new files to base64 and add to persistent files
      let newFilesToAdd: FileAttachment[] = [];
      if (hasFiles) {
        console.log('[ConversationalOnboarding] Converting', currentFiles.length, 'new files to base64...');
        newFilesToAdd = await Promise.all(
          currentFiles.map(async (f, idx) => {
            const content = await fileToBase64(f.file);
            console.log('[ConversationalOnboarding] Converted:', f.file.name, 'base64 length:', content.length);
            return {
              id: `file-${Date.now()}-${idx}`,
              name: f.file.name,
              type: f.file.type || 'application/octet-stream',
              content,
              size: f.file.size
            };
          })
        );
        // Add to persistent files so they're sent with every message
        setPersistentFiles(prev => [...prev, ...newFilesToAdd]);
      }

      // Always send ALL persistent files (including newly added ones) with each message
      const filesToSend = [...persistentFiles, ...newFilesToAdd];
      console.log('[ConversationalOnboarding] Sending', filesToSend.length, 'total files (persistent:', persistentFiles.length, ', new:', newFilesToAdd.length, ')');

      // Stream agent response
      let assistantMessage = '';
      let outlineData: OutlineData | null = null;

      console.log('[ConversationalOnboarding] Calling streamOutlineAgentChat with', filesToSend.length, 'files');
      const generator = streamOutlineAgentChat({
        message: userMessage || 'Please analyze these files for my presentation.',
        chat_history: chatHistory,
        context: collectedData,
        files: filesToSend.length > 0 ? filesToSend : undefined
      });

      for await (const event of generator) {
        if (event.type === 'text') {
          assistantMessage += event.content;
          // Clear status when we get actual text
          setStatusMessage(null);
          setStatusPhase(null);
        } else if (event.type === 'status') {
          // Handle status updates - show to user
          console.log('[ConversationalOnboarding] Status:', event.status, event.message);
          const status = (event as any).status;
          const message = (event as any).message || (event as any).query;

          // Map status to user-friendly messages
          if (status === 'thinking') {
            setStatusPhase('thinking');
            setStatusMessage('Processing your request...');
          } else if (status === 'analyzing_file') {
            setStatusPhase('analyzing');
            setStatusMessage(`Analyzing ${(event as any).file_name || 'file'}...`);
          } else if (status === 'files_analyzed') {
            setStatusPhase('analyzed');
            setStatusMessage(`Analyzed ${(event as any).analyses?.length || 1} file(s)`);
          } else if (status === 'file_analysis_error') {
            setStatusPhase('error');
            setStatusMessage(message || 'Could not analyze file');
          } else if (status === 'researching') {
            setStatusPhase('researching');
            setStatusMessage(`Searching: ${(event as any).query || 'web'}...`);
          } else if (status === 'scraping') {
            setStatusPhase('scraping');
            setStatusMessage(message || 'Reading content...');
          } else if (status === 'scraped') {
            setStatusPhase('scraped');
            setStatusMessage(message || 'Content extracted');
          } else {
            setStatusMessage(message || status);
          }
        } else if (event.type === 'outline') {
          // IMPORTANT: Don't overwrite generate_outline with subsequent update_theme
          // The agent may output both in the same response, and we need to keep the generate_outline
          if (!outlineData || outlineData.action !== 'generate_outline') {
            outlineData = event.data;
          } else if (event.data?.action === 'update_theme' && outlineData.action === 'generate_outline') {
            // Store theme changes in the existing generate_outline data
            outlineData.theme_changes = event.data.theme_changes;
            console.log('[ConversationalOnboarding] Merged theme update into generate_outline');
          }
          console.log('[ConversationalOnboarding] Received outline data:', outlineData);
          setStatusMessage(null);
          setStatusPhase(null);
        } else if (event.type === 'error') {
          console.error('[ConversationalOnboarding] Agent error:', event.message);
          setStatusMessage(null);
          setStatusPhase(null);
          addAgentMessage("I apologize, but I encountered an error. Let's try again. What would you like your presentation to be about?");
          setIsAgentTyping(false);
          setIsProcessing(false);
          return;
        }
      }

      setIsAgentTyping(false);
      setStatusMessage(null);
      setStatusPhase(null);

      // Check if agent wants to generate outline
      if (outlineData && outlineData.action === 'generate_outline') {
        // Agent has created the flow! Show it and ask for presentation type
        setStage('planning');
        setOutlineFlow(outlineData);
        // Clear persistent files now that outline is generated - they're included in outlineData.uploadedMedia
        console.log('[ConversationalOnboarding] Outline generated, clearing', persistentFiles.length, 'persistent files');
        setPersistentFiles([]);

        // Show the planning message
        addAgentMessage(
          assistantMessage || "Here's the plan for your presentation:"
        );

        // Check if user requested detailed mode in their messages
        const userRequestedDetailed = chatHistory.some(msg =>
          msg.role === 'user' &&
          (msg.content.toLowerCase().includes('detailed') ||
           msg.content.toLowerCase().includes('in-depth') ||
           msg.content.toLowerCase().includes('comprehensive'))
        );

        // Store detail level for later use
        const detailLevel = userRequestedDetailed ? 'detailed' : 'quick';
        setCollectedData(prev => ({ ...prev, presentationType: 'simple', detailLevel }));

        // Ask about slide mode (interactive vs static)
        setTimeout(() => {
          setStage('slide_mode_selection');
          addMessage(
            'assistant',
            "Your presentation is ready to generate!",
            undefined,
            undefined,
            undefined,
            true // showSlideModeSelection
          );
        }, 1500);
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
      setStatusMessage(null);
      setStatusPhase(null);
      // Auto-focus input after processing is done and input is re-enabled
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  };

  const handleButtonClick = (action: string) => {
    // Handle slide mode selection
    if (action === 'interactive' || action === 'static') {
      const slideMode = action as 'interactive' | 'static';
      const modeLabel = slideMode === 'interactive' ? 'Interactive slides' : 'Classic design';

      addMessage('user', modeLabel);
      setCollectedData(prev => ({ ...prev, slideMode }));
      setStage('confirmed');

      const confirmMessage = slideMode === 'interactive'
        ? "Excellent choice! Creating your interactive presentation..."
        : "Got it! Creating your beautifully designed presentation...";

      addAgentMessage(confirmMessage);

      setTimeout(() => {
        onComplete({
          ...collectedData,
          topic: outlineFlow?.topic || collectedData.topic,
          slideCount: collectedData.slideCount || outlineFlow?.slide_count,
          detailLevel: collectedData.detailLevel || 'quick',
          presentationType: 'simple',
          slideMode,
          chatHistory: chatHistory,
          themeChanges: collectedData.themeChanges || outlineFlow?.theme_changes,
          uploadedFiles: uploadedFiles.map(f => f.file),
          uploadedMedia: outlineFlow?.uploadedMedia
        });
      }, 1500);
      return;
    }

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
  const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB limit (Anthropic supports up to 32MB)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles: Array<{ file: File; previewUrl?: string }> = [];
    const oversizedFiles: string[] = [];

    files.forEach(file => {
      if (file.size > MAX_FILE_SIZE) {
        oversizedFiles.push(file.name);
      } else {
        validFiles.push({
          file,
          previewUrl: file.type.startsWith('image/') ? createImagePreview(file) : undefined
        });
      }
    });

    if (oversizedFiles.length > 0) {
      // Show a message about oversized files
      addMessage('assistant', `⚠️ ${oversizedFiles.join(', ')} ${oversizedFiles.length > 1 ? 'are' : 'is'} too large (max 30MB). Please use smaller files or compress them.`);
    }

    if (validFiles.length > 0) {
      setUploadedFiles(prev => [...prev, ...validFiles]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles(prev => {
      const toRemove = prev[index];
      if (toRemove?.previewUrl) {
        revokeImagePreview(toRemove.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
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
    const validFiles: Array<{ file: File; previewUrl?: string }> = [];
    const oversizedFiles: string[] = [];

    files.forEach(file => {
      if (file.size > MAX_FILE_SIZE) {
        oversizedFiles.push(file.name);
      } else {
        validFiles.push({
          file,
          previewUrl: file.type.startsWith('image/') ? createImagePreview(file) : undefined
        });
      }
    });

    if (oversizedFiles.length > 0) {
      addMessage('assistant', `⚠️ ${oversizedFiles.join(', ')} ${oversizedFiles.length > 1 ? 'are' : 'is'} too large (max 30MB). Please use smaller files or compress them.`);
    }

    if (validFiles.length > 0) {
      setUploadedFiles(prev => [...prev, ...validFiles]);
    }
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
                {/* File attachments - shown INSIDE the message bubble */}
                {message.attachments && message.attachments.length > 0 && (
                  <div className={cn(
                    "flex flex-wrap gap-2 mb-3",
                    message.attachments.length === 1 ? "justify-center" : ""
                  )}>
                    {message.attachments.map((att, attIdx) => {
                      const isImage = att.type.startsWith('image/');
                      const category = getFileCategory({ name: att.name, type: att.type });
                      const FileIcon = isImage ? ImageIcon
                        : category === 'document' ? FileText
                        : category === 'spreadsheet' ? Table
                        : category === 'presentation' ? Presentation
                        : File;

                      return (
                        <div
                          key={att.id || attIdx}
                          className={cn(
                            "rounded-lg overflow-hidden",
                            isImage && att.previewUrl
                              ? "w-full max-w-[200px]"
                              : "flex items-center gap-2 px-3 py-2 bg-white/20 backdrop-blur-sm"
                          )}
                        >
                          {isImage && att.previewUrl ? (
                            <img
                              src={att.previewUrl}
                              alt={att.name}
                              className="w-full h-auto rounded-lg max-h-[150px] object-cover"
                            />
                          ) : (
                            <>
                              <FileIcon className="w-4 h-4 flex-shrink-0 opacity-80" />
                              <span className="text-xs truncate max-w-[120px]">{att.name}</span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
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

            {/* Slide Mode Selection - Custom UI */}
            {message.role === 'assistant' && message.showSlideModeSelection && (
              <div className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-col items-center gap-1.5">
                  {/* Main Generate Button */}
                  <button
                    onClick={() => handleButtonClick('interactive')}
                    disabled={isProcessing}
                    className="px-5 py-2 bg-[#FF4301] hover:bg-[#E63D00] text-white text-sm font-medium rounded-md transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Generate Outline
                  </button>

                  {/* Classic Option */}
                  <button
                    onClick={() => handleButtonClick('static')}
                    disabled={isProcessing}
                    className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-500 dark:hover:text-zinc-400 transition-colors disabled:opacity-50 py-1"
                  >
                    or use classic mode
                  </button>
                </div>
              </div>
            )}

          </div>
        ))}

        {/* Agent Typing/Status Indicator - Subtle, on-brand design */}
        {isAgentTyping && (
          <div className="flex justify-start animate-in slide-in-from-bottom-4">
            <div className="flex items-start gap-2 px-1">
              {/* Small pulsing orange dot */}
              <div className="flex-shrink-0 mt-1.5">
                <span
                  className="block w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ backgroundColor: '#FF4301' }}
                />
              </div>

              {/* Clean inline status text */}
              <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                <span className="font-medium" style={{ color: '#FF4301' }}>
                  {statusPhase === 'analyzing' ? 'Analyzing' :
                   statusPhase === 'analyzed' ? 'Done analyzing' :
                   statusPhase === 'researching' ? 'Searching the web' :
                   statusPhase === 'scraping' ? 'Reading page' :
                   statusPhase === 'scraped' ? 'Processing' :
                   statusPhase === 'error' ? 'Hmm' :
                   'Thinking'}
                </span>
                {' '}
                <span className="text-zinc-500 dark:text-zinc-400">
                  {statusMessage || 'about your request'}
                </span>
                {/* Subtle animated ellipsis */}
                <span className="inline-flex ml-0.5 text-zinc-400">
                  <span className="animate-pulse" style={{ animationDelay: '0ms' }}>.</span>
                  <span className="animate-pulse" style={{ animationDelay: '200ms' }}>.</span>
                  <span className="animate-pulse" style={{ animationDelay: '400ms' }}>.</span>
                </span>
              </p>
            </div>
          </div>
        )}

        {/* Fallback: Show "Ready to Generate" button after 1+ user messages if no outline generated yet */}
        {!isAgentTyping && !isProcessing && (stage === 'conversing' || stage === 'chat') && messages.filter(m => m.role === 'user').length >= 1 && (
          <div className="flex justify-center mt-4 animate-in fade-in">
            <button
              onClick={() => {
                // Check if user requested detailed mode in their messages
                const userRequestedDetailed = chatHistory.some(msg =>
                  msg.role === 'user' &&
                  (msg.content.toLowerCase().includes('detailed') ||
                   msg.content.toLowerCase().includes('in-depth') ||
                   msg.content.toLowerCase().includes('comprehensive'))
                );
                const detailLevel = userRequestedDetailed ? 'detailed' : 'quick';

                // Default to interactive mode when skipping the chat early
                setCollectedData(prev => ({ ...prev, presentationType: 'simple', detailLevel, slideMode: 'interactive' }));
                setStage('confirmed');
                addAgentMessage("Creating your interactive presentation...");
                setTimeout(() => {
                  onComplete({
                    ...collectedData,
                    detailLevel,
                    presentationType: 'simple',
                    slideMode: 'interactive',
                    chatHistory: chatHistory,
                    uploadedFiles: uploadedFiles.map(f => f.file)
                  });
                }, 1500);
              }}
              className="text-orange-500 hover:text-orange-600 text-sm font-medium transition-colors"
            >
              Ready to generate →
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - Sticky Bottom */}
      {stage !== 'slide_mode_selection' && stage !== 'confirmed' && (
        <div className="sticky bottom-0 z-10 bg-white/80 dark:bg-black/80 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800">
          <div className="px-6 py-4">
            {/* Pending files preview - shown before sending */}
            {uploadedFiles.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-2">
                {uploadedFiles.map((fileData, index) => {
                  const isImage = fileData.file.type.startsWith('image/');
                  const category = getFileCategory({ name: fileData.file.name, type: fileData.file.type });
                  const FileIcon = isImage ? ImageIcon
                    : category === 'document' ? FileText
                    : category === 'spreadsheet' ? Table
                    : category === 'presentation' ? Presentation
                    : File;

                  return (
                    <div
                      key={index}
                      className="group relative flex items-center gap-2 bg-gradient-to-br from-zinc-100 to-zinc-50 dark:from-zinc-800 dark:to-zinc-900 rounded-xl px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 shadow-sm hover:shadow-md transition-shadow"
                    >
                      {/* Image thumbnail or icon */}
                      {isImage && fileData.previewUrl ? (
                        <img
                          src={fileData.previewUrl}
                          alt={fileData.file.name}
                          className="w-10 h-10 rounded-lg object-cover"
                        />
                      ) : (
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center",
                          category === 'document' ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                          : category === 'spreadsheet' ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                          : category === 'presentation' ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
                          : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
                        )}>
                          <FileIcon className="w-5 h-5" />
                        </div>
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="text-zinc-800 dark:text-zinc-200 truncate max-w-[140px] text-sm font-medium">
                          {fileData.file.name}
                        </span>
                        <span className="text-zinc-500 dark:text-zinc-500 text-xs">
                          {formatFileSize(fileData.file.size)}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveFile(index)}
                        className="absolute -top-2 -right-2 p-1 bg-zinc-700 dark:bg-zinc-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
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
                  accept=".pdf,.doc,.docx,.txt,.md,.jpg,.jpeg,.png,.gif,.webp,.svg,.csv,.xls,.xlsx,.ppt,.pptx"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAgentTyping || isProcessing}
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "h-8 w-8 rounded-lg relative transition-colors",
                    uploadedFiles.length > 0
                      ? "text-orange-600 dark:text-orange-400 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  )}
                >
                  <Paperclip className="w-4 h-4" />
                  {uploadedFiles.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {uploadedFiles.length}
                    </span>
                  )}
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
