// PulseMesh JS — Deterministic Synthetic Fallback
// Port of Python synthetic.js — seeded PRNG for reproducible fallback data

import { TelemetrySeries } from './models.js';
import { mulberry32, gaussian } from './util.js';

export function syntheticSeries(profile, reason, maxPoints = 512) {
  const seed = hashString(`${profile.id}|${profile.provider}|${profile.variable || ''}`) >>> 0;
  const rng = mulberry32(seed);
  const n = Math.max(24, parseInt(maxPoints) || 256);
  const provider = profile.provider.toLowerCase();
  const variable = (profile.variable || profile.params.variable || provider).toLowerCase();

  let base, amp, pulse, unit;
  if (provider.includes('quake') || variable.includes('quake')) {
    base = 2.0; amp = 0.8; pulse = 2.2; unit = 'magnitude';
  } else if (provider.includes('air') || variable.includes('aqi') || variable.includes('pm2') || variable.includes('pm10')) {
    base = 35.0; amp = 10.0; pulse = 18.0; unit = 'index';
  } else if (provider.includes('goes') || provider.includes('solar') || variable.includes('xray')) {
    base = -6.2; amp = 0.4; pulse = 1.1; unit = 'log10 W/m^2';
  } else if (variable.includes('wind')) {
    base = 8.0; amp = 2.5; pulse = 4.0; unit = 'km/h';
  } else if (variable.includes('precip')) {
    base = 0.1; amp = 0.25; pulse = 1.0; unit = 'mm';
  } else if (variable.includes('pressure')) {
    base = 1012.0; amp = 4.0; pulse = 8.0; unit = 'hPa';
  } else {
    base = 20.0; amp = 5.0; pulse = 3.0; unit = 'synthetic';
  }

  const values = [];
  const times = [];
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    const wave = amp * Math.sin(2 * Math.PI * t);
    const transient = pulse * Math.exp(-0.5 * ((t - 0.62) / 0.06) ** 2);
    const noise = gaussian(rng) * Math.max(Math.abs(amp) * 0.08, 0.05);
    values.push(base + wave + transient + noise);
    times.push(`synthetic:${String(i).padStart(4, '0')}`);
  }

  return new TelemetrySeries({
    profileId: profile.id,
    provider: profile.provider,
    label: profile.label || `${profile.id} (synthetic)`,
    sensorName: `Synthetic fallback for ${profile.id}: ${reason}`,
    times,
    values,
    unit,
    usedLiveData: false,
    fallbackReason: reason,
  });
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}
