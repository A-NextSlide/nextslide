import React, { useState, useRef } from 'react';
import { Upload, Link, Loader2, Check } from 'lucide-react';
import { createUploadHandler } from '@/utils/fileUploadUtils';
import { useToast } from '@/hooks/use-toast';
import { cn } from "@/lib/utils";

interface ImageTabProps {
    onSelect: (url: string, type: 'image') => void;
}

export const ImageTab: React.FC<ImageTabProps> = ({ onSelect }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [imageUrl, setImageUrl] = useState('');
    const { toast } = useToast();

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        handleFileUpload(files[0]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragOver(false);
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const imageFile = Array.from(files).find(file => file.type.startsWith('image/'));
            if (imageFile) {
                handleFileUpload(imageFile);
            } else {
                toast({ title: "Invalid file", description: "Please drop an image file.", variant: "default" });
            }
        }
    };

    const handleFileUpload = async (file: File) => {
        if (!file || !file.type.startsWith('image/')) {
            toast({ title: "Invalid file", description: "Please select an image.", variant: "default" });
            return;
        }

        setIsUploading(true);
        try {
            const uploadHandler = createUploadHandler(
                (url: string) => {
                    setIsUploading(false);
                    toast({ title: "Upload successful" });
                    onSelect(url, 'image');
                },
                (error: Error) => {
                    setIsUploading(false);
                    toast({ title: "Upload failed", description: error.message, variant: "destructive" });
                }
            );
            await uploadHandler(file);
        } catch (error) {
            setIsUploading(false);
            toast({ title: "Upload error", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
        }
    };

    const handleAddFromUrl = () => {
        if (!imageUrl.trim()) return;
        onSelect(imageUrl.trim(), 'image');
        setImageUrl('');
    };

    return (
        <div className="space-y-2">
            {/* Upload — compact drop zone */}
            <div
                className={cn(
                    "w-full rounded-md border-[1.5px] border-dashed flex items-center justify-center gap-2 py-5 cursor-pointer transition-colors",
                    dragOver
                        ? "border-orange-400 bg-orange-50/50 dark:bg-orange-500/10"
                        : "border-border/60 hover:border-orange-300 hover:bg-muted/40"
                )}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                />
                {isUploading ? (
                    <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        <span className="text-[11px] text-muted-foreground">Uploading...</span>
                    </>
                ) : (
                    <>
                        <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-[11px] text-muted-foreground">Drop image or click to upload</span>
                    </>
                )}
            </div>

            {/* URL input — inline */}
            <div className="flex gap-1">
                <div className="relative flex-1">
                    <Link className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                    <input
                        type="url"
                        placeholder="Paste image URL..."
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') handleAddFromUrl();
                        }}
                        className={cn(
                            "flex h-7 w-full rounded-md border border-input bg-background pl-7 pr-2 py-1 text-[11px]",
                            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        )}
                    />
                </div>
                <button
                    onClick={handleAddFromUrl}
                    disabled={!imageUrl.trim()}
                    className="flex items-center justify-center h-7 w-7 rounded-md border border-input bg-background hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0 disabled:opacity-40"
                >
                    <Check className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    );
};
