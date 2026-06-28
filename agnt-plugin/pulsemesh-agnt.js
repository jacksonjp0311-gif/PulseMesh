// PulseMesh AGNT Plugin Bridge
// Pure-JS native AGNT tools — no Python subprocess required
// Each tool default-exports an instance with: id, title, description, schema, execute()

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { TelemetryProfile } from './models.js';
import { acquire, PROVIDER_LIST } from './providers.js';
import { fuseSeries } from './fusion.js';
import { evaluateAlerts, gateDecision } from './alerts.js';
import { generateDashboard } from './dashboard.js';
import { generateMarkdownReport, compareSummaries, summarizeHistory, updateBaselines, annotateWithBaselines } from './reports.js';
import { executeRun, getLatestStatus, makeRunId } from './engine.js';
import { nowISO } from './util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PROFILE = path.join(__dirname, 'profiles', 'agnt-default.json');
const DEFAULT_OUT = path.join(__dirname, 'runs', 'agnt');

// Ensure default profile exists
function ensureDefaultProfile() {
  const dir = path.dirname(DEFAULT_PROFILE);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DEFAULT_PROFILE)) {
    fs.writeFileSync(DEFAULT_PROFILE, JSON.stringify({
      profiles: [
        { id: 'agnt_cpu_load', label: 'CPU Load', provider: 'system', variable: 'cpu_load', samples: 6,
          alerts: [{ metric: 'mean', op: '>=', threshold: 90, severity: 'warning', message: 'CPU load elevated' }] },
        { id: 'agnt_memory_used', label: 'Memory Used', provider: 'system', variable: 'memory_used_percent', samples: 6,
          alerts: [{ metric: 'mean', op: '>=', threshold: 92, severity: 'critical', message: 'Memory pressure high' }] },
        { id: 'agnt_disk_free', label: 'Disk Free', provider: 'system', variable: 'disk_free_percent', path: '.', samples: 6,
          alerts: [{ metric: 'mean', op: '<=', threshold: 8, severity: 'critical', message: 'Disk space low' }] },
        { id: 'agnt_loopback_latency', label: 'Loopback Latency', provider: 'ping', host: '127.0.0.1', port: 80, count: 4 },
        { id: 'agnt_cloudflare_latency', label: 'External Latency', provider: 'ping', host: '1.1.1.1', port: 443, count: 4 },
      ]
    }, null, 2));
  }
}

function resolveOut(out) {
  if (!out) return DEFAULT_OUT;
  return path.isAbsolute(out) ? out : path.resolve(process.cwd(), out);
}

// ======================== TOOL DEFINITIONS ========================

const tools = {};

// 1. pulsemesh-demo
tools['pulsemesh-demo'] = {
  id: 'pulsemesh-demo',
  title: 'PulseMesh Demo Workflow',
  description: 'Run the full PulseMesh telemetry mesh: acquire all sensors, fuse, evaluate alerts, render dashboard + report, update baselines.',
  schema: {
    properties: {
      profiles: { type: 'string', description: 'Path to profiles JSON' },
      out: { type: 'string', default: 'runs/pulsemesh' },
      max_points: { type: 'number', default: 256 },
      timeout: { type: 'number', default: 12 },
      min_health: { type: 'number', default: 0.55 },
      max_anomaly: { type: 'number', default: 0.85 },
    }
  },
  async execute(params) {
    ensureDefaultProfile();
    const profiles = params.profiles || DEFAULT_PROFILE;
    const out = resolveOut(params.out);
    const result = await executeRun({
      profiles, outDir: out,
      maxPoints: params.max_points || 256,
      timeout: params.timeout || 12,
      gateOpts: { min_health: params.min_health ?? 0.55, max_anomaly: params.max_anomaly ?? 0.85 },
    });
    return {
      status: 'ok',
      run_id: result.summary.run_id,
      timestamp: result.summary.timestamp,
      mesh: result.summary.mesh,
      gate: result.summary.gate,
      sensor_count: result.summary.sensors.length,
      alert_count: result.summary.alerts.length,
      dashboard_path: result.dashboardPath,
      report_path: result.reportPath,
      run_dir: result.runDir,
    };
  }
};

// 2. pulsemesh-acquire
tools['pulsemesh-acnt'] = tools['pulsemesh-acquire'] = {
  id: 'pulsemesh-acquire',
  title: 'PulseMesh Acquire Sensor',
  description: 'Acquire telemetry from a single sensor provider.',
  schema: {
    properties: {
      provider: { type: 'string' },
      id: { type: 'string' },
      label: { type: 'string' },
      variable: { type: 'string' },
      host: { type: 'string' },
      port: { type: 'number' },
      lat: { type: 'number' },
      lon: { type: 'number' },
      max_points: { type: 'number', default: 64 },
      timeout: { type: 'number', default: 12 },
    }
  },
  async execute(params) {
    const profile = new TelemetryProfile({
      id: params.id || `sensor-${Date.now()}`,
      provider: params.provider || 'system',
      label: params.label,
      variable: params.variable,
      lat: params.lat,
      lon: params.lon,
      params: {
        variable: params.variable,
        host: params.host,
        port: params.port,
        samples: params.max_points || 64,
        count: params.max_points || 64,
      }
    });
    const series = await acquire(profile, params.max_points || 64, params.timeout || 12);
    return {
      profile_id: series.profileId,
      provider: series.provider,
      label: series.label,
      sensor_name: series.sensorName,
      sample_count: series.values.length,
      unit: series.unit,
      used_live_data: series.usedLiveData,
      fallback_reason: series.fallbackReason,
      source_url: series.sourceUrl,
      values: series.values.slice(-20), // Last 20 for brevity
      mean: (series.values.reduce((a, b) => a + b, 0) / series.values.length).toFixed(4),
    };
  }
};

// 3. pulsemesh-fuse
tools['pulsemesh-fuse'] = {
  id: 'pulsemesh-fuse',
  title: 'PulseMesh Fusion Analysis',
  description: 'Run fusion analysis on data. Computes health_score, anomaly_score, coherence, volatility, drift, spike_count.',
  schema: {
    properties: {
      values: { type: 'string', description: 'JSON array of numbers' },
      label: { type: 'string', default: 'analysis' },
      stability_threshold: { type: 'number', default: 0.7 },
    }
  },
  async execute(params) {
    let vals;
    try {
      vals = JSON.parse(params.values || '[]');
    } catch {
      return { error: 'values must be a JSON array of numbers' };
    }
    if (!Array.isArray(vals) || vals.length < 4) return { error: 'need at least 4 values' };
    const series = new TelemetrySeries({
      profileId: 'fuse-analysis',
      provider: 'manual',
      label: params.label || 'analysis',
      sensorName: 'Manual data input',
      times: vals.map((_, i) => `t${i}`),
      values: vals.map(Number),
    });
    const fusion = fuseSeries(series, params.stability_threshold || 0.7);
    return {
      health_score: fusion.healthScore.toFixed(4),
      anomaly_score: fusion.anomalyScore.toFixed(4),
      coherence_avg: (fusion.coherence.reduce((a, b) => a + b, 0) / fusion.coherence.length).toFixed(4),
      volatility: fusion.volatility.toFixed(4),
      stability_fraction: fusion.stabilityFraction.toFixed(4),
      spike_count: fusion.spikeCount,
      drift: fusion.drift.toFixed(4),
      mean: fusion.mean.toFixed(4),
      median: fusion.median.toFixed(4),
      sample_count: vals.length,
    };
  }
};

// 4. pulsemesh-status
tools['pulsemesh-status'] = {
  id: 'pulsemesh-status',
  title: 'PulseMesh Status',
  description: 'Get latest mesh health, alerts, fallback count, highest anomaly.',
  schema: { properties: { out: { type: 'string', default: 'runs/pulsemesh' } } },
  async execute(params) {
    const out = resolveOut(params.out);
    const status = await getLatestStatus(out);
    return status;
  }
};

// 5. pulsemesh-gate
tools['pulsemesh-gate'] = {
  id: 'pulsemesh-gate',
  title: 'PulseMesh Gate Decision',
  description: 'Return go/warn/hold decision before agent proceeds.',
  schema: {
    properties: {
      out: { type: 'string', default: 'runs/pulsemesh' },
      min_health: { type: 'number', default: 0.55 },
      max_anomaly: { type: 'number', default: 0.85 },
      warn_health: { type: 'number', default: 0.72 },
      warn_anomaly: { type: 'number', default: 0.65 },
    }
  },
  async execute(params) {
    const out = resolveOut(params.out);
    const status = await getLatestStatus(out);
    if (status.status !== 'ok') {
      return { decision: 'hold', reasons: [`no valid run: ${status.status}`], mesh_health: 0 };
    }
    return gateDecision(
      { mesh: status.mesh },
      {
        min_health: params.min_health ?? 0.55,
        max_anomaly: params.max_anomaly ?? 0.85,
        warn_health: params.warn_health ?? 0.72,
        warn_anomaly: params.warn_anomaly ?? 0.65,
      }
    );
  }
};

// 6. pulsemesh-dashboard
tools['pulsemesh-dashboard'] = {
  id: 'pulsemesh-dashboard',
  title: 'PulseMesh Dashboard',
  description: 'Render self-contained HTML dashboard from latest run.',
  schema: {
    properties: {
      out: { type: 'string', default: 'runs/pulsemesh' },
      summary_path: { type: 'string' },
    }
  },
  async execute(params) {
    let summaryPath = params.summary_path;
    if (!summaryPath) {
      const out = resolveOut(params.out);
      // Find latest summary from ledger
      const ledgerPath = path.join(out, 'ledger.jsonl');
      if (!fs.existsSync(ledgerPath)) return { error: 'no runs found', out };
      const lines = fs.readFileSync(ledgerPath, 'utf-8').trim().split('\n').filter(Boolean);
      if (lines.length === 0) return { error: 'empty ledger' };
      const last = JSON.parse(lines[lines.length - 1]);
      summaryPath = last.summary_path;
    }
    if (!summaryPath || !fs.existsSync(summaryPath)) return { error: 'summary not found', summaryPath };
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    const html = generateDashboard(summary);
    const outPath = path.join(path.dirname(summaryPath), 'dashboard.html');
    fs.writeFileSync(outPath, html);
    return { status: 'ok', dashboard_path: outPath, html_length: html.length, sensor_count: summary.sensors?.length || 0 };
  }
};

// 7. pulsemesh-compare
tools['pulsemesh-compare'] = {
  id: 'pulsemesh-compare',
  title: 'PulseMesh Compare Runs',
  description: 'Compare two run summaries.',
  schema: {
    properties: {
      before: { type: 'string', description: 'Path to before summary.json' },
      after: { type: 'string', description: 'Path to after summary.json' },
    }
  },
  async execute(params) {
    if (!params.before || !params.after) return { error: 'both before and after paths required' };
    try {
      const result = compareSummaries(params.before, params.after);
      return result;
    } catch (err) {
      return { error: err.message };
    }
  }
};

// 8. pulsemesh-providers
tools['pulsemesh-providers'] = {
  id: 'pulsemesh-providers',
  title: 'PulseMesh Providers',
  description: 'List all available telemetry providers.',
  schema: { properties: {} },
  async execute() {
    return {
      providers: PROVIDER_LIST,
      count: PROVIDER_LIST.length,
      details: {
        system: { params: ['variable (cpu_load, memory_used_percent, disk_free_percent, uptime, process_count)', 'samples', 'path'], live: true },
        ping: { params: ['host', 'port', 'count'], live: true },
        goes_xray: { params: [], live: true, source: 'NOAA SWPC' },
        openmeteo: { params: ['lat', 'lon', 'variable (temperature_2m, pressure_msl, wind_speed_10m)'], live: true },
        openmeteo_air: { params: ['lat', 'lon', 'variable (us_aqi, pm2_5, pm10)'], live: true },
        usgs_earthquake: { params: ['lat', 'lon', 'radius_km', 'days', 'min_magnitude'], live: true },
        csv: { params: ['path', 'value_column', 'unit'], live: true },
        jsonl: { params: ['path', 'value_field', 'pattern', 'metric'], live: true },
        rss: { params: ['url'], live: true },
        github: { params: ['repo'], live: true },
        synthetic: { params: [], live: false, note: 'Deterministic fallback' },
      }
    };
  }
};

// 9. pulsemesh-sync
tools['pulsemesh-sync'] = {
  id: 'pulsemesh-sync',
  title: 'PulseMesh Sync to AGNT',
  description: 'Sync telemetry into AGNT observability. Updates baselines, summarizes history, returns gate decision.',
  schema: {
    properties: {
      out: { type: 'string', default: 'runs/pulsemesh' },
      history_limit: { type: 'number', default: 20 },
    }
  },
  async execute(params) {
    const out = resolveOut(params.out);
    const history = summarizeHistory(out, params.history_limit || 20);
    const status = await getLatestStatus(out);
    return {
      status: 'ok',
      latest_run: status,
      history,
      synced_at: nowISO(),
      out_dir: out,
    };
  }
};

// ======================== AGNT PLUGIN REGISTRATION ========================

// AGNT loads this file and looks for either:
// 1. A default export that is an array of tool instances
// 2. A default export that is a function receiving (register) => {...}
// 3. Named exports for each tool

export default tools;

// Also export individually for AGNT's plugin loader
export const pulsemeshDemo = tools['pulsemesh-demo'];
export const pulsemeshAcquire = tools['pulsemesh-acquire'];
export const pulsemeshFuse = tools['pulsemesh-fuse'];
export const pulsemeshStatus = tools['pulsemesh-status'];
export const pulsemeshGate = tools['pulsemesh-gate'];
export const pulsemeshDashboard = tools['pulsemesh-dashboard'];
export const pulsemeshCompare = tools['pulsemesh-compare'];
export const pulsemeshProviders = tools['pulsemesh-providers'];
export const pulsemeshSync = tools['pulsemesh-sync'];
