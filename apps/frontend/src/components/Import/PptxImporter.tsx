import React, { useState, useCallback, forwardRef } from 'react';
import { useDeckStore } from '@/stores/deckStore';
import { CompleteDeckData } from '@/types/DeckTypes';
import { toast } from "sonner"
import { deckSyncService } from '@/lib/deckSyncService';
import { uploadFile } from '@/utils/fileUploadUtils';
import { pptxImportApi } from '@/services/pptxImportApi';

interface PptxImporterProps {
  onImportComplete?: (deckId: string) => void;
}

const PptxImporter = forwardRef<HTMLInputElement, PptxImporterProps>(({ onImportComplete }, ref) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updateDeckData = useDeckStore((state) => state.updateDeckData);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const originalFileName = file.name.replace(/\.pptx$/i, '');

    setIsProcessing(true);
    setError(null);
    toast.info("Starting PPTX import...");

    let newDeck: CompleteDeckData | null = null;
    let newDeckId: string | null = null;

    try {
      // 1) Create empty deck (no default slides - import will provide them)
      const deckId = crypto.randomUUID();
      newDeckId = deckId;
      newDeck = {
        uuid: deckId,
        name: originalFileName,
        slides: [],
        lastModified: new Date().toISOString(),
      } as CompleteDeckData;
      toast.info(`Starting import for: ${originalFileName}...`);

      // 2) Upload PPTX to storage to get a URL the backend can access
      const fileUrl = await uploadFile(file);

      // 3) Start backend import job
      toast.info('Starting backend import job...');
      const jobId = await pptxImportApi.startImportPptx({ fileUrl, fileName: file.name, deckId: newDeckId || undefined });

      // 4) Poll until finished
      const job = await pptxImportApi.pollJob<{ deck: any }>(jobId, { intervalMs: 1500, timeoutMs: 180000 });
      const deckJson = (job.result as any)?.deck || job.result;
      if (!deckJson) throw new Error('No deck result returned');

      // 5) Sanitize minimal (black fills -> transparent)
      const sanitizeImportedDeck = (deck: any) => {
        const clone = JSON.parse(JSON.stringify(deck));
        for (const slide of clone.slides || []) {
          if (!Array.isArray(slide.components)) continue;
          slide.components = slide.components.map((comp: any) => {
            if (comp?.type === 'Shape' && comp.props) {
              const fill = comp.props.fill as string | undefined;
              const hasGradient = !!comp.props.gradient;
              if (!hasGradient && typeof fill === 'string') {
                const lower = fill.toLowerCase();
                if (lower === '#000000ff' || lower === '#000000' || lower === 'black' || /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*1(\.0+)?\s*\)/i.test(lower) || /rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)/i.test(lower)) {
                  comp.props.fill = '#00000000';
                }
                if (lower === 'transparent') {
                  comp.props.fill = '#00000000';
                }
              }
            }
            return comp;
          });
        }
        return clone;
      };

      const cleanedDeckJson = sanitizeImportedDeck(deckJson);
      const finalDeck = {
        ...newDeck,
        uuid: newDeck.uuid,
        name: cleanedDeckJson.name || `${originalFileName} (Imported)`,
        slides: cleanedDeckJson.slides || [],
        lastModified: new Date().toISOString(),
      } as any;

      // 6) Persist deck locally and to backend without navigating immediately
      updateDeckData(finalDeck, { skipBackend: true });
      await deckSyncService.saveDeck(finalDeck, { isImport: true });

      // 7) Do not auto-navigate to avoid heavy renderer mount during import flow
      toast.success(`Imported slides into '${finalDeck.name}'!`);
      if (onImportComplete) onImportComplete(newDeckId);

    } catch (err) {
      console.error('Error during import process:', err);
      setError(`Import Error: ${err instanceof Error ? err.message : String(err)}`);
      toast.error(`Import Error: ${err instanceof Error ? err.message : String(err)}`);
      if (!newDeckId && !(err instanceof Error && err.message === "Parser did not return valid slide data.")) { // Don't show if parser failed early
         toast.error("Failed to create the initial presentation structure.");
      }
    } finally {
      setIsProcessing(false);
      event.target.value = '';
    }
  }, [updateDeckData, onImportComplete]);

  return (
    <input
        ref={ref}
        id="pptx-upload-input"
        type="file"
        accept=".pptx"
        onChange={handleFileChange}
        disabled={isProcessing}
        style={{ display: 'none' }}
    />
  );
});

PptxImporter.displayName = 'PptxImporter';

export default PptxImporter; 