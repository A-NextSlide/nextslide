import React, { useState } from 'react';
import { Button } from '../ui/button';
import { FileText, Loader2, Download, ChevronDown, Globe } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { SlideData } from '@/types/SlideTypes';
import { useDeckStore } from '@/stores/deckStore';
import { trackDeckExported } from '@/services/analytics';
import { exportDeckToPDF } from '@/utils/pdfExport';
import { exportDeckToHTML } from '@/utils/htmlExport';

interface DeckExporterProps {
  deckName: string;
  slides: SlideData[];
}

const DeckExporter: React.FC<DeckExporterProps> = ({ deckName, slides }) => {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportType, setExportType] = useState<'pdf' | 'html' | null>(null);
  const deckData = useDeckStore(state => state.deckData);

  const handleExportPDF = async () => {
    try {
      setIsExporting(true);
      setExportType('pdf');

      toast({
        title: "Generating PDF",
        description: `Processing ${slides.length} slides...`,
      });

      await exportDeckToPDF(slides, deckName, (current, total) => {
        console.log(`Processing slide ${current}/${total}`);
      });

      trackDeckExported({
        deckId: deckData?.uuid || deckName,
        format: 'pdf',
        slideCount: slides.length
      });

      toast({
        title: "PDF Export Complete",
        description: `Successfully exported ${slides.length} slides`,
      });
    } catch (error) {
      console.error('PDF export failed:', error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export PDF",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
      setExportType(null);
    }
  };

  const handleExportHTML = async () => {
    try {
      setIsExporting(true);
      setExportType('html');

      toast({
        title: "Generating Offline Presentation",
        description: `Processing ${slides.length} slides...`,
      });

      await exportDeckToHTML(slides, deckName, (current, total) => {
        console.log(`Processing slide ${current}/${total}`);
      });

      trackDeckExported({
        deckId: deckData?.uuid || deckName,
        format: 'html',
        slideCount: slides.length
      });

      toast({
        title: "Export Complete",
        description: `Successfully exported ${slides.length} slides to HTML`,
      });
    } catch (error) {
      console.error('HTML export failed:', error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export HTML",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
      setExportType(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          disabled={isExporting}
        >
          {isExporting ? (
            <Loader2 size={14} className="mr-1 animate-spin" />
          ) : (
            <Download size={14} className="mr-1" />
          )}
          {isExporting
            ? (exportType === 'pdf' ? 'Exporting PDF...' : 'Exporting HTML...')
            : 'Export'}
          <ChevronDown size={12} className="ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleExportPDF} disabled={isExporting}>
          <FileText size={14} className="mr-2" />
          Export to PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportHTML} disabled={isExporting}>
          <Globe size={14} className="mr-2" />
          Export to NextSlide (Offline)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default DeckExporter;
