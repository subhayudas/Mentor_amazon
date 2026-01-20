/**
 * File Storage Service using Supabase Storage
 * Handles file uploads directly from the client
 */

import { supabase } from './supabase';

const BUCKET_NAME = 'uploads';

class StorageService {
  /**
   * Upload a file to Supabase Storage
   * @param file - The file to upload
   * @param folder - Optional folder path within the bucket
   * @returns The public URL of the uploaded file
   */
  async uploadFile(file: File, folder: string = 'images'): Promise<string> {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      throw new Error('Only image files are allowed');
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error('File size exceeds 5MB limit');
    }

    // Generate unique filename
    const ext = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const filePath = `${folder}/${fileName}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Upload error:', error);
      throw new Error('Upload failed');
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  }

  /**
   * Upload a profile image
   * @param file - The image file
   * @param userId - The user's ID for organizing files
   * @returns The public URL of the uploaded image
   */
  async uploadProfileImage(file: File, userId: string): Promise<string> {
    return this.uploadFile(file, `profiles/${userId}`);
  }

  /**
   * Delete a file from storage
   * @param url - The full URL or path of the file
   */
  async deleteFile(url: string): Promise<void> {
    // Extract path from URL
    const path = url.includes(BUCKET_NAME) 
      ? url.split(`${BUCKET_NAME}/`)[1]
      : url;

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([path]);

    if (error) {
      console.error('Delete error:', error);
      throw new Error('Failed to delete file');
    }
  }

  /**
   * Get the public URL for a file path
   * @param path - The file path within the bucket
   * @returns The public URL
   */
  getPublicUrl(path: string): string {
    const { data } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(path);
    
    return data.publicUrl;
  }
}

// Export singleton instance
export const storage = new StorageService();

