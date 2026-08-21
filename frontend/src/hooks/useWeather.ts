import { useEffect, useState } from 'react';

export interface Weather {
  tempC: number;
  summary: string;
  city: string;
}

// Patiala — same fixed point the Mirror masthead uses. Swap for device
// geolocation when the app asks for location permission.
const LAT = 30.3398;
const LON = 76.3869;
const CITY = 'patiala';

/** Open-Meteo WMO weather codes, collapsed to words a stylist can use. */
function describe(code: number): string {
  if (code === 0) return 'clear';
  if (code <= 3) return 'cloudy';
  if (code <= 48) return 'foggy';
  if (code <= 67) return 'rainy';
  if (code <= 77) return 'snowy';
  if (code <= 82) return 'rainy';
  return 'stormy';
}

/**
 * Current conditions, or null while loading / if the lookup fails.
 *
 * Never throws and never blocks: the stylist simply omits weather from its
 * reasoning when this stays null.
 */
export function useWeather(): Weather | null {
  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current_weather=true`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json?.current_weather) return;
        setWeather({
          tempC: json.current_weather.temperature,
          summary: describe(json.current_weather.weathercode),
          city: CITY,
        });
      })
      .catch(() => {
        /* Weather is a nicety; a failed lookup is not worth surfacing. */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return weather;
}
