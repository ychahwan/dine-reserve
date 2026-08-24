import { Camera, CameraResultType, CameraSource, Photo } from "@capacitor/camera";
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

  const processPhoto = useCallback(
    (result: Photo, options?: UseCameraOptions) => {
      setPhoto(result);
      if (result.base64String) {
        setPhotoBase64(result.base64String);
      }
      return result;
    },
    [],
  );

  const takePhoto = useCallback(
    async (options?: UseCameraOptions): Promise<Photo | null> => {
      setLoading(true);
      setError(null);
      try {
        const mergedOptions = {
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.Base64,
          source: CameraSource.Camera,
          ...defaultOptions,
          ...options,
        };

        const result = await Camera.getPhoto(mergedOptions);
        return processPhoto(result, options);
      } catch (err: any) {
        // User cancelled - not an error
        if (err?.message?.includes("cancel") || err?.message?.includes("Cancel")) {
          return null;
        }
        setError(err?.message || "Failed to take photo");
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
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.Base64,
          source: CameraSource.Photos,
          ...defaultOptions,
          ...options,
        };

        const result = await Camera.getPhoto(mergedOptions);
        return processPhoto(result, options);
      } catch (err: any) {
        if (err?.message?.includes("cancel") || err?.message?.includes("Cancel")) {
          return null;
        }
        setError(err?.message || "Failed to pick photo");
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
