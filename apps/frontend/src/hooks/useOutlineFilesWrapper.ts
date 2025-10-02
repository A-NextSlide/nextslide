/**
 * Hook that provides file management for outline generation
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { DeckOutline, SlideOutline, TaggedMedia } from '@/types/SlideTypes';
import { v4 as uuidv4 } from 'uuid';
import { outlineApi } from '@/services/outlineApi';
import { determineFileType } from '@/lib/fileUtils';

interface UseOutlineFilesWrapperProps {
  currentOutline: DeckOutline | null;
  setCurrentOutline: React.Dispatch<React.SetStateAction<DeckOutline | null>>;
  initialUploadedFiles?: File[];
}

export const useOutlineFilesWrapper = ({
  currentOutline,
  setCurrentOutline,
  initialUploadedFiles = [],
}: UseOutlineFilesWrapperProps) => {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>(initialUploadedFiles);
  
  
  const [animatingOutUploadedFileKeys, setAnimatingOutUploadedFileKeys] = useState<Set<string>>(new Set());
  const [isProcessingMedia, setIsProcessingMedia] = useState(false);
  const [processingFileIds, setProcessingFileIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const getFileKey = useCallback((file: File): string => `${file.name}-${file.size}-${file.lastModified}`, []);
  
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const allFiles = Array.from(e.target.files || []);
    const newFiles = allFiles.filter(newFile => 
      !uploadedFiles.some(existingFile => getFileKey(existingFile) === getFileKey(newFile))
    );
    
    if (newFiles.length > 0) {
      // Just add to uploaded files - they'll be sent with the outline generation request
      setUploadedFiles(prev => [...prev, ...newFiles]);
    }
    
    if (e.target.value) e.target.value = ''; // Reset file input
  }, [uploadedFiles, getFileKey]);
  
  const handleFilesDroppedOnSlide = useCallback(async (files: File[], targetSlideId: string) => {
    if (!currentOutline) return;
    
    // Filter out files that are already being processed
    const newFiles = files.filter(newFile => 
      !uploadedFiles.some(existingFile => getFileKey(existingFile) === getFileKey(newFile))
    );
    
    if (newFiles.length === 0) return;
    
    // Add files to uploadedFiles
    setUploadedFiles(prev => [...prev, ...newFiles]);
    setIsProcessingMedia(true);
    
    // Create pending tagged media entries for each file
    const pendingMedia: TaggedMedia[] = await Promise.all(newFiles.map(async (file) => {
      const fileId = uuidv4();
      const fileType = determineFileType(file);
      
      // Create preview URL for images
      let previewUrl: string | undefined;
      if (fileType === 'image') {
        previewUrl = URL.createObjectURL(file);
      }
      
      return {
        id: fileId,
        filename: file.name,
        type: fileType,
        content: file,
        previewUrl,
        interpretation: 'Processing...',
        slideId: targetSlideId,
        status: 'pending' as const,
        metadata: {},
        // Add original file reference for easier access
        originalFile: file
      };
    }));
    
    // Add pending media to the slide
    setCurrentOutline(prev => {
      if (!prev) return null;
      
      const updatedSlides = prev.slides.map(slide => {
        if (slide.id === targetSlideId) {
          const existingMedia = slide.taggedMedia || [];
          return {
            ...slide,
            taggedMedia: [...existingMedia, ...pendingMedia]
          };
        }
        return slide;
      });
      
      return { ...prev, slides: updatedSlides };
    });
    
    // Process files through media interpretation API
    try {
      console.log(`[useOutlineFilesWrapper] Processing ${pendingMedia.length} files for slide ${targetSlideId}`);
      
      // Track which files we're processing
      const fileIds = pendingMedia.map(media => media.id);
      setProcessingFileIds(prev => {
        const newSet = new Set(prev);
        fileIds.forEach(id => newSet.add(id));
        return newSet;
      });
      
      // Prepare files with their IDs for the API
      const filesWithIds = pendingMedia.map(media => ({
        id: media.id,
        file: media.content as File
      }));
      
      // Call the interpret media API
      console.log('[useOutlineFilesWrapper] Calling interpretMedia API...');
      const interpretedMedia = await outlineApi.interpretMedia(
        filesWithIds,
        currentOutline.slides
      );
      console.log(`[useOutlineFilesWrapper] Received ${interpretedMedia.length} interpreted media items`);
      
      // Update the media with interpretation results
      setCurrentOutline(prev => {
        if (!prev) return null;
        
        const updatedSlides = prev.slides.map(slide => {
          if (slide.id === targetSlideId) {
            const updatedMedia = (slide.taggedMedia || []).map(media => {
              const interpretation = interpretedMedia.find(im => im.id === media.id);
              if (interpretation) {
                return {
                  ...media,
                  interpretation: interpretation.interpretation,
                  status: 'processed' as const,
                  metadata: interpretation.metadata || {},
                  slideId: interpretation.slideId || targetSlideId
                };
              }
              return media;
            });
            
            return { ...slide, taggedMedia: updatedMedia };
          }
          return slide;
        });
        
        return { ...prev, slides: updatedSlides };
      });
      
      // Remove from processing set
      setProcessingFileIds(prev => {
        const newSet = new Set(prev);
        fileIds.forEach(id => newSet.delete(id));
        return newSet;
      });
      
      // Clean up preview URLs for processed images
      pendingMedia.forEach(media => {
        if (media.previewUrl && media.type === 'image') {
          URL.revokeObjectURL(media.previewUrl);
        }
      });
      
    } catch (error) {
      console.error('Error interpreting media:', error);
      
      // Update status to show error
      setCurrentOutline(prev => {
        if (!prev) return null;
        
        const updatedSlides = prev.slides.map(slide => {
          if (slide.id === targetSlideId) {
            const updatedMedia = (slide.taggedMedia || []).map(media => {
              if (pendingMedia.some(pm => pm.id === media.id)) {
                return {
                  ...media,
                  interpretation: 'Error processing file',
                  status: 'processed' as const
                };
              }
              return media;
            });
            
            return { ...slide, taggedMedia: updatedMedia };
          }
          return slide;
        });
        
        return { ...prev, slides: updatedSlides };
      });
    } finally {
      setIsProcessingMedia(false);
    }
  }, [uploadedFiles, getFileKey, currentOutline, setCurrentOutline]);
  
  const handleRemoveUploadedFile = useCallback((fileKey: string) => {
    setUploadedFiles(prev => prev.filter(file => getFileKey(file) !== fileKey));
    
    // Remove from animating keys if present
    setAnimatingOutUploadedFileKeys(prev => {
      const updated = new Set(prev);
      updated.delete(fileKey);
      return updated;
    });
  }, [getFileKey]);
  
  const handleClearAllUploadedFiles = useCallback(() => {
    setUploadedFiles([]);
    setAnimatingOutUploadedFileKeys(new Set());
  }, []);
  
  return {
    uploadedFiles,
    setUploadedFiles,
    isProcessingMedia,
    animatingOutUploadedFileKeys,
    fileInputRef,
    getFileKey,
    handleUploadClick,
    handleFileChange,
    handleFilesDroppedOnSlide,
    handleRemoveUploadedFile,
    handleClearAllUploadedFiles,
  };
}; 