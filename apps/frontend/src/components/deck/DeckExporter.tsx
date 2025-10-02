import React, { useState } from 'react';
import { Button } from '../ui/button';
import { FileJson, Layers, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { SlideData } from '@/types/SlideTypes';
import { extractDeckComponents } from '@/lib/componentExtractor';
import { CompleteDeckData } from '@/types/DeckTypes';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { getFontFamilyWithFallback } from '../../utils/fontUtils';
import { googleIntegrationApi } from '@/services/googleIntegrationApi';
import { useDeckStore } from '@/stores/deckStore';
import { Loader2, UploadCloud } from 'lucide-react';

interface DeckExporterProps {
  deckName: string;
  slides: SlideData[];
}

const DeckExporter: React.FC<DeckExporterProps> = ({ deckName, slides }) => {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const deckData = useDeckStore(state => state.deckData);

  // Generate HTML representation of the deck data
  const generateHtmlExport = (deckData: CompleteDeckData): string => {
    const { slides } = deckData;
    
    // Generate a comprehensive HTML representation with all components
    let deckCode = `
<!DOCTYPE html>
<html>
<head>
  <title>${deckName} - Exported Deck</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- Google Fonts for common fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto:wght@400;500;700&family=Open+Sans:wght@400;600&family=Lato:wght@400;700&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    /* Base styles */
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
      color: #333;
    }
    
    /* Container styles */
    .container {
      max-width: 100%;
      padding: 20px;
      margin: 0 auto;
    }
    
    /* Deck title */
    .deck-title {
      text-align: center;
      margin-bottom: 30px;
      color: #333;
      font-size: 28px;
      font-weight: bold;
    }
    
    /* Slides */
    .slides {
      display: flex;
      flex-direction: column;
      gap: 60px;
    }
    
    /* Slide container */
    .slide {
      position: relative;
      width: 100%;
      max-width: 960px; /* Adjusted to match 1920px at 0.5 scale */
      margin: 0 auto;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
      border-radius: 8px;
      overflow: hidden;
      background-color: white;
    }
    
    /* Slide header with title and numbering */
    .slide-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 20px;
      background-color: #f8f9fa;
      border-bottom: 1px solid #eee;
    }
    
    .slide-title {
      margin: 0;
      font-size: 16px;
      font-weight: 500;
      color: #666;
    }
    
    .slide-number {
      font-size: 14px;
      color: #999;
    }
    
    /* Slide content container */
    .slide-content {
      position: relative;
      width: 1920px;
      height: 1080px;
      transform-origin: top left;
      transform: scale(0.5);
      margin-bottom: -540px; /* Compensate for the scaling */
    }
    
    /* Components within slides */
    .component {
      position: absolute;
      box-sizing: border-box;
    }
    
    /* Text components with proper scaling */
    .text-component {
      overflow-wrap: break-word;
      word-wrap: break-word;
    }
    
    /* Background colors */
    .background {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
    }
    
    /* Shape components */
    .shape-component {
      z-index: 1;
    }
    
    /* Image components */
    .image-component img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    
    /* Responsive adjustments */
    @media (max-width: 1200px) {
      .slide-content {
        transform: scale(0.4);
        margin-bottom: -648px;
      }
    }
    
    @media (max-width: 768px) {
      .slide-content {
        transform: scale(0.25);
        margin-bottom: -810px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1 class="deck-title">${deckName}</h1>
    <div class="slides">
`;
    
    // Process each slide
    slides.forEach((slide, index) => {
      const slideNumber = index + 1;
      
      // Determine background color from Background component
      const backgroundColor = slide.components?.find(c => c.type === "Background")?.props?.color || "#ffffff";
      
      deckCode += `
      <div class="slide" id="slide-${slide.id}">
        <div class="slide-header">
          <h2 class="slide-title">${slide.title || 'Untitled Slide'}</h2>
          <span class="slide-number">Slide ${slideNumber}</span>
        </div>
        <div class="slide-content">
          <!-- Background -->
          <div class="background" style="background-color: ${backgroundColor};"></div>
`;
      
      // Process all components except background
      slide.components?.filter(comp => comp.type !== "Background").forEach(comp => {
        // Position and size
        const x = comp.props.position?.x || 0;
        const y = comp.props.position?.y || 0;
        const width = comp.props.width || 'auto';
        const height = comp.props.height || 'auto';
        const zIndex = comp.props.zIndex || 1;
        
        // Common style attributes
        let style = `position: absolute; left: ${x}px; top: ${y}px; width: ${width}px; height: ${height}px; z-index: ${zIndex};`;
        
        // Component-specific rendering
        switch(comp.type) {
          case "TiptapTextBlock":
            // Use exact font size from component - no scaling needed as it's handled by container
            const fontSize = typeof comp.props.fontSize === 'number' 
              ? `${comp.props.fontSize}px` 
              : comp.props.fontSize || '16px';
            
            const fontFamily = comp.props.fontFamily || 'Inter';
            const fontWeight = comp.props.fontWeight || 'normal';
            const textColor = comp.props.textColor || '#000000';
            const alignment = comp.props.alignment || 'left';
            const backgroundColor = comp.props.backgroundColor || 'transparent';
            const padding = comp.props.padding || '0';
            const lineHeight = comp.props.lineHeight || '1.2';
            const letterSpacing = comp.props.letterSpacing || 'normal';
            const verticalAlignment = comp.props.verticalAlignment || 'top';
            
            // Add additional text styles
            style += `
              font-family: ${getFontFamilyWithFallback(fontFamily)};
              font-size: ${fontSize};
              font-weight: ${fontWeight};
              color: ${textColor};
              text-align: ${alignment};
              background-color: ${backgroundColor};
              padding: ${padding}px;
              line-height: ${lineHeight};
              letter-spacing: ${letterSpacing}px;
              display: flex;
              flex-direction: column;
              overflow-wrap: break-word;
              word-wrap: break-word;
              white-space: normal;
            `;
            
            // Handle vertical alignment
            if (verticalAlignment === 'middle') {
              style += 'justify-content: center;';
            } else if (verticalAlignment === 'bottom') {
              style += 'justify-content: flex-end;';
            } else {
              style += 'justify-content: flex-start;';
            }
            
            deckCode += `
          <div class="component text-component" style="${style}">
            ${comp.props.text || ''}
          </div>`;
            break;
            
          case "Shape":
            const fill = comp.props.fill || '#4287f5';
            const stroke = comp.props.stroke || 'transparent';
            const strokeWidth = comp.props.strokeWidth || 0;
            const shapeType = comp.props.shapeType || 'rectangle';
            
            style += `
              background-color: ${fill};
              border: ${strokeWidth}px solid ${stroke};
            `;
            
            // Add shape-specific styles
            if (shapeType === 'circle') {
              style += 'border-radius: 50%;';
            } else if (shapeType === 'rounded') {
              style += 'border-radius: 8px;';
            }
            
            deckCode += `
          <div class="component shape-component" style="${style}"></div>`;
            break;
            
          case "Image":
            const src = comp.props.src || '';
            const alt = comp.props.alt || '';
            const objectFit = comp.props.objectFit || 'cover';
            const borderRadius = comp.props.borderRadius || 0;
            
            style += `
              border-radius: ${borderRadius}px;
              overflow: hidden;
            `;
            
            deckCode += `
          <div class="component image-component" style="${style}">
            <img src="${src}" alt="${alt}" style="object-fit: ${objectFit};">
          </div>`;
            break;
            
          // Add cases for other component types as needed
          
          default:
            // Generic component for unsupported types
            deckCode += `
          <div class="component generic-component" style="${style}">
            ${comp.type} Component
          </div>`;
        }
      });
      
      deckCode += `
        </div>
      </div>`;
    });
    
    deckCode += `
    </div>
  </div>
  <footer style="text-align: center; margin: 40px 0; color: #999; font-size: 12px;">
    Generated with Interactive Slide Sorcery
  </footer>
</body>
</html>
`;
    
    return deckCode;
  };

  // Export as JSON
  const handleExportJSON = async () => {
    try {
      setIsExporting(true);
      
      // Create a complete deck data with React components
      const data = await extractDeckComponents(deckName, slides);
      
      // Ensure we have CompleteDeckData - we know this is true when called with deckName
      const completeDeckData = data as CompleteDeckData;
      
      // Convert to string
      const deckString = JSON.stringify(completeDeckData, null, 2);
      
      // Create blob and download
      const blob = new Blob([deckString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      link.href = url;
      link.download = `${deckName}.json`;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: "JSON Export Complete",
        description: "Exported deck as JSON file",
      });
    } catch (error) {
      console.error("Error exporting deck as JSON:", error);
      toast({
        title: "Error exporting deck as JSON",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Export as HTML
  const handleExportHTML = async () => {
    try {
      setIsExporting(true);
      
      // Create a complete deck data with React components
      const data = await extractDeckComponents(deckName, slides);
      
      // Ensure we have CompleteDeckData
      const completeDeckData = data as CompleteDeckData;
      
      // Generate HTML content
      const htmlContent = generateHtmlExport(completeDeckData);
      const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
      const htmlUrl = URL.createObjectURL(htmlBlob);
      const htmlLink = document.createElement('a');
      
      htmlLink.href = htmlUrl;
      htmlLink.download = `${deckName}.html`;
      document.body.appendChild(htmlLink);
      htmlLink.click();
      
      // Cleanup
      document.body.removeChild(htmlLink);
      URL.revokeObjectURL(htmlUrl);
      
      toast({
        title: "HTML Export Complete",
        description: "Exported deck as standalone HTML file",
      });
    } catch (error) {
      console.error("Error exporting deck as HTML:", error);
      toast({
        title: "Error exporting deck as HTML",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  const startGoogleExport = async (mode: 'images' | 'editable') => {
    try {
      setIsExporting(true);
      // Ensure deck data is complete
      const { extractDeckComponents } = await import('@/lib/componentExtractor');
      const data = await extractDeckComponents(deckName, slides);
      const completeDeck = data as CompleteDeckData;
      const status = await googleIntegrationApi.getAuthStatus();
      if (!status.connected) {
        // Temporary hotfix: don't pass redirectUri until backend uses it only in state
        const url = await googleIntegrationApi.initiateAuth();
        window.location.href = url;
        return;
      }
      const jobId = mode === 'images'
        ? await googleIntegrationApi.exportSlidesImages(completeDeck, { title: completeDeck.name || deckName })
        : await googleIntegrationApi.exportSlidesEditable(completeDeck, { title: completeDeck.name || deckName, createNew: true });
      const job = await googleIntegrationApi.pollJob<{ presentationId: string; webViewLink?: string }>(jobId, { intervalMs: 1500, timeoutMs: 300000 });
      const link = (job.result as any)?.webViewLink;
      if (link) {
        window.open(link, '_blank');
        toast({ title: `Exported to Google Slides (${mode})`, description: 'Opening your presentation in a new tab.' });
      } else {
        toast({ title: 'Export complete', description: 'Your presentation has been created in Google Slides.' });
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Export failed', description: error.message || 'Please try again.' });
    } finally {
      setIsExporting(false);
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
          <FileJson size={14} className="mr-1" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleExportJSON} disabled={isExporting}>
          <FileJson size={14} className="mr-2" />
          Export as JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportHTML} disabled={isExporting}>
          <Layers size={14} className="mr-2" />
          Export as HTML
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => startGoogleExport('images')} disabled={isExporting}>
          {isExporting ? (<Loader2 size={14} className="mr-2 animate-spin" />) : (<UploadCloud size={14} className="mr-2" />)}
          Export to Google Slides (Images)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => startGoogleExport('editable')} disabled={isExporting}>
          {isExporting ? (<Loader2 size={14} className="mr-2 animate-spin" />) : (<UploadCloud size={14} className="mr-2" />)}
          Export to Google Slides (Editable)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default DeckExporter;
