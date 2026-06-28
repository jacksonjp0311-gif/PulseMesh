// PulseMesh JS — Local System Telemetry
import os from 'os';
import fs from 'fs';
import { spawnSync } from 'child_process';
import { TelemetrySeries } from './models.js';
import { nowISO } from './util.js';

function currentTimes(n) {
  const base = Date.now();
  const step = 1000;
  return Array.from({ length: n }, (_, i) => new Date(base - (n - 1 - i) * step).toISOString().replace(/\.\d+Z$/, 'Z'));
}

function getCpuLoad() {
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('powershell', ['-Command',
        '(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average'
      ], { timeout: 3000 });
      if (r.status === 0 && r.stdout) {
        const v = parseFloat(r.stdout.toString().trim());
        if (Number.isFinite(v)) return v;
      }
      const cpus = os.cpus();
      let totalIdle = 0, totalTick = 0;
      for (const c of cpus) { totalIdle += c.times.idle; totalTick += Object.values(c.times).reduce((a, b) => a + b, 0); }
      return totalTick > 0 ? 100 * (1 - totalIdle / totalTick) : 0;
    }
    return (os.loadavg()[0] / os.cpus().length) * 100;
  } catch { return 0; }
}

function getMemoryUsedPercent() {
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('powershell', ['-Command',
        '((Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize - (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory) / (Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize * 100'
      ], { timeout: 3000 });
      if (r.status === 0) { const v = parseFloat(r.stdout.toString().trim()); if (Number.isFinite(v)) return v; }
    }
    const total = os.totalmem(); const free = os.freemem();
    return 100 * (1 - free / total);
  } catch { return 0; }
}

function getMemoryFreePercent() { return 100 - getMemoryUsedPercent(); }

function getDiskFreePercent(drive = '.') {
  try {
    if (process.platform === 'win32') {
      const letter = (drive === '.' ? process.cwd()[0] : drive[0]).toUpperCase();
      const r = spawnSync('powershell', ['-Command',
        `(Get-PSDrive ${letter} -ErrorAction SilentlyContinue).Free / ((Get-PSDrive ${letter} -ErrorAction SilentlyContinue).Free + (Get-PSDrive ${letter} -ErrorAction SilentlyContinue).Used) * 100`
      ], { timeout: 3000 });
      if (r.status === 0) {
        const v = parseFloat(r.stdout.toString().trim());
        if (Number.isFinite(v) && v >= 0 && v <= 100) return v;
      }
    }
    const r = spawnSync('df', ['-P', drive], { timeout: 3000 });
    if (r.status === 0) {
      const lines = r.stdout.toString().trim().split('\n');
      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/);
        const total = parseFloat(parts[1]); const used = parseFloat(parts[2]);
        if (total > 0) return 100 * (1 - used / total);
      }
    }
    return 50;
  } catch { return 0; }
}

function getProcessCount() {
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('powershell', ['-Command', '(Get-Process | Measure-Object).Count'], { timeout: 3000 });
      if (r.status === 0) { const v = parseInt(r.stdout.toString().trim()); if (Number.isFinite(v)) return v; }
    }
    const r = spawnSync('ps', ['-e', '--no-headers'], { timeout: 3000 });
    if (r.status === 0) return r.stdout.toString().trim().split('\n').filter(l => l.trim()).length;
    return 0;
  } catch { return 0; }
}

function getUptime() {
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('powershell', ['-Command',
        '(Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime | Select-Object -ExpandProperty TotalHours'
      ], { timeout: 3000 });
      if (r.status === 0) { const v = parseFloat(r.stdout.toString().trim()); if (Number.isFinite(v)) return v; }
    }
    return os.uptime() / 3600;
  } catch { return 0; }
}

// Ping: uses native OS ping command for reliable RTT measurements
function getPingMs(host, count) {
  const results = [];
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('ping', ['-n', String(count), '-w', '2000', host], { timeout: 15000, encoding: 'utf-8' });
      // Parse round-trip times: "time=<ms>ms" or "time<ms>ms"
      const output = r.stdout || '';
      const matches = output.matchAll(/time[=<](\d+(?:\.\d+)?)\s*ms/gi);
      for (const m of matches) { const v = parseFloat(m[1]); if (Number.isFinite(v) && v > 0) results.push(v); }
    } else {
      const r = spawnSync('ping', ['-c', String(count), '-W', '2', host], { timeout: 15000, encoding: 'utf-8' });
      const output = r.stdout || '';
      const matches = output.matchAll(/time=(\d+(?:\.\d+)?)\s*ms/gi);
      for (const m of matches) { const v = parseFloat(m[1]); if (Number.isFinite(v) && v > 0) results.push(v); }
    }
  } catch { /* return empty */ }
  return results;
}

export function fetchSystem(profile, maxPoints = 512, _timeout = 12) {
  const variable = profile.variable || profile.params?.variable || 'cpu_load';
  const samples = profile.samples || Math.min(maxPoints, 24);
  const variableMap = {
    'cpu_load': getCpuLoad,
    'memory_used_percent': getMemoryUsedPercent,
    'memory_free_percent': getMemoryFreePercent,
    'disk_free_percent': () => getDiskFreePercent(profile.params?.path || profile.path || '.'),
    'process_count': getProcessCount,
    'uptime': getUptime,
  };
  const fn = variableMap[variable] || getCpuLoad;
  const values = [];
  for (let i = 0; i < samples; i++) {
    const raw = fn();
    const val = Number.isFinite(raw) ? raw : null;
    if (val !== null) values.push(val);
  }
  const unitMap = {
    'cpu_load': '%', 'memory_used_percent': '%', 'memory_free_percent': '%',
    'disk_free_percent': '%', 'process_count': 'procs', 'uptime': 'hours',
  };
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || `System ${variable}`,
    sensorName: `Local system: ${variable}`,
    times: currentTimes(values.length), values,
    unit: unitMap[variable] || '', usedLiveData: true,
  });
}

export async function fetchPing(profile, maxPoints = 512, _timeout = 12) {
  const host = profile.host || profile.params?.host || '127.0.0.1';
  const count = profile.count || profile.params?.count || 6;
  const rawResults = getPingMs(host, count);
  const valid = rawResults.filter(r => r > 0 && Number.isFinite(r));

  // Normalize: 0ms → health 1.0, 200ms → health 0.0
  const values = valid.length > 0 ? valid.map(r => Math.min(300, r)) : [];

  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || `Ping ${host}`,
    sensorName: `TCP ping RTT to ${host}`,
    times: values.map((_, i) => `probe:${i + 1}`),
    values,
    unit: 'ms',
    usedLiveData: values.length > 0,
  });
}

export { getCpuLoad, getMemoryUsedPercent, getDiskFreePercent, getProcessCount, getUptime, getPingMs };
