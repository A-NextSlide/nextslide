import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Link } from 'lucide-react';
import { createUploadHandler } from '@/utils/fileUploadUtils';
import { useToast } from '@/hooks/use-toast';
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

interface ImageTabProps {
    onSelect: (url: string, type: 'image') => void; // Only image type for this tab
}

export const ImageTab: React.FC<ImageTabProps> = ({ onSelect }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [imageUrl, setImageUrl] = useState('');
    const { toast } = useToast();

    const handleUploadButtonClick = () => {
        fileInputRef.current?.click();
    };

    // We know it's an image here, or we wouldn't allow the upload
    const determineMediaType = (file: File): 'image' | 'other' => {
        if (file.type.startsWith('image/')) return 'image';
        return 'other'; // Should ideally not happen with accept="image/*"
    }

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
            // Filter for image files only on drop
            const imageFile = Array.from(files).find(file => file.type.startsWith('image/'));
            if (imageFile) {
                handleFileUpload(imageFile);
            } else {
                toast({ title: "Invalid File Type", description: "Please drop image files only.", variant: "default" });
            }
        }
    };

    const handleFileUpload = async (file: File) => {
        if (!file || !file.type.startsWith('image/')) {
            toast({ title: "Invalid File Type", description: "Please select an image file.", variant: "default" });
            return;
        }

        setIsUploading(true);
        try {
            const uploadHandler = createUploadHandler(
                (url: string) => {
                    setIsUploading(false);
                    toast({ title: "Upload successful", description: "Image uploaded." });
                    onSelect(url, 'image'); // Pass back url and type
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
        if (!imageUrl.trim()) {
            toast({ title: "Missing URL", description: "Please enter an image URL.", variant: "default" });
            return;
        }
        // Basic validation (can be improved)
        if (!imageUrl.match(/\.(jpeg|jpg|gif|png|webp|svg)$/i)) {
             toast({ title: "Invalid URL?", description: "URL does not look like an image link.", variant: "default" });
             // Decide whether to proceed or return - for now, let's allow it
             // return;
        }
        console.log("Adding image from URL:", imageUrl);
        onSelect(imageUrl, 'image');
        setImageUrl(''); // Clear input after selection
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
                    accept="image/*" // Only accept image files
                    className="hidden"
                />
                {isUploading ? (
                    <>
                        <svg className="animate-spin h-6 w-6 text-primary mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        <p className="text-sm text-muted-foreground">Uploading...</p>
                    </>
                ) : (
                    <>
                        <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                        <p className="text-xs font-medium">Drag & drop image or click to browse</p>
                        {/* <p className="text-xs text-muted-foreground">(Max 10MB)</p> */} 
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
                <label htmlFor="imageUrl" className="text-xs font-medium">Add image from URL</label>
                <div className="flex space-x-2">
                    <Input 
                        id="imageUrl"
                        type="url" 
                        placeholder="https://example.com/image.png"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddFromUrl()}
                        className="h-8 text-xs"
                    />
                    <Button variant="outline" size="sm" onClick={handleAddFromUrl} className="h-8 px-3">
                         <Link className="h-3.5 w-3.5 mr-1.5" /> Add
                    </Button>
                </div>
            </div>
        </div>
    );
}; 