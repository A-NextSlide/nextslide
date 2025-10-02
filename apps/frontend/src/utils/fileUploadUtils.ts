import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from 'uuid';

/**
 * Try to upload a file directly using a fixed bucket name
 * 
 * @param file - The file to upload
 * @param bucketName - The bucket name to use
 * @returns The public URL of the uploaded file or null if failed
 */
const tryUploadToBucket = async (file: File, bucketName: string): Promise<string | null> => {
  try {
    console.log(`Attempting upload to bucket: ${bucketName}`);
    
    // Generate a unique filename with UUID and timestamp
    const timestamp = new Date().getTime();
    const uuid = uuidv4().substring(0, 8);
    const fileExt = file.name.split('.').pop() || 'bin';
    const filename = `${timestamp}_${uuid}.${fileExt}`;
    
    // Convert File to ArrayBuffer for direct upload
    const arrayBuffer = await file.arrayBuffer();
    
    // Try to upload to this bucket
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filename, arrayBuffer, {
        contentType: file.type,
        upsert: true
      });
      
    if (error) {
      console.log(`Upload to ${bucketName} failed:`, error.message);
      return null;
    }
    
    console.log(`Upload to ${bucketName} succeeded:`, data);
    
    // Get the public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filename);
      
    return urlData.publicUrl;
  } catch (err) {
    console.log(`Error uploading to ${bucketName}:`, err);
    return null;
  }
};

/**
 * Uploads a file to Supabase storage by trying multiple bucket names
 * 
 * @param file - The file to upload
 * @returns The public URL of the uploaded file
 */
export const uploadFile = async (file: File): Promise<string> => {
  const primaryBucket = 'slide-media';
  
  try {
    console.log(`Attempting to upload file: ${file.name} (${file.size} bytes, ${file.type}) to bucket: ${primaryBucket}`);
    
    const url = await tryUploadToBucket(file, primaryBucket);
    
    if (url) {
      console.log(`Successfully uploaded to ${primaryBucket}, URL: ${url}`);
      return url;
    } else {
      // If the primary bucket fails, throw an error immediately
      // The specific error from tryUploadToBucket would have been logged already
      throw new Error(
        `Failed to upload file to the '${primaryBucket}' bucket. ` +
        `Please check the console logs for details and ensure the bucket exists and has the correct permissions (including RLS policies).`
      );
    }
  } catch (err) {
    console.error('Upload error:', err);
    
    // Re-throw a user-friendly error message
    if (err instanceof Error && err.message) {
      // Append the original error message for context if available
      throw new Error(`Upload failed: ${err.message}`);
    } else {
      throw new Error(`Upload failed for an unknown reason. Check console logs for bucket: ${primaryBucket}`);
    }
  }
};

/**
 * Creates a file upload handler
 * 
 * @param onSuccess - Callback function when upload succeeds
 * @param onError - Callback function when upload fails
 * @returns An upload handler function
 */
export const createUploadHandler = (
  onSuccess: (url: string) => void,
  onError: (error: Error) => void
) => {
  return async (file: File): Promise<void> => {
    try {
      const url = await uploadFile(file);
      onSuccess(url);
    } catch (error) {
      console.error('Upload handler error:', error);
      onError(error instanceof Error ? error : new Error('Unknown upload error'));
    }
  };
};

/**
 * Uploads a URL (fetches it) to a fixed path in a Supabase bucket.
 * Useful for seeding placeholders that should have stable URLs.
 */
export const uploadUrlToFixedPath = async (
  sourceUrl: string,
  bucket: string,
  path: string,
  contentTypeHint?: string,
  upsert: boolean = true
): Promise<string> => {
  const resp = await fetch(sourceUrl, { credentials: 'include' }).catch(() => null as any);
  if (!resp || !resp.ok) {
    throw new Error(`Failed to fetch asset from ${sourceUrl}`);
  }
  const blob = await resp.blob();
  const contentType = contentTypeHint || blob.type || 'application/octet-stream';
  const arrayBuffer = await blob.arrayBuffer();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, arrayBuffer, {
      contentType,
      upsert
    });
  if (error) {
    throw new Error(error.message || 'Upload failed');
  }
  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);
  return urlData.publicUrl;
};