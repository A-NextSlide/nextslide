import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Link } from 'lucide-react';
import { createUploadHandler } from '@/utils/fileUploadUtils';
import { useToast } from '@/hooks/use-toast';
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

interface VideoTabProps {
    onSelect: (url: string, type: 'video') => void; // Only video type for this tab
}

export const VideoTab: React.FC<VideoTabProps> = ({ onSelect }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [videoUrl, setVideoUrl] = useState('');
    const { toast } = useToast();

    const handleUploadButtonClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        handleFileUpload(files[0]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            // Filter for video files only on drop
            const videoFile = Array.from(files).find(file => file.type.startsWith('video/'));
            if (videoFile) {
                handleFileUpload(videoFile);
            } else {
                toast({ title: "Invalid File Type", description: "Please drop video files only.", variant: "default" });
            }
        }
    };

    const handleFileUpload = async (file: File) => {
        if (!file || !file.type.startsWith('video/')) {
            toast({ title: "Invalid File Type", description: "Please select a video file.", variant: "default" });
            return;
        }

        // Check file size (max 100MB for videos)
        const maxSize = 100 * 1024 * 1024; // 100MB
        if (file.size > maxSize) {
            toast({ 
                title: "File Too Large", 
                description: "Please select a video file smaller than 100MB.", 
                variant: "destructive" 
            });
            return;
        }

        setIsUploading(true);
        try {
            const uploadHandler = createUploadHandler(
                (url: string) => {
                    setIsUploading(false);
                    toast({ title: "Upload successful", description: "Video uploaded." });
                    onSelect(url, 'video'); // Pass back url and type
                },
                (error: Error) => {
                    setIsUploading(false);
                    console.error('Upload Error:', error);
                    toast({ title: "Upload Failed", description: error.message || "An unknown error occurred.", variant: "destructive" });
                }
            );
            await uploadHandler(file);
        } catch (error) {
            setIsUploading(false);
            console.error('File Handling Error:', error);
            const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred.";
            toast({ title: "Upload Error", description: errorMessage, variant: "destructive" });
        }
    };

    const handleAddFromUrl = () => {
        if (!videoUrl.trim()) {
            toast({ title: "Missing URL", description: "Please enter a video URL.", variant: "default" });
            return;
        }
        
        // Basic validation for common video URLs
        const isValidVideoUrl = (url: string) => {
            // Check for common video platforms
            const videoPatterns = [
                /youtube\.com\/watch\?v=/,
                /youtu\.be\//,
                /vimeo\.com\//,
                /loom\.com\//,
                /\.(mp4|webm|ogg|mov|avi)$/i
            ];
            return videoPatterns.some(pattern => pattern.test(url));
        };

        if (!videoUrl.startsWith('http://') && !videoUrl.startsWith('https://')) {
            toast({ title: "Invalid URL", description: "Please enter a valid video URL (starting with http/https).", variant: "default" });
            return;
        }

        if (!isValidVideoUrl(videoUrl)) {
            toast({ 
                title: "URL Warning", 
                description: "This doesn't look like a video URL. Continuing anyway.", 
                variant: "default" 
            });
        }
        
        console.log("Adding video from URL:", videoUrl);
        onSelect(videoUrl, 'video');
        setVideoUrl(''); // Clear input after selection
    };

    return (
        <div className="space-y-4">
            {/* Upload Section */}
            <div
                className={cn(
                    "w-full h-32 border-2 border-dashed border-muted-foreground/50 rounded-md flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors",
                    dragOver && "border-primary bg-primary/10"
                )}
                onClick={handleUploadButtonClick}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
                onDrop={handleDrop}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="video/*" // Only accept video files
                    className="hidden"
                />
                {isUploading ? (
                    <>
                        <svg className="animate-spin h-6 w-6 text-primary mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p className="text-sm text-muted-foreground">Uploading...</p>
                    </>
                ) : (
                    <>
                        <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                        <p className="text-xs font-medium">Drag & drop video or click to browse</p>
                        <p className="text-xs text-muted-foreground">(Max 100MB)</p>
                    </>
                )}
            </div>

            {/* Separator */}
            <div className="flex items-center space-x-2">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">OR</span>
                <Separator className="flex-1" />
            </div>

            {/* URL Input Section */}
            <div className="space-y-2">
                <label htmlFor="videoUrl" className="text-xs font-medium">Add video from URL</label>
                <div className="flex space-x-2">
                    <Input 
                        id="videoUrl"
                        type="url" 
                        placeholder="https://youtube.com/watch?v=..."
                        value={videoUrl}
                        onChange={(e) => setVideoUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddFromUrl()}
                        className="h-8 text-xs"
                    />
                    <Button variant="outline" size="sm" onClick={handleAddFromUrl} className="h-8 px-3">
                        <Link className="h-3.5 w-3.5 mr-1.5" /> Add
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                    Supports YouTube, Vimeo, Loom, and direct video files
                </p>
            </div>
        </div>
    );
}; 