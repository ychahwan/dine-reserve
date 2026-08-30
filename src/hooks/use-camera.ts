import {
  Camera,
  CameraResultType,
  CameraSource,
  Photo,
} from "@capacitor/camera";
import { useState, useCallback } from "react";

interface UseCameraOptions {
  quality?: number;
  allowEditing?: boolean;
  resultType?: CameraResultType;
  source?: CameraSource;
  width?: number;
  height?: number;
}

interface UseCameraReturn {
  photo: Photo | null;
  photoBase64: string | null;
  loading: boolean;
  error: string | null;
  takePhoto: (options?: UseCameraOptions) => Promise<Photo | null>;
  pickFromGallery: (options?: UseCameraOptions) => Promise<Photo | null>;
  clearPhoto: () => void;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Hook for taking photos with the device camera or picking from gallery.
 *
 * @example
 * ```tsx
 * const { takePhoto, photoBase64, loading } = useCamera();
 *
 * const handleCapture = async () => {
 *   const photo = await takePhoto();
 *   if (photo) {
 *     // Upload photoBase64 to your server
 *   }
 * };
 * ```
 */
export function useCamera(defaultOptions?: UseCameraOptions): UseCameraReturn {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processPhoto = useCallback((result: Photo) => {
    setPhoto(result);
    // Null out when the result carries no base64 (Uri/DataUrl resultType) —
    // otherwise a stale base64 from the previous capture lingers here while
    // the UI previews the new photo, mismatching uploads (M-36).
    setPhotoBase64(result.base64String ?? null);
    return result;
  }, []);

  const takePhoto = useCallback(
    async (options?: UseCameraOptions): Promise<Photo | null> => {
      setLoading(true);
      setError(null);
      try {
        const mergedOptions = {
          quality: 70,
          width: 1600,
          height: 1600,
          allowEditing: false,
          resultType: CameraResultType.Base64,
          source: CameraSource.Camera,
          ...defaultOptions,
          ...options,
        };

        const result = await Camera.getPhoto(mergedOptions);
        return processPhoto(result);
      } catch (err: unknown) {
        // User cancelled - not an error
        if (
          errorMessage(err, "").includes("cancel") ||
          errorMessage(err, "").includes("Cancel")
        ) {
          return null;
        }
        setError(errorMessage(err, "Failed to take photo"));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [defaultOptions, processPhoto],
  );

  const pickFromGallery = useCallback(
    async (options?: UseCameraOptions): Promise<Photo | null> => {
      setLoading(true);
      setError(null);
      try {
        const mergedOptions = {
          quality: 70,
          width: 1600,
          height: 1600,
          allowEditing: false,
          resultType: CameraResultType.Base64,
          source: CameraSource.Photos,
          ...defaultOptions,
          ...options,
        };

        const result = await Camera.getPhoto(mergedOptions);
        return processPhoto(result);
      } catch (err: unknown) {
        if (
          errorMessage(err, "").includes("cancel") ||
          errorMessage(err, "").includes("Cancel")
        ) {
          return null;
        }
        setError(errorMessage(err, "Failed to pick photo"));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [defaultOptions, processPhoto],
  );

  const clearPhoto = useCallback(() => {
    setPhoto(null);
    setPhotoBase64(null);
    setError(null);
  }, []);

  return {
    photo,
    photoBase64,
    loading,
    error,
    takePhoto,
    pickFromGallery,
    clearPhoto,
  };
}
