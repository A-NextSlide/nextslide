/**
 * VoiceRecorder Component
 *
 * Elegant voice recording with multiple interaction modes:
 * - Click & hold: Record while holding
 * - Shift+click: Toggle recording (like Wispr Flow)
 * - Quick click: Shows helpful hint
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { API_CONFIG } from '@/config/environment';

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
  onRecordingStart?: () => void;
  onRecordingEnd?: () => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'minimal' | 'mic';
}

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
  const [audioLevel, setAudioLevel] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [isLocked, setIsLocked] = useState(false); // Shift+click toggle mode

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const smoothedLevelRef = useRef(0);
  const pointerDownTimeRef = useRef(0);
  const isHoldingRef = useRef(false);
  const recordingDelayRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (recordingDelayRef.current) clearTimeout(recordingDelayRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close();
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
    if (disabled || isProcessing || isRecording) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });

      streamRef.current = stream;
      setPermissionDenied(false);
      smoothedLevelRef.current = 0;

      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.3;
      source.connect(analyserRef.current);

      let mimeType = 'audio/webm';
      for (const fmt of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
        if (MediaRecorder.isTypeSupported(fmt)) { mimeType = fmt; break; }
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      onRecordingStart?.();
      animationFrameRef.current = requestAnimationFrame(analyzeAudio);

    } catch (error) {
      console.error('Recording failed:', error);
      if ((error as Error).name === 'NotAllowedError') {
        setPermissionDenied(true);
        onError?.('Microphone access denied');
      } else {
        onError?.('Failed to start recording');
      }
    }
  }, [disabled, isProcessing, isRecording, onRecordingStart, onError, analyzeAudio]);

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || !isRecording) return;

    setIsRecording(false);
    setIsLocked(false);
    setAudioLevel(0);
    onRecordingEnd?.();

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;

    if (audioContextRef.current?.state !== 'closed') {
      await audioContextRef.current?.close();
      audioContextRef.current = null;
    }

    return new Promise<void>((resolve) => {
      if (!mediaRecorderRef.current) return resolve();

      mediaRecorderRef.current.onstop = async () => {
        const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });

        if (blob.size < 1000) { resolve(); return; }

        let ext = '.webm';
        if (mimeType.includes('mp4')) ext = '.mp4';
        else if (mimeType.includes('ogg')) ext = '.ogg';

        setIsProcessing(true);

        try {
          const formData = new FormData();
          formData.append('audio', blob, `recording${ext}`);

          const res = await fetch(`${API_CONFIG.AGENT_BASE_URL}/api/speech/transcribe`, {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `Error ${res.status}`);
          }

          const { text } = await res.json();
          if (text?.trim()) onTranscript(text.trim());
        } catch (e) {
          console.error('Transcription error:', e);
          onError?.((e as Error).message || 'Transcription failed');
        } finally {
          setIsProcessing(false);
          resolve();
        }
      };

      mediaRecorderRef.current.stop();
    });
  }, [isRecording, onRecordingEnd, onTranscript, onError]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Shift+click = toggle mode (immediate)
    if (e.shiftKey) {
      if (isRecording) {
        stopRecording();
      } else {
        setIsLocked(true);
        startRecording();
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
        startRecording();
      }
    }, 150);
  }, [isRecording, startRecording, stopRecording]);

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
    sm: 'h-8 w-8',
    md: 'h-9 w-9',
    lg: 'h-10 w-10',
  };

  const iconSize = {
    sm: 16,
    md: 18,
    lg: 20,
  };

  // Common button for all variants
  const buttonContent = isProcessing ? (
    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
  ) : isRecording ? (
    <RecordingWave audioLevel={audioLevel} />
  ) : (
    <Mic size={iconSize[size]} />
  );

  return (
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
          "relative flex items-center justify-center rounded-xl transition-all duration-150",
          "touch-none select-none cursor-pointer",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50",
          sizeConfig[size],
          isRecording
            ? "bg-orange-500 hover:bg-orange-500 text-white shadow-lg shadow-orange-500/30"
            : isProcessing
            ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
            : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-100",
          (disabled || permissionDenied) && "opacity-50 cursor-not-allowed",
          className
        )}
        title={
          permissionDenied ? "Microphone denied"
            : isProcessing ? "Transcribing..."
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
  );
};

export default VoiceRecorder;
