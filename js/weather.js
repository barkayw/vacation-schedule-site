import { esc } from './render.js';

// Live daily forecasts via Open-Meteo (no API key). Days inside the
// ~16-day forecast window get a real forecast; later days get a climate
// model outlook so every itinerary day still has expected conditions.

const WMO = [
  { max: 0, emoji: '☀️', label: 'Clear' },
  { max: 1, emoji: '🌤️', label: 'Mostly clear' },
  { max: 2, emoji: '⛅', label: 'Partly cloudy' },
  { max: 3, emoji: '☁️', label: 'Overcast' },
  { max: 48, emoji: '🌫️', label: 'Fog' },
  { max: 57, emoji: '🌦️', label: 'Drizzle' },
  { max: 67, emoji: '🌧️', label: 'Rain' },
  { max: 77, emoji: '🌨️', label: 'Snow' },
  { max: 82, emoji: '🌧️', label: 'Showers' },
  { max: 86, emoji: '🌨️', label: 'Snow showers' },
  { max: 99, emoji: '⛈️', label: 'Thunderstorm' }
];

export function wmoInfo(code) {
  if (code == null || Number.isNaN(Number(code))) return { emoji: '🌡️', label: 'Weather' };
  const n = Number(code);
  return WMO.find((row) => n <= row.max) || { emoji: '🌡️', label: 'Weather' };
}

export function temperatureUnit(trip) {
  return trip.meta?.currency === 'USD' ? 'fahrenheit' : 'celsius';
}

function unitSymbol(unit) {
  return unit === 'fahrenheit' ? '°F' : '°C';
}

function roundTemp(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Math.round(Number(value));
}

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function coordKey(coords) {
  return `${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}`;
}

function destinationsById(trip) {
  return Object.fromEntries((trip.destinations || []).map((d) => [d.id, d]));
}

function uniqueLocations(trip) {
  const seen = new Map();
  for (const dest of trip.destinations || []) {
    if (!dest.coordinates) continue;
    const key = coordKey(dest.coordinates);
    if (!seen.has(key)) seen.set(key, dest.coordinates);
  }
  return [...seen.entries()].map(([key, coordinates]) => ({ key, coordinates }));
}

function parseDaily(json, source) {
  const daily = json?.daily;
  if (!daily?.time) return {};
  const byDate = {};
  daily.time.forEach((date, i) => {
    const high = roundTemp(daily.temperature_2m_max?.[i]);
    const low = roundTemp(daily.temperature_2m_min?.[i]);
    if (high == null && low == null) return;
    const code = daily.weather_code?.[i];
    const pop = daily.precipitation_probability_max?.[i];
    const precip = daily.precipitation_sum?.[i];
    byDate[date] = {
      date,
      source,
      high,
      low,
      weatherCode: code == null ? null : Number(code),
      precipChance: pop == null ? null : Number(pop),
      precipSum: precip == null ? null : Number(precip)
    };
  });
  return byDate;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather request failed (${res.status})`);
  return res.json();
}

function forecastUrl(lat, lng, unit) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',
    timezone: 'auto',
    forecast_days: '16',
    temperature_unit: unit
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

function climateUrl(lat, lng, start, end, unit) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    start_date: start,
    end_date: end,
    models: 'EC_Earth3P_HR',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
    temperature_unit: unit
  });
  return `https://climate-api.open-meteo.com/v1/climate?${params}`;
}

async function loadLocation(coords, unit, tripStart, tripEnd) {
  const byDate = {};
  try {
    const forecast = parseDaily(await fetchJson(forecastUrl(coords.lat, coords.lng, unit)), 'forecast');
    Object.assign(byDate, forecast);
  } catch {
    // Forecast can fail if the trip is entirely beyond the 16-day window.
  }

  const missing = [];
  for (let d = tripStart; d <= tripEnd; d = addDays(d, 1)) {
    if (!byDate[d]) missing.push(d);
  }
  if (missing.length) {
    try {
      const climate = parseDaily(
        await fetchJson(climateUrl(coords.lat, coords.lng, missing[0], missing[missing.length - 1], unit)),
        'outlook'
      );
      for (const date of missing) {
        if (climate[date]) byDate[date] = climate[date];
      }
    } catch {
      // Leave those days empty; the UI hides the chip.
    }
  }
  return byDate;
}

export async function loadDayForecasts(trip) {
  const unit = temperatureUnit(trip);
  const locations = uniqueLocations(trip);
  if (!locations.length) return { unit, symbol: unitSymbol(unit), byDestDate: {}, days: [] };

  const dests = destinationsById(trip);
  const start = trip.meta.startDate;
  const end = trip.meta.endDate;
  const loaded = await Promise.all(
    locations.map(async (loc) => ({ key: loc.key, byDate: await loadLocation(loc.coordinates, unit, start, end) }))
  );
  const byKey = Object.fromEntries(loaded.map((l) => [l.key, l.byDate]));

  const byDestDate = {};
  for (const dest of trip.destinations || []) {
    if (!dest.coordinates) continue;
    byDestDate[dest.id] = byKey[coordKey(dest.coordinates)] || {};
  }

  const days = (trip.days || []).map((day) => {
    const dest = dests[day.destinationId];
    const wx = dest?.id ? byDestDate[dest.id]?.[day.date] : null;
    return { date: day.date, destinationId: day.destinationId, place: dest?.name || '', weather: wx || null };
  });

  return { unit, symbol: unitSymbol(unit), byDestDate, days };
}

function tempsLabel(wx, symbol) {
  if (wx.high == null && wx.low == null) return '';
  if (wx.low == null) return `${wx.high}${symbol}`;
  if (wx.high == null) return `${wx.low}${symbol}`;
  return `${wx.high}° / ${wx.low}°`;
}

function outlookInfo(wx) {
  if (wx.weatherCode != null) return wmoInfo(wx.weatherCode);
  if (wx.precipSum != null && wx.precipSum >= 8) return { emoji: '🌧️', label: 'Rain likely' };
  if (wx.precipSum != null && wx.precipSum >= 2) return { emoji: '🌦️', label: 'Showers possible' };
  return { emoji: '🌤️', label: 'Typical conditions' };
}

function extraLabel(wx) {
  if (wx.source === 'forecast' && wx.precipChance != null) return `${wx.precipChance}% rain`;
  if (wx.source === 'outlook') return outlookInfo(wx).label;
  return wmoInfo(wx.weatherCode).label;
}

export function renderDayWeatherChip(wx, symbol) {
  if (!wx) return '';
  const { emoji, label } = outlookInfo(wx);
  const kind = wx.source === 'outlook' ? 'Seasonal outlook' : 'Forecast';
  const title = `${kind}: ${label} · ${tempsLabel(wx, symbol)}`.trim();
  const extra = extraLabel(wx);
  return `<span class="day-weather-icon" title="${esc(title)}">${emoji}</span>
    <span class="day-weather-temps">${esc(tempsLabel(wx, symbol))}</span>
    ${extra ? `<span class="day-weather-extra">${esc(extra)}</span>` : ''}`;
}

export function renderForecastStrip(result) {
  const cells = result.days
    .filter((d) => d.weather)
    .map((d) => {
      const wx = d.weather;
      const { emoji, label } = outlookInfo(wx);
      const [y, m, day] = d.date.split('-').map(Number);
      const date = new Date(y, m - 1, day);
      const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = date.getDate();
      const kind = wx.source === 'outlook' ? 'outlook' : 'forecast';
      return `<div class="forecast-day forecast-${kind}" title="${esc(label)} in ${esc(d.place)}">
        <div class="forecast-dow">${esc(weekday)} ${dayNum}</div>
        <div class="forecast-icon">${emoji}</div>
        <div class="forecast-temps">${wx.high != null ? wx.high + '°' : '—'}${wx.low != null ? ` <span>${wx.low}°</span>` : ''}</div>
        <div class="forecast-place">${esc(d.place)}</div>
      </div>`;
    })
    .join('');
  if (!cells) return '';
  return `<div class="forecast-strip-scroll">${cells}</div>
    <p class="forecast-credit">Daily forecast from Open-Meteo · later days show a seasonal outlook until a 16-day forecast is available</p>`;
}

