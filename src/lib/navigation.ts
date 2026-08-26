/**
 * Navigation utilities — open maps to guide users to a restaurant.
 *
 * Supports:
 * - Google Maps (default, works everywhere)
 * - Apple Maps (iOS devices)
 * - Waze (if installed)
 * - OpenStreetMap (fallback)
 *
 * Uses the browser Geolocation API to get the user's current location,
 * then opens the preferred map app with directions to the restaurant.
 */

export type MapProvider = "google" | "apple" | "waze" | "osm";

interface NavigationOptions {
  /** Restaurant street address (e.g. "123 Main St, Milan, Italy") */
  address: string;
  /** Restaurant city for fallback geocoding */
  city?: string;
  /** Restaurant neighborhood for display */
  neighborhood?: string;
  /** Latitude of destination (if known) */
  lat?: number;
  /** Longitude of destination (if known) */
  lng?: number;
  /** Preferred map provider. Defaults to auto-detect. */
  provider?: MapProvider;
}

/**
 * Detect the best map provider based on the user's device.
 */
function detectProvider(): MapProvider {
  const ua = navigator.userAgent;
  // iOS → Apple Maps
  if (/iPad|iPhone|iPod/.test(ua) && !("MSStream" in window)) {
    return "apple";
  }
  // Android → Google Maps
  if (/Android/.test(ua)) {
    return "google";
  }
  // Desktop → Google Maps
  return "google";
}

/**
 * Get the user's current geolocation.
 * Returns null if permission denied or unavailable.
 */
function getUserLocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 60000 },
    );
  });
}

/**
 * Build the full address string for geocoding.
 */
function buildFullAddress(address: string, city?: string, neighborhood?: string): string {
  const parts = [address];
  if (neighborhood && !address.toLowerCase().includes(neighborhood.toLowerCase())) {
    parts.push(neighborhood);
  }
  if (city && !address.toLowerCase().includes(city.toLowerCase())) {
    parts.push(city);
  }
  return parts.join(", ");
}

/**
 * Open Google Maps with directions from user's location to the restaurant.
 */
function openGoogleMaps(dest: string, origin?: { lat: number; lng: number }): void {
  const destEncoded = encodeURIComponent(dest);
  if (origin) {
    // Directions mode: origin → destination
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destEncoded}&travelmode=driving`;
    window.open(url, "_blank");
  } else {
    // Just show the location (no directions)
    const url = `https://www.google.com/maps/search/?api=1&query=${destEncoded}`;
    window.open(url, "_blank");
  }
}

/**
 * Open Apple Maps with directions.
 */
function openAppleMaps(dest: string, origin?: { lat: number; lng: number }): void {
  const destEncoded = encodeURIComponent(dest);
  if (origin) {
    const url = `https://maps.apple.com/?saddr=${origin.lat},${origin.lng}&daddr=${destEncoded}&dirflg=d`;
    window.open(url, "_blank");
  } else {
    const url = `https://maps.apple.com/?q=${destEncoded}`;
    window.open(url, "_blank");
  }
}

/**
 * Open Waze with directions.
 * Waze's deep link only routes reliably to lat,lng — fall back to a text
 * search when the restaurant has no known coordinates.
 */
function openWaze(
  dest: string,
  origin?: { lat: number; lng: number },
  destCoords?: { lat: number; lng: number },
): void {
  if (destCoords) {
    // q=lat,lng is Waze's documented search shape for exact locations.
    const url = `https://www.waze.com/ul?q=${destCoords.lat},${destCoords.lng}&navigate=yes`;
    window.open(url, "_blank");
    return;
  }
  const destEncoded = encodeURIComponent(dest);
  if (origin) {
    const url = `https://www.waze.com/ul?ll=${origin.lat},${origin.lng}&q=${destEncoded}&navigate=yes`;
    window.open(url, "_blank");
  } else {
    const url = `https://www.waze.com/ul?q=${destEncoded}`;
    window.open(url, "_blank");
  }
}

/**
 * Open OpenStreetMap with directions.
 * OSM's route planner needs coordinate pairs — without them, defer to Google
 * Maps which geocodes free-text addresses.
 */
function openOSM(
  dest: string,
  origin?: { lat: number; lng: number },
  destCoords?: { lat: number; lng: number },
): void {
  if (!destCoords) {
    openGoogleMaps(dest, origin);
    return;
  }
  if (origin) {
    const url = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${origin.lat},${origin.lng};${destCoords.lat},${destCoords.lng}`;
    window.open(url, "_blank");
  } else {
    const url = `https://www.openstreetmap.org/?mlat=${destCoords.lat}&mlon=${destCoords.lng}#map=17/${destCoords.lat}/${destCoords.lng}`;
    window.open(url, "_blank");
  }
}

/**
 * Main function: open maps to navigate to a restaurant.
 *
 * Usage:
 * ```ts
 * import { openNavigation } from "@/lib/navigation";
 *
 * openNavigation({
 *   address: "Via Roma 15, Milan",
 *   city: "Milan",
 *   neighborhood: "Brera",
 * });
 * ```
 */
export async function openNavigation(options: NavigationOptions): Promise<void> {
  const {
    address,
    city,
    neighborhood,
    lat,
    lng,
    provider: requestedProvider,
  } = options;

  const provider = requestedProvider ?? detectProvider();
  const fullAddress = buildFullAddress(address, city, neighborhood);
  // Coordinate-aware providers (Waze/OSM) only get offered/routed with real coords.
  const destCoords =
    typeof lat === "number" && typeof lng === "number"
      ? { lat, lng }
      : undefined;

  // Try to get user's location for turn-by-turn directions
  const userLocation = await getUserLocation();

  switch (provider) {
    case "apple":
      openAppleMaps(fullAddress, userLocation ?? undefined);
      break;
    case "waze":
      openWaze(fullAddress, userLocation ?? undefined, destCoords);
      break;
    case "osm":
      openOSM(fullAddress, userLocation ?? undefined, destCoords);
      break;
    case "google":
    default:
      openGoogleMaps(fullAddress, userLocation ?? undefined);
      break;
  }
}

/**
 * Quick access: open a map provider picker.
 * Shows available options and lets the user choose.
 * Coordinate-only providers are hidden unless destination coordinates exist.
 */
export function getAvailableProviders(hasCoords = false): { id: MapProvider; name: string; icon: string }[] {
  return [
    { id: "google", name: "Google Maps", icon: "🗺️" },
    { id: "waze", name: "Waze", icon: "📍" },
    ...(hasCoords ? [{ id: "osm" as MapProvider, name: "OpenStreetMap", icon: "🌍" }] : []),
  ];
}
