#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_RUNS_DIR = path.join(__dirname, 'runs', 'agnt');
const DEFAULT_PROFILE = path.join(__dirname, 'profiles', 'agnt-default.json');

function fileExists(candidate) {
  try {
    return fs.existsSync(candidate);
  } catch {
    return false;
  }
}

function findPulseMeshHome() {
  const candidates = [
    process.env.PULSEMESH_HOME,
    path.resolve(__dirname, '..'),
    path.join(__dirname, 'vendor', 'pulsemesh'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fileExists(path.join(candidate, 'src', 'pulsemesh', 'cli.py'))) {
      return candidate;
    }
  }
  return null;
}

function resolvePath(value, base = __dirname) {
  if (!value) return value;
  return path.isAbsolute(value) ? value : path.resolve(base, value);
}

function latestSummaryFromLedger(runsDir) {
  const ledgerPath = path.join(runsDir, 'ledger.jsonl');
  if (!fileExists(ledgerPath)) {
    return null;
  }
  const lines = fs.readFileSync(ledgerPath, 'utf8').split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const entry = JSON.parse(lines[i]);
      const summaryPath = entry.summary_path || entry.summary;
      if (summaryPath && fileExists(summaryPath)) {
        return summaryPath;
      }
      if (entry.run_id) {
        const derivedPath = path.join(runsDir, entry.run_id, 'state', 'summary.json');
        if (fileExists(derivedPath)) return derivedPath;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function findLatestSummaries(runsDir, limit = 2) {
  const summaries = [];
  const ledgerPath = path.join(runsDir, 'ledger.jsonl');
  if (fileExists(ledgerPath)) {
    const lines = fs.readFileSync(ledgerPath, 'utf8').split(/\r?\n/).filter(Boolean).reverse();
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const summaryPath = entry.summary_path || entry.summary;
        if (summaryPath && fileExists(summaryPath) && !summaries.includes(summaryPath)) {
          summaries.push(summaryPath);
        }
        if (entry.run_id) {
          const derivedPath = path.join(runsDir, entry.run_id, 'state', 'summary.json');
          if (fileExists(derivedPath) && !summaries.includes(derivedPath)) {
            summaries.push(derivedPath);
          }
        }
      } catch {
        continue;
      }
      if (summaries.length >= limit) return summaries;
    }
  }

  if (!fileExists(runsDir)) return summaries;
  const discovered = [];
  for (const name of fs.readdirSync(runsDir)) {
    const candidate = path.join(runsDir, name, 'state', 'summary.json');
    if (fileExists(candidate)) {
      discovered.push({
        path: candidate,
        mtime: fs.statSync(candidate).mtimeMs,
      });
    }
  }
  return discovered.sort((a, b) => b.mtime - a.mtime).map((item) => item.path).slice(0, limit);
}

function parseJsonOutput(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error(`PulseMesh returned non-JSON output: ${trimmed.slice(0, 300)}`);
  }
}

function runPulseMesh(args, options = {}) {
  const home = findPulseMeshHome();
  if (!home) {
    return Promise.resolve({
      ok: false,
      error: 'PulseMesh core not found. Set PULSEMESH_HOME or build the AGNT package with bundled vendor files.',
    });
  }

  const python = process.env.PULSEMESH_PYTHON || process.env.PYTHON || (os.platform() === 'win32' ? 'python' : 'python3');
  const env = {
    ...process.env,
    PYTHONPATH: [path.join(home, 'src'), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
  };

  return new Promise((resolve) => {
    const child = spawn(python, ['-m', 'pulsemesh.cli', ...args], {
      cwd: options.cwd || home,
      env,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      resolve({ ok: false, error: error.message, command: ['pulsemesh', ...args].join(' ') });
    });
    child.on('close', (code) => {
      if (code !== 0) {
        resolve({
          ok: false,
          code,
          error: stderr.trim() || stdout.trim() || `PulseMesh exited with code ${code}`,
          command: ['pulsemesh', ...args].join(' '),
        });
        return;
      }
      try {
        const payload = parseJsonOutput(stdout);
        resolve({ ok: payload.ok ?? true, ...payload });
      } catch (error) {
        resolve({ ok: false, error: error.message, stdout, stderr });
      }
    });
  });
}

function readSummary(summaryPath) {
  if (!summaryPath || !fileExists(summaryPath)) {
    return { ok: false, error: 'summary not found', summary_path: summaryPath || null };
  }
  try {
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    return { ok: true, summary_path: summaryPath, summary };
  } catch (error) {
    return { ok: false, error: error.message, summary_path: summaryPath };
  }
}

function summarizeStatus(summaryPath) {
  const loaded = readSummary(summaryPath);
  if (!loaded.ok) return loaded;
  const summary = loaded.summary;
  const mesh = summary.mesh || {};
  const sensors = summary.sensors || [];
  const alerts = summary.alerts || [];
  const fallbackSensors = sensors.filter((sensor) => sensor.used_live_data === false);
  const highestAnomaly = sensors.reduce((best, sensor) => {
    const score = Number(sensor.metrics?.anomaly_score ?? sensor.anomaly_score ?? 0);
    if (!best || score > best.score) {
      return {
        id: sensor.profile_id || sensor.id,
        label: sensor.label,
        provider: sensor.provider,
        score,
      };
    }
    return best;
  }, null);
  const meshHighest = mesh.highest_anomaly ? {
    id: mesh.highest_anomaly.profile_id,
    label: mesh.highest_anomaly.label,
    provider: mesh.highest_anomaly.provider,
    score: Number(mesh.highest_anomaly.anomaly_score ?? 0),
  } : null;

  return {
    ok: true,
    summary_path: summaryPath,
    run_id: summary.run_id || path.basename(path.dirname(path.dirname(summaryPath))),
    mesh_health: mesh.mesh_health ?? mesh.health_score ?? summary.mesh_health ?? null,
    mesh_coherence: mesh.mesh_coherence ?? null,
    sensor_count: sensors.length,
    alert_count: alerts.length,
    critical_alert_count: alerts.filter((alert) => alert.severity === 'critical').length,
    fallback_count: fallbackSensors.length,
    fallback_sensors: fallbackSensors.map((sensor) => sensor.profile_id || sensor.id),
    highest_anomaly: meshHighest || highestAnomaly,
    dashboard_path: path.join(path.dirname(path.dirname(summaryPath)), 'dashboard.html'),
    report_path: path.join(path.dirname(path.dirname(summaryPath)), 'report.md'),
  };
}

class PulseMeshAgnt {
  constructor() {
    this.name = 'pulsemesh';
    this.version = '0.1.0';
    this.description = 'Local-first telemetry sensorium for AGNT';
  }

  async demo(params = {}) {
    const profiles = resolvePath(params.profiles || DEFAULT_PROFILE);
    const out = resolvePath(params.out || DEFAULT_RUNS_DIR);
    const args = [
      'demo',
      '--profiles', profiles,
      '--out', out,
      '--max-points', String(params.max_points || 256),
      '--timeout', String(params.timeout || 12),
    ];
    if (params.no_plots !== false) args.push('--no-plots');
    return runPulseMesh(args);
  }

  async run(params = {}) {
    if (!params.profiles) return { ok: false, error: 'profiles is required' };
    const args = [
      'run',
      '--profiles', resolvePath(params.profiles),
      '--out', resolvePath(params.out || DEFAULT_RUNS_DIR),
      '--max-points', String(params.max_points || 256),
      '--timeout', String(params.timeout || 12),
    ];
    if (params.run_id) args.push('--run-id', String(params.run_id));
    if (params.no_plots !== false) args.push('--no-plots');
    return runPulseMesh(args);
  }

  async status(params = {}) {
    const runsDir = resolvePath(params.runs_dir || DEFAULT_RUNS_DIR);
    const summaryPath = params.summary ? resolvePath(params.summary) : latestSummaryFromLedger(runsDir);
    if (!summaryPath) {
      return { ok: false, error: 'No PulseMesh summary found. Run pulsemesh-demo first.', runs_dir: runsDir };
    }
    return summarizeStatus(summaryPath);
  }

  async gate(params = {}) {
    const status = await this.status(params);
    if (!status.ok) {
      return { ok: false, decision: 'hold', reasons: [status.error], status };
    }

    const minHealth = Number(params.min_health ?? 0.55);
    const warnHealth = Number(params.warn_health ?? 0.72);
    const maxAnomaly = Number(params.max_anomaly ?? 0.85);
    const warnAnomaly = Number(params.warn_anomaly ?? 0.65);
    const holdOnCritical = params.hold_on_critical !== false;
    const warnOnFallback = params.warn_on_fallback !== false;
    const reasons = [];
    let decision = 'go';

    if (holdOnCritical && status.critical_alert_count > 0) {
      decision = 'hold';
      reasons.push(`${status.critical_alert_count} critical alert(s) present`);
    }
    if (typeof status.mesh_health === 'number' && status.mesh_health < minHealth) {
      decision = 'hold';
      reasons.push(`mesh health ${status.mesh_health.toFixed(3)} is below ${minHealth}`);
    }
    if (status.highest_anomaly?.score >= maxAnomaly) {
      decision = 'hold';
      reasons.push(`highest anomaly ${status.highest_anomaly.score.toFixed(3)} is at or above ${maxAnomaly}`);
    }

    if (decision !== 'hold') {
      if (typeof status.mesh_health === 'number' && status.mesh_health < warnHealth) {
        decision = 'warn';
        reasons.push(`mesh health ${status.mesh_health.toFixed(3)} is below ${warnHealth}`);
      }
      if (status.highest_anomaly?.score >= warnAnomaly) {
        decision = 'warn';
        reasons.push(`highest anomaly ${status.highest_anomaly.score.toFixed(3)} is at or above ${warnAnomaly}`);
      }
      if (warnOnFallback && status.fallback_count > 0) {
        decision = 'warn';
        reasons.push(`${status.fallback_count} sensor(s) used fallback data`);
      }
      if (status.alert_count > 0) {
        decision = 'warn';
        reasons.push(`${status.alert_count} alert(s) present`);
      }
    }

    if (reasons.length === 0) reasons.push('telemetry gate passed');
    return { ok: true, decision, reasons, status };
  }

  async dashboard(params = {}) {
    const runsDir = resolvePath(params.runs_dir || DEFAULT_RUNS_DIR);
    const summary = params.summary ? resolvePath(params.summary) : latestSummaryFromLedger(runsDir);
    if (!summary) return { ok: false, error: 'No summary found. Run pulsemesh-demo first.' };
    const out = resolvePath(params.out || path.join(path.dirname(path.dirname(summary)), 'dashboard.html'));
    return runPulseMesh([
      'dashboard',
      '--summary', summary,
      '--out', out,
      '--refresh-seconds', String(params.refresh_seconds || 60),
    ]);
  }

  async compare(params = {}) {
    const runsDir = resolvePath(params.runs_dir || DEFAULT_RUNS_DIR);
    const summaries = findLatestSummaries(runsDir, 2);
    const after = resolvePath(params.after || summaries[0]);
    const before = resolvePath(params.before || summaries[1]);
    if (!before || !after) {
      return { ok: false, error: 'Need two summaries to compare. Provide before/after or run PulseMesh twice.' };
    }
    const out = resolvePath(params.out || path.join(runsDir, 'latest-compare.json'));
    return runPulseMesh(['compare', '--before', before, '--after', after, '--out', out]);
  }

  async providers() {
    return runPulseMesh(['providers']);
  }

  async validate(params = {}) {
    const args = ['validate'];
    if (params.profiles) args.push('--profiles', resolvePath(params.profiles));
    if (params.summary) args.push('--summary', resolvePath(params.summary));
    if (args.length === 1) return { ok: false, error: 'profiles or summary is required' };
    return runPulseMesh(args);
  }

  async execute(params = {}) {
    const action = params.action || params.command || 'demo';
    if (typeof this[action] !== 'function') {
      return { ok: false, error: `Unknown PulseMesh action: ${action}` };
    }
    return this[action](params);
  }
}

async function cli() {
  const plugin = new PulseMeshAgnt();
  const [command = 'help', ...rest] = process.argv.slice(2);
  const params = {};
  for (let i = 0; i < rest.length; i += 1) {
    const item = rest[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2).replace(/-/g, '_');
    const next = rest[i + 1];
    if (!next || next.startsWith('--')) {
      params[key] = true;
    } else {
      params[key] = next;
      i += 1;
    }
  }

  const aliases = {
    demo: 'demo',
    run: 'run',
    status: 'status',
    gate: 'gate',
    dashboard: 'dashboard',
    compare: 'compare',
    providers: 'providers',
    validate: 'validate',
  };

  if (!aliases[command]) {
    console.log(`PulseMesh AGNT Plugin

Usage:
  node pulsemesh-agnt.js demo [--out runs/agnt]
  node pulsemesh-agnt.js status [--runs-dir runs/agnt]
  node pulsemesh-agnt.js gate [--runs-dir runs/agnt]
  node pulsemesh-agnt.js dashboard [--summary path]
  node pulsemesh-agnt.js compare [--before path --after path]
  node pulsemesh-agnt.js providers
  node pulsemesh-agnt.js validate --profiles path
`);
    return;
  }

  const result = await plugin[aliases[command]](params);
  console.log(JSON.stringify(result, null, 2));
  if (result.ok === false) process.exitCode = 1;
}

export default new PulseMeshAgnt();
export { PulseMeshAgnt };

const isDirectRun = process.argv[1] && process.argv[1].endsWith('pulsemesh-agnt.js');
if (isDirectRun) {
  cli().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
  });
}
