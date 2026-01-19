/**
 * VoiceRecorder Component
 *
 * Real-time streaming voice recording with Gemini Live API.
 * Features:
 * - Click & hold: Record while holding
 * - Shift+click: Toggle recording (like Wispr Flow)
 * - Quick click: Shows helpful hint
 * - Streaming transcription: See words as you speak
 * - Smooth mic permission flow
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { API_CONFIG } from '@/config/environment';

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
  onStreamingTranscript?: (text: string) => void;
  onRecordingStart?: () => void;
  onRecordingEnd?: () => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  variant?: 'default' | 'minimal' | 'mic';
}

// Mic permission dialog component
const MicPermissionDialog: React.FC<{
  show: boolean;
  onAllow: () => void;
  onDeny: () => void;
}> = ({ show, onAllow, onDeny }) => {
  const [hasClicked, setHasClicked] = React.useState(false);

  // Reset state when dialog opens
  React.useEffect(() => {
    if (show) {
      setHasClicked(false);
    }
  }, [show]);

  if (!show) return null;

  const handleAllow = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Prevent double-firing from both touch and click
    if (hasClicked) return;
    setHasClicked(true);
    onAllow();
  };

  const handleDeny = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Prevent double-firing
    if (hasClicked) return;
    setHasClicked(true);
    onDeny();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleDeny}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-sm mx-4 overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with gradient */}
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-6 text-white">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mic size={32} />
          </div>
          <h3 className="text-xl font-semibold text-center">Enable Microphone</h3>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-zinc-600 dark:text-zinc-400 text-center mb-6">
            Allow microphone access to use voice input. Your audio is processed in real-time and never stored.
          </p>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleAllow}
              onTouchEnd={handleAllow}
              className="w-full py-3 px-4 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-medium rounded-xl transition-colors touch-manipulation"
            >
              Allow Microphone
            </button>
            <button
              type="button"
              onClick={handleDeny}
              onTouchEnd={handleDeny}
              className="w-full py-2.5 px-4 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 active:text-zinc-800 font-medium transition-colors touch-manipulation"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Animated ring that pulses with audio
const PulseRing: React.FC<{ level: number; isActive: boolean }> = ({ level, isActive }) => {
  if (!isActive) return null;

  const scale = 1 + level * 0.5;
  const opacity = 0.3 + level * 0.4;

  return (
    <>
      <span
        className="absolute inset-0 rounded-lg bg-orange-400 pointer-events-none"
        style={{
          transform: `scale(${scale})`,
          opacity: opacity * 0.5,
          transition: 'transform 100ms ease-out, opacity 100ms ease-out',
        }}
      />
      <span
        className="absolute inset-0 rounded-lg border-2 border-orange-400 pointer-events-none animate-ping"
        style={{ animationDuration: '1.5s' }}
      />
    </>
  );
};

// Floating hint tooltip
const HintTooltip: React.FC<{ show: boolean; onHide: () => void }> = ({ show, onHide }) => {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(onHide, 3000);
      return () => clearTimeout(timer);
    }
  }, [show, onHide]);

  if (!show) return null;

  return (
    <div
      className={cn(
        "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg",
        "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-medium",
        "whitespace-nowrap shadow-lg z-50",
        "animate-in fade-in slide-in-from-bottom-2 duration-200"
      )}
    >
      <div className="flex flex-col gap-0.5">
        <span>Hold to record</span>
        <span className="text-zinc-400 dark:text-zinc-500 text-[10px]">Shift+click to lock</span>
      </div>
      <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
        <div className="w-2 h-2 bg-zinc-900 dark:bg-zinc-100 rotate-45" />
      </div>
    </div>
  );
};

// Wave visualization for recording state
const RecordingWave: React.FC<{ audioLevel: number }> = ({ audioLevel }) => {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 50);
    return () => clearInterval(interval);
  }, []);

  const bars = 5;
  const time = tick * 0.15;

  return (
    <div className="flex items-center justify-center gap-[2px] h-4">
      {Array.from({ length: bars }).map((_, i) => {
        const center = (bars - 1) / 2;
        const distFromCenter = Math.abs(i - center);
        const phase = i * 0.6;
        const wave = Math.sin(time * 2 + phase);

        // Combine audio level with wave animation
        const audioBoost = audioLevel * 0.8;
        const baseHeight = 0.3 - distFromCenter * 0.05;
        const height = baseHeight + audioBoost + wave * 0.15 * (0.5 + audioLevel);

        return (
          <div
            key={i}
            className="w-[3px] rounded-full bg-white"
            style={{
              height: `${Math.max(20, Math.min(100, height * 100))}%`,
              transition: 'height 60ms ease-out',
            }}
          />
        );
      })}
    </div>
  );
};


export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onTranscript,
  onStreamingTranscript,
  onRecordingStart,
  onRecordingEnd,
  onError,
  disabled = false,
  className,
  size = 'md',
  variant = 'default',
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const smoothedLevelRef = useRef(0);
  const pointerDownTimeRef = useRef(0);
  const isHoldingRef = useRef(false);
  const recordingDelayRef = useRef<NodeJS.Timeout | null>(null);
  const pendingStartRef = useRef<(() => void) | null>(null);
  // Track if we've successfully gotten mic permission (persists across renders)
  const hasGrantedPermissionRef = useRef(false);

  // Check if mic permission was previously granted
  const checkMicPermission = useCallback(async (): Promise<boolean> => {
    // If we've already successfully used the mic, skip the check
    if (hasGrantedPermissionRef.current) return true;

    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (result.state === 'granted') {
        hasGrantedPermissionRef.current = true;
        return true;
      }
      return false;
    } catch {
      // Permissions API not supported (iOS Safari), assume not granted yet
      return false;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (recordingDelayRef.current) clearTimeout(recordingDelayRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close();
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const analyzeAudio = useCallback(() => {
    if (!analyserRef.current) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const val = (dataArray[i] - 128) / 128;
      sum += val * val;
    }
    const rms = Math.sqrt(sum / bufferLength);
    const normalized = Math.min(1, rms * 4);
    const curved = Math.pow(normalized, 0.6);

    smoothedLevelRef.current = smoothedLevelRef.current * 0.6 + curved * 0.4;
    setAudioLevel(smoothedLevelRef.current);

    if (isRecording) {
      animationFrameRef.current = requestAnimationFrame(analyzeAudio);
    }
  }, [isRecording]);

  const startRecording = useCallback(async () => {
    if (disabled || isProcessing || isRecording || isConnecting) return;

    setIsConnecting(true);

    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        }
      });

      streamRef.current = stream;
      hasGrantedPermissionRef.current = true; // Mark permission as granted
      setPermissionDenied(false);
      smoothedLevelRef.current = 0;

      // Create WebSocket connection
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${API_CONFIG.AGENT_BASE_URL.replace(/^https?:/, wsProtocol)}/api/speech/stream`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // Set up audio context for PCM conversion
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      // Create analyser for visualization
      analyserRef.current = audioContext.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.3;
      source.connect(analyserRef.current);

      // Create processor for PCM data
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);
          // Convert float32 to int16
          const pcmData = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          ws.send(pcmData.buffer);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      // Handle WebSocket events
      ws.onopen = () => {
        console.log('Speech WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'ready') {
            setIsConnecting(false);
            setIsRecording(true);
            onRecordingStart?.();
            animationFrameRef.current = requestAnimationFrame(analyzeAudio);
          } else if (data.type === 'transcript') {
            // Stream partial transcripts directly to the input field
            if (data.text) {
              onStreamingTranscript?.(data.text);
            }
          } else if (data.type === 'final') {
            // Final transcript - this goes to the input field
            if (data.text?.trim()) {
              onTranscript(data.text.trim());
            }
            // Close WebSocket after receiving final transcript
            if (wsRef.current) {
              wsRef.current.close();
              wsRef.current = null;
            }
            setIsProcessing(false);
          } else if (data.type === 'error') {
            console.error('Transcription error:', data.message);
            onError?.(data.message);
            // Close WebSocket on error too
            if (wsRef.current) {
              wsRef.current.close();
              wsRef.current = null;
            }
            setIsProcessing(false);
          }
        } catch (e) {
          console.error('Error parsing WebSocket message:', e);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnecting(false);
        onError?.('Connection error');
        stopRecording();
      };

      ws.onclose = () => {
        console.log('Speech WebSocket closed');
        setIsConnecting(false);
      };

    } catch (error) {
      console.error('Recording failed:', error);
      setIsConnecting(false);

      if ((error as Error).name === 'NotAllowedError') {
        setPermissionDenied(true);
        onError?.('Microphone access denied');
      } else {
        onError?.('Failed to start recording');
      }
    }
  }, [disabled, isProcessing, isRecording, isConnecting, onRecordingStart, onError, analyzeAudio, onTranscript, onStreamingTranscript]);

  const stopRecording = useCallback(async () => {
    if (!isRecording && !isConnecting) return;

    setIsRecording(false);
    setIsLocked(false);
    setAudioLevel(0);
    setIsProcessing(true); // Show processing state while waiting for transcript
    onRecordingEnd?.();

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Signal end of audio to server - don't close, wait for transcript in onmessage
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end' }));
    }

    // Stop audio processing
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;

    if (audioContextRef.current?.state !== 'closed') {
      await audioContextRef.current?.close();
      audioContextRef.current = null;
    }
  }, [isRecording, isConnecting, onRecordingEnd]);

  const handleAllowMic = useCallback(async () => {
    setShowPermissionDialog(false);
    if (pendingStartRef.current) {
      pendingStartRef.current();
      pendingStartRef.current = null;
    }
  }, []);

  const handleDenyMic = useCallback(() => {
    setShowPermissionDialog(false);
    pendingStartRef.current = null;
  }, []);

  const initiateRecording = useCallback(async (isShiftClick: boolean) => {
    // Check if permission is already granted
    const hasPermission = await checkMicPermission();

    if (!hasPermission) {
      // Show permission dialog
      setShowPermissionDialog(true);
      pendingStartRef.current = () => {
        if (isShiftClick) {
          setIsLocked(true);
        }
        startRecording();
      };
      return;
    }

    if (isShiftClick) {
      setIsLocked(true);
    }
    startRecording();
  }, [checkMicPermission, startRecording]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Shift+click = toggle mode (immediate)
    if (e.shiftKey) {
      if (isRecording) {
        stopRecording();
      } else {
        initiateRecording(true);
      }
      return;
    }

    // Normal click & hold - delay recording start to detect quick clicks
    pointerDownTimeRef.current = Date.now();
    isHoldingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    // Start recording after a short delay (allows quick click detection)
    recordingDelayRef.current = setTimeout(() => {
      if (isHoldingRef.current) {
        initiateRecording(false);
      }
    }, 150);
  }, [isRecording, initiateRecording, stopRecording]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const holdDuration = Date.now() - pointerDownTimeRef.current;

    // Clear any pending recording start
    if (recordingDelayRef.current) {
      clearTimeout(recordingDelayRef.current);
      recordingDelayRef.current = null;
    }

    // If locked (shift+click mode), clicking again stops
    if (isLocked && isRecording) {
      stopRecording();
      isHoldingRef.current = false;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      return;
    }

    // Quick click (< 150ms) - just show hint, don't record
    if (holdDuration < 150) {
      setShowHint(true);
      isHoldingRef.current = false;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      return;
    }

    isHoldingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    // Stop recording if it was started
    if (isRecording && !isLocked) {
      stopRecording();
    }
  }, [isRecording, isLocked, stopRecording]);

  const handlePointerLeave = useCallback((e: React.PointerEvent) => {
    // Clear any pending recording start
    if (recordingDelayRef.current) {
      clearTimeout(recordingDelayRef.current);
      recordingDelayRef.current = null;
    }

    if (isRecording && !isLocked && isHoldingRef.current) {
      isHoldingRef.current = false;
      stopRecording();
    }
  }, [isRecording, isLocked, stopRecording]);

  const hideHint = useCallback(() => setShowHint(false), []);

  // Size configs matching other buttons
  const sizeConfig = {
    xs: 'h-7 w-7',
    sm: 'h-8 w-8',
    md: 'h-9 w-9',
    lg: 'h-10 w-10',
  };

  const iconSize = {
    xs: 16,
    sm: 16,
    md: 18,
    lg: 20,
  };

  // Common button for all variants
  const buttonContent = isProcessing || isConnecting ? (
    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
  ) : isRecording ? (
    <RecordingWave audioLevel={audioLevel} />
  ) : (
    <Mic size={iconSize[size]} />
  );

  return (
    <>
      <MicPermissionDialog
        show={showPermissionDialog}
        onAllow={handleAllowMic}
        onDeny={handleDenyMic}
      />

      <div className="relative">
        <HintTooltip show={showHint} onHide={hideHint} />

        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          disabled={disabled || isProcessing || permissionDenied}
          className={cn(
            "relative flex items-center justify-center rounded-lg md:rounded-xl transition-all duration-150",
            "touch-none select-none cursor-pointer",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50",
            sizeConfig[size],
            isRecording || isConnecting
              ? "!bg-orange-500 !text-white shadow-lg shadow-orange-500/30"
              : isProcessing
              ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
              : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-100 active:bg-orange-500 active:text-white",
            (disabled || permissionDenied) && "opacity-50 cursor-not-allowed",
            className
          )}
          title={
            permissionDenied ? "Microphone denied"
              : isProcessing || isConnecting ? "Connecting..."
              : isLocked ? "Click to stop"
              : "Hold to record (Shift+click to lock)"
          }
        >
          <PulseRing level={audioLevel} isActive={isRecording} />
          <span className="relative z-10">{buttonContent}</span>
        </button>

        {/* Lock indicator */}
        {isLocked && isRecording && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full border-2 border-white dark:border-zinc-900 animate-pulse" />
        )}
      </div>
    </>
  );
};

export default VoiceRecorder;
