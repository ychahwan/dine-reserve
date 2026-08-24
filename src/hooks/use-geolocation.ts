import { Geolocation, Position } from "@capacitor/geolocation";
import { useState, useCallback, useEffect } from "react";

interface LocationCoords {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
}

interface UseGeolocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
  autoFetch?: boolean;
}

interface UseGeolocationReturn {
  position: LocationCoords | null;
  loading: boolean;
  error: string | null;
  getCurrentPosition: () => Promise<LocationCoords | null>;
  watchPosition: () => Promise<string>;
  clearWatch: (watchId: string) => Promise<void>;
  requestPermission: () => Promise<boolean>;
}

/**
 * Hook for getting device location with Geolocation API.
 *
 * @example
 * ```tsx
 * const { position, getCurrentPosition, loading, error } = useGeolocation();
 *
 * const findNearbyRestaurants = async () => {
 *   const loc = await getCurrentPosition();
 *   if (loc) {
 *     // Search restaurants near loc.latitude, loc.longitude
 *   }
 * };
 * ```
 */
export function useGeolocation(
  options?: UseGeolocationOptions,
): UseGeolocationReturn {
  const [position, setPosition] = useState<LocationCoords | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultOptions = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 60000, // Cache for 1 minute
    autoFetch: false,
    ...options,
  };

  const processPosition = useCallback((pos: Position): LocationCoords => {
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      altitude: pos.coords.altitude ?? null,
      altitudeAccuracy: pos.coords.altitudeAccuracy ?? null,
      heading: pos.coords.heading,
      speed: pos.coords.speed,
    };
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const permission = await Geolocation.requestPermissions();
      return permission.location === "granted";
    } catch (err: any) {
      setError(err?.message || "Failed to request location permission");
      return false;
    }
  }, []);

  const getCurrentPosition = useCallback(async (): Promise<LocationCoords | null> => {
    setLoading(true);
    setError(null);
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: defaultOptions.enableHighAccuracy,
        timeout: defaultOptions.timeout,
        maximumAge: defaultOptions.maximumAge,
      });
      const coords = processPosition(pos);
      setPosition(coords);
      return coords;
    } catch (err: any) {
      if (err?.message?.includes("cancel") || err?.message?.includes("Cancel")) {
        return null;
      }
      setError(err?.message || "Failed to get location");
      return null;
    } finally {
      setLoading(false);
    }
  }, [defaultOptions, processPosition]);

  const watchPosition = useCallback(async (): Promise<string> => {
    try {
      const watchId = await Geolocation.watchPosition(
        {
          enableHighAccuracy: defaultOptions.enableHighAccuracy,
          timeout: defaultOptions.timeout,
          maximumAge: defaultOptions.maximumAge,
        },
        (pos) => {
          if (pos) {
            setPosition(processPosition(pos));
          }
        },
      );
      return watchId.toString();
    } catch (err: any) {
      setError(err?.message || "Failed to watch position");
      return "";
    }
  }, [defaultOptions, processPosition]);

  const clearWatch = useCallback(async (watchId: string): Promise<void> => {
    try {
      await Geolocation.clearWatch({ id: watchId });
    } catch (err: any) {
      console.error("Failed to clear watch:", err);
    }
  }, []);

  // Auto-fetch on mount if enabled
  useEffect(() => {
    if (defaultOptions.autoFetch) {
      getCurrentPosition();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    position,
    loading,
    error,
    getCurrentPosition,
    watchPosition,
    clearWatch,
    requestPermission,
  };
}
