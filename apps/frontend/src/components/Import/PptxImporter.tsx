import React, { useState, useCallback, forwardRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDeckStore } from '@/stores/deckStore';
import { SlideData } from '@/types/SlideTypes';
import { ComponentInstance } from '@/types/components';
import { createComponent } from '@/utils/componentUtils';
import { CompleteDeckData } from '@/types/DeckTypes';
import { toast } from "sonner"
import { deckSyncService } from '@/lib/deckSyncService';
import { uploadFile } from '@/utils/fileUploadUtils';
import { pptxImportApi } from '@/services/pptxImportApi';

// Define the target width for your application's slides
const APP_SLIDE_WIDTH_PX = 1280; // Or get this dynamically/from config

interface PptxImporterProps {
  onImportComplete?: (deckId: string) => void;
}

type PptxParserData = any; // TODO: Define more specific type later

// Helper function to safely get nested properties
const getProp = (obj: any, path: string, defaultValue: any = undefined) => {
    return path.split('.').reduce((o, p) => (o ? o[p] : defaultValue), obj);
}

// Helper to convert RGB object to hex string (returns undefined if invalid)
const rgbToHex = (rgb: { red?: number; green?: number; blue?: number } | undefined): string | undefined => {
    if (!rgb) return undefined;
    const normalize = (v: number | undefined): number | undefined => {
      if (typeof v !== 'number' || isNaN(v)) return undefined;
      // Support 0..1 and 0..255 ranges
      const n = v <= 1 ? v * 255 : v;
      return Math.max(0, Math.min(255, Math.round(n)));
    };
    const r = normalize(rgb.red);
    const g = normalize(rgb.green);
    const b = normalize(rgb.blue);
    if (r === undefined || g === undefined || b === undefined) return undefined;
    const toHex = (c: number) => ('0' + c.toString(16)).slice(-2);
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Helper to convert PT to PX (adjust multiplier if needed)
const ptToPx = (pt: number | undefined): number => Math.round((pt ?? 12) * 1.333); // Default to 12pt if missing

// Helper to map alignment
const mapAlign = (align: string | undefined): string => {
    switch(align) {
        case 'START': return 'left';
        case 'CENTER': return 'center';
        case 'END': return 'right';
        case 'JUSTIFY': return 'justify';
        default: return 'left';
    }
}

const PptxImporter = forwardRef<HTMLInputElement, PptxImporterProps>(({ onImportComplete }, ref) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const createDefaultDeck = useDeckStore((state) => state.createDefaultDeck);
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
      // 1) Create placeholder deck
      newDeck = await createDefaultDeck();
      if (!newDeck || !newDeck.uuid) throw new Error("Failed to create default deck.");
      newDeckId = newDeck.uuid;
      toast.info(`Created base deck: ${newDeckId}. Uploading file...`);

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
      await deckSyncService.saveDeck(finalDeck);

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
  }, [createDefaultDeck, updateDeckData, navigate, onImportComplete]);

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