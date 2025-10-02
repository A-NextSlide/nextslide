import { useState } from 'react';
import { outlineApi } from '@/services/outlineApi';
import { DeckOutline, SlideOutline } from '@/types/SlideTypes';
import { useToast } from '@/hooks/use-toast';

export const useSlideResearch = (
  currentOutline: DeckOutline | null,
  setCurrentOutline: React.Dispatch<React.SetStateAction<DeckOutline | null>>
) => {
  const { toast } = useToast();
  const [researchingSlides, setResearchingSlides] = useState<string[]>([]);
  const [completedResearchSlides, setCompletedResearchSlides] = useState<string[]>([]);
  const [totalResearchSlides, setTotalResearchSlides] = useState(0);
  const [isResearchExplicitlyStarted, setIsResearchExplicitlyStarted] = useState(false);

  const handleToggleDeepResearch = (slideId: string) => {
    if (!currentOutline) return;
    
    setCurrentOutline({
      ...currentOutline,
      slides: currentOutline.slides.map(slide =>
        slide.id === slideId ? { ...slide, deepResearch: !slide.deepResearch } : slide
      )
    });
  };

  const performResearchOnSlide = async (slideToResearch: SlideOutline) => {
    console.log('[useSlideResearch] performResearchOnSlide called for:', slideToResearch.title);
    console.trace(); // This will show the call stack
    
    if (!currentOutline) return;
    
    // Safety check: Only perform research if explicitly started by user
    if (!isResearchExplicitlyStarted) {
      console.warn('[useSlideResearch] Research attempted but not explicitly started by user');
      return;
    }
    
    // Check if slide has content BEFORE any state updates
    if (!slideToResearch.content || slideToResearch.content.trim() === '') {
      toast({
        title: "Cannot enhance empty slide",
        description: `Please add content to "${slideToResearch.title}" before enhancing.`,
        variant: "destructive"
      });
      return;
    }
    
    setResearchingSlides(prev => [...prev, slideToResearch.id]);
    try {
      // Create concise query combining title and content
      const slideContent = slideToResearch.content;
      const conciseQuery = `${slideToResearch.title}. ${slideContent}`;
      
      console.log(`Performing research on slide "${slideToResearch.title}" with query:`, conciseQuery);
      
      // Add small delay before starting research for smoother UX
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Use only essential content for web search to conserve tokens and costs
      const researchResult = await outlineApi.enhanceContent(conciseQuery);
      
      if (!researchResult.success) {
        throw new Error(researchResult.error || 'Content enhancement failed');
      }
      
      console.log('Research result:', researchResult);
      
      // Update the slide with enhanced content
      setCurrentOutline(prevOutline => {
        if (!prevOutline) return null;
        
        return {
          ...prevOutline,
          slides: prevOutline.slides.map(slide => {
            if (slide.id === slideToResearch.id) {
              // Access the enhanced content from the result object
              const enhancedContent = researchResult.result?.enhancedContent || researchResult.enhancedContent;
              const extractedData = researchResult.result?.extractedData || researchResult.extractedData;
              
              // Only update with enhanced content if research was successful
              const enhancedSlide = {
                ...slide,
                content: enhancedContent || slide.content,
                deepResearch: false // Turn off the toggle after research
              };
              
              // Merge extractedData if provided
              if (extractedData) {
                enhancedSlide.extractedData = extractedData;
              }
              
              return enhancedSlide;
            }
            return slide;
          })
        };
      });
      
      // Add to completed slides
      setCompletedResearchSlides(prev => [...prev, slideToResearch.id]);
      
      // If this is the last slide, show completion toast
      const remainingSlides = currentOutline.slides.filter(s => 
        s.deepResearch && !completedResearchSlides.includes(s.id) && s.id !== slideToResearch.id
      );
      
      if (remainingSlides.length === 0) {
        toast({
          title: "Research Complete",
          description: "All selected slides have been enhanced with research."
        });
      }
    } catch (error) {
      console.error('Error researching slide:', error instanceof Error ? error.message : 'Unknown error', error);
      toast({
        title: "Research Failed",
        description: `Failed to research slide "${slideToResearch.title}". ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
    } finally {
      setResearchingSlides(prev => prev.filter(id => id !== slideToResearch.id));
    }
  };

  const handleStartResearch = async () => {
    if (!currentOutline) return;
    
    // Filter slides that have deep research enabled AND have content
    const slidesToResearch = currentOutline.slides.filter(slide => 
      slide.deepResearch && slide.content && slide.content.trim() !== ''
    );
    
    // Check if any slides were marked but are empty
    const emptyMarkedSlides = currentOutline.slides.filter(slide => 
      slide.deepResearch && (!slide.content || slide.content.trim() === '')
    );
    
    if (emptyMarkedSlides.length > 0) {
      toast({
        title: "Empty slides detected",
        description: `${emptyMarkedSlides.length} slide(s) marked for enhancement have no content and will be skipped.`,
        variant: "default"
      });
    }
    
    if (slidesToResearch.length === 0) {
      toast({
        title: "No valid slides for enhancement",
        description: "Please add content to slides before enhancing them.",
        variant: "default"
      });
      return;
    }
    
    setTotalResearchSlides(slidesToResearch.length);
    setCompletedResearchSlides([]);
    setIsResearchExplicitlyStarted(true); // Set the flag to allow research
    
    toast({
      title: "Starting research",
      description: `Researching ${slidesToResearch.length} slide${slidesToResearch.length > 1 ? 's' : ''}...`
    });
    
    // Process slides sequentially (one at a time)
    for (const slide of slidesToResearch) {
      await performResearchOnSlide(slide);
    }
    
    // Reset the flag after all research is complete
    setIsResearchExplicitlyStarted(false);
  };

  return {
    researchingSlides,
    completedResearchSlides,
    totalResearchSlides,
    handleToggleDeepResearch,
    handleStartResearch
  };
}; 