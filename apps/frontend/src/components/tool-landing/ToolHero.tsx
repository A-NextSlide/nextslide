import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import type { ToolPageConfig } from '@/config/toolPages';
import { useToolConversion } from '@/hooks/useToolConversion';
import FileUploadZone from './FileUploadZone';
import UrlInputField from './UrlInputField';
import TextInputArea from './TextInputArea';
import ProcessingState from './ProcessingState';
import ResultCard from './ResultCard';
import ToolSlideGenerating from './ToolSlideGenerating';
import ToolSlideViewer from './ToolSlideViewer';

interface ToolHeroProps {
  config: ToolPageConfig;
}

export default function ToolHero({ config }: ToolHeroProps) {
  const {
    state,
    progress,
    error,
    analysisResult,
    fileName,
    deckId,
    slides,
    lockedAfter,
    generationProgress,
    handleFileUpload,
    handleUrlSubmit,
    handleTextSubmit,
    navigateToApp,
    reset,
  } = useToolConversion(config);

  const renderInput = () => {
    // Generating state — show progressive slide loading
    if (state === 'generating') {
      return (
        <ToolSlideGenerating
          slides={slides}
          progress={generationProgress}
        />
      );
    }

    // Generated state — show full slide viewer with locked slides
    if (state === 'generated') {
      return (
        <ToolSlideViewer
          slides={slides}
          lockedAfter={lockedAfter}
          onSignup={navigateToApp}
          onReset={reset}
          allUnlocked={lockedAfter >= slides.length}
        />
      );
    }

    if (state === 'processing') {
      return <ProcessingState progress={progress} />;
    }

    // For file-upload tools: show result card when complete and NO deckId
    // (when deckId is set the hook already navigates to the deck)
    if (state === 'complete' && config.inputType === 'file-upload' && !deckId) {
      return (
        <ResultCard
          analysisResult={analysisResult}
          fileName={fileName}
          onOpenApp={navigateToApp}
          onReset={reset}
        />
      );
    }

    switch (config.inputType) {
      case 'file-upload':
        return <FileUploadZone config={config} onFileSelect={handleFileUpload} />;
      case 'url-input':
        return <UrlInputField onSubmit={handleUrlSubmit} />;
      case 'text-area':
        return <TextInputArea config={config} onSubmit={handleTextSubmit} />;
      default:
        return null;
    }
  };

  return (
    <section className={`relative overflow-hidden bg-gradient-to-br ${config.heroGradient}`}>
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-16 sm:pb-24">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-8">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to NextSlide
          </a>
          <Link
            to="/signup"
            className="text-sm font-semibold text-white bg-white/15 hover:bg-white/25 backdrop-blur-sm px-4 py-2 rounded-full transition-colors"
          >
            Try NextSlide
          </Link>
        </div>

        {/* Text content — hide when showing generated slides for more room */}
        {state !== 'generated' && (
          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight leading-tight">
              {config.title}
            </h1>
            <p className="mt-4 text-base sm:text-lg text-white/80 max-w-2xl mx-auto leading-relaxed">
              {config.heroSubtitle}
            </p>
          </div>
        )}

        {/* Input area (white card) */}
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          {renderInput()}

          {/* Error display */}
          {error && state === 'error' && (
            <div className="mt-4 flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-4">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">{error}</p>
                <button
                  onClick={reset}
                  className="mt-1 text-sm text-red-600 hover:text-red-700 underline"
                >
                  Try again
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Trust line — hide in generated state since CTA is already visible */}
        {state !== 'generated' && (
          <p className="mt-6 text-center text-sm text-white/60">
            Free to use. No credit card required. Your files are processed securely.
          </p>
        )}
      </div>
    </section>
  );
}
