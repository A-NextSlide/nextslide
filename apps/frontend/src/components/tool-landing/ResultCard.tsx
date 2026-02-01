import React from 'react';
import { CheckCircle, ArrowRight, RotateCcw, FileText, Lock, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { FileAnalysisResponse } from '@/services/fileAnalysisService';

interface ResultCardProps {
  analysisResult: FileAnalysisResponse | null;
  fileName: string | null;
  onOpenApp: () => void;
  onReset: () => void;
}

export default function ResultCard({ analysisResult, fileName, onOpenApp, onReset }: ResultCardProps) {
  const navigate = useNavigate();

  const summary =
    analysisResult?.results?.[0]?.summary ||
    analysisResult?.combined_analysis?.slice(0, 250) ||
    null;

  const totalPages = analysisResult?.total_pages;
  const pagesAnalyzed = analysisResult?.pages_analyzed;
  const hasRemainingPages =
    totalPages != null && pagesAnalyzed != null && totalPages > pagesAnalyzed;
  const remainingPages = hasRemainingPages ? totalPages! - pagesAnalyzed! : 0;

  return (
    <div className="space-y-5">
      {/* Success header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
          <CheckCircle className="w-6 h-6 text-green-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-zinc-900">
            {hasRemainingPages
              ? `We analyzed the first ${pagesAnalyzed} of ${totalPages} pages`
              : 'Your file has been analyzed'}
          </h3>
          {fileName && (
            <div className="flex items-center gap-2 mt-1 text-sm text-zinc-500">
              <FileText className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{fileName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Brief summary */}
      {summary && (
        <div className="rounded-xl bg-zinc-50 p-4">
          <p className="text-sm text-zinc-600 line-clamp-3">{summary}</p>
        </div>
      )}

      {/* Sign-up CTA — unauthenticated users */}
      <div className="rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-900">
              {hasRemainingPages
                ? `Sign up to convert all ${totalPages} pages into a stunning presentation`
                : 'Sign up free to generate your presentation'}
            </p>
            <p className="text-sm text-orange-700 mt-0.5">
              Create a free account to turn this into beautifully designed slides — no credit card needed.
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/signup')}
          className="
            w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl
            bg-[#FF6B00] text-white font-semibold text-base
            hover:bg-[#e56000] active:scale-[0.98] transition-all shadow-sm
          "
        >
          Sign up free — it takes 10 seconds
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Secondary action */}
      <button
        onClick={onReset}
        className="
          w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl
          border border-zinc-200 text-zinc-600 font-medium text-sm
          hover:bg-zinc-50 active:scale-[0.98] transition-all
        "
      >
        <RotateCcw className="w-4 h-4" />
        Try another file
      </button>
    </div>
  );
}
