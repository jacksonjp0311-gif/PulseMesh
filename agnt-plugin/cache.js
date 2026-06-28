// PulseMesh JS — Cache Management
// Port of Python cache.js

import fs from 'fs';
import path from 'path';
import { TelemetrySeries } from './models.js';

function safeId(id) {
  return id.replace(/[^a-zA-Z0-9\-_]/g, '_');
}

export function cachePath(cacheDir, profileId) {
  return path.join(cacheDir, `${safeId(profileId)}.json`);
}

export function saveSeries(cacheDir, series) {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cachePath(cacheDir, series.profileId), JSON.stringify(series, null, 2));
}

export function loadSeries(cacheDir, profileId, reason) {
  const p = cachePath(cacheDir, profileId);
  if (!fs.existsSync(p)) return null;
  try {
    const obj = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return new TelemetrySeries({
      profileId: String(obj.profileId),
      provider: String(obj.provider),
      label: String(obj.label),
      sensorName: String(obj.sensorName || 'Cached telemetry'),
      times: obj.times.map(String),
      values: obj.values.map(Number),
      unit: String(obj.unit || ''),
      usedLiveData: false,
      fallbackReason: `cache fallback after ${reason}`,
      sourceUrl: obj.sourceUrl || null,
      metadata: { ...(obj.metadata || {}), cacheSource: p },
    });
  } catch {
    return null;
  }
}
