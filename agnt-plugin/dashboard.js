// PulseMesh JS — MISSION CONTROL DASHBOARD v2.0
// Full AGNT system telemetry console with charts, summaries, and agent impact analysis

import fs from 'fs';
import path from 'path';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sparkline(values, w, h, color) {
  if (!values || values.length < 2) return `<svg width="${w}" height="${h}"></svg>`;
  const mn = Math.min(...values), mx = Math.max(...values), rng = mx - mn || 1;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i*step).toFixed(1)},${(h-((v-mn)/rng)*(h-4)-2).toFixed(1)}`);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// SVG donut chart (multi-segment)
function donutChart(segments, size = 120, thickness = 18) {
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const total = segments.reduce((s, seg) => s + Math.max(0, seg.value), 0) || 1;
  let offset = 0;
  const arcs = segments.map(seg => {
    const pct = Math.max(0, seg.value) / total;
    const angle = pct * 360;
    const startAngle = offset;
    const endAngle = offset + angle;
    offset = angle < 360 ? endAngle : endAngle - 0.01;
    const rad = (a) => (a - 90) * Math.PI / 180;
    const x1 = cx + r * Math.cos(rad(startAngle));
    const y1 = cy + r * Math.sin(rad(startAngle));
    const x2 = cx + r * Math.cos(rad(endAngle));
    const y2 = cy + r * Math.sin(rad(endAngle));
    const largeArc = angle > 180 ? 1 : 0;
    return `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}" fill="none" stroke="${seg.color}" stroke-width="${thickness}" stroke-linecap="round"/>`;
  }).join('');
  return `<svg width="${size}" height="${size}" style="vertical-align:middle">${arcs}<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="#e6edf3" font-size="${size*0.18}" font-weight="700">${Math.round(total)}</text></svg>`;
}

// SVG bar chart (horizontal)
function barChart(bars, w = 280, h = 160) {
  const maxVal = Math.max(...bars.map(b => Math.abs(b.value))) || 1;
  const barH = Math.min(20, (h - 20) / bars.length - 4);
  const labelW = 80;
  const chartW = w - labelW - 40;
  let svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
  bars.forEach((bar, i) => {
    const y = i * (barH + 8) + 10;
    const barW = Math.max(2, (Math.abs(bar.value) / maxVal) * chartW);
    svg += `<text x="${labelW-4}" y="${y + barH/2 + 4}" text-anchor="end" fill="#8b949e" font-size="10">${esc(bar.label.substring(0,14))}</text>`;
    svg += `<rect x="${labelW}" y="${y}" width="${barW}" height="${barH}" rx="3" fill="${bar.color}" opacity="0.85"/>`;
    svg += `<text x="${labelW + barW + 4}" y="${y + barH/2 + 4}" fill="#e6edf3" font-size="10">${bar.display || bar.value.toFixed(1)}</text>`;
  });
  svg += '</svg>';
  return svg;
}

// SVG gauge (semicircle)
function gauge(value, max, label, color, w = 140, h = 90) {
  const pct = Math.min(1, Math.max(0, value / max));
  const angle = pct * 180;
  const rad = (a) => (a - 180) * Math.PI / 180;
  const cx = w / 2, cy = h - 10, r = w / 2 - 10;
  const x1 = cx + r * Math.cos(rad(0));
  const y1 = cy + r * Math.sin(rad(0));
  const x2 = cx + r * Math.cos(rad(angle));
  const y2 = cy + r * Math.sin(rad(angle));
  const bg = `M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`;
  const arcPath = angle > 0 ? `M ${x1} ${y1} A ${r} ${r} 0 ${angle > 180 ? 1 : 0} 1 ${x2} ${y2}` : '';
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <path d="${bg}" fill="none" stroke="#30363d" stroke-width="10" stroke-linecap="round"/>
    ${arcPath ? `<path d="${arcPath}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"/>` : ''}
    <text x="${cx}" y="${cy-2}" text-anchor="middle" fill="#e6edf3" font-size="20" font-weight="700">${typeof value === 'number' ? value.toFixed(1) : value}</text>
    <text x="${cx}" y="${h-2}" text-anchor="middle" fill="#8b949e" font-size="9">${esc(label)}</text>
  </svg>`;
}

function healthColor(v) {
  if (v >= 0.8) return '#19ef83';
  if (v >= 0.6) return '#12e0ff';
  if (v >= 0.4) return '#ffd700';
  if (v >= 0.2) return '#ff9500';
  return '#e53d8f';
}

function anomalyColor(v) {
  if (v <= 0.2) return '#19ef83';
  if (v <= 0.4) return '#12e0ff';
  if (v <= 0.6) return '#ffd700';
  if (v <= 0.8) return '#ff9500';
  return '#e53d8f';
}

// Generate the AGNT agent impact analysis
function generateAgentImpact(sensors, meshHealth, alerts) {
  const impacts = [];
  const getMetric = (pid, m) => {
    const s = sensors.find(x => x.profile_id === pid);
    return s?.metrics?.[m] ?? null;
  };

  // System resource impact
  const cpu = getMetric('agnt_cpu_load', 'mean');
  const mem = getMetric('agnt_memory_used', 'mean');
  const disk = getMetric('agnt_disk_free', 'mean');

  if (mem !== null && mem > 90) impacts.push({ severity: 'critical', title: 'Memory Critical', desc: `Memory at ${mem.toFixed(1)}%. Agents may experience OOM kills, workflow crashes, or slow responses. Recommend: pause non-essential workflows.`, icon: '🧠' });
  else if (mem !== null && mem > 80) impacts.push({ severity: 'warning', title: 'Memory Elevated', desc: `Memory at ${mem.toFixed(1)}%. Large-scale operations (NeuralForge training, batch processing) may be impacted.`, icon: '🧠' });
  else if (mem !== null) impacts.push({ severity: 'ok', title: 'Memory OK', desc: `Memory at ${mem.toFixed(1)}%. Resources sufficient for all operations.`, icon: '🧠' });

  if (cpu !== null && cpu > 85) impacts.push({ severity: 'critical', title: 'CPU Saturated', desc: `CPU load ${cpu.toFixed(1)}%. Agent response times will degrade. Parallel workflows may queue.`, icon: '⚡' });
  else if (cpu !== null && cpu > 60) impacts.push({ severity: 'warning', title: 'CPU Elevated', desc: `CPU load ${cpu.toFixed(1)}%. Training and heavy compute workflows will be slower.`, icon: '⚡' });

  if (disk !== null && disk < 8) impacts.push({ severity: 'critical', title: 'Disk Space Critical', desc: `Only ${disk.toFixed(1)}% disk free. Cold storage sync, artifact generation, and checkpoint writes may fail.`, icon: '💾' });
  else if (disk !== null && disk < 15) impacts.push({ severity: 'warning', title: 'Disk Space Low', desc: `${disk.toFixed(1)}% disk free. Run cleanup before large batch operations.`, icon: '💾' });

  // Network impact
  const latency = getMetric('agnt_cloudflare_latency', 'mean');
  if (latency !== null && latency > 100) impacts.push({ severity: 'warning', title: 'High Latency', desc: `TCP latency ${latency.toFixed(0)}ms. External API calls (GitHub, NOAA, CoinGecko) will be slower.`, icon: '🌐' });

  // Space weather impact
  const kpSensor = sensors.find(s => s.profile_id === 'noaa_kp');
  if (kpSensor) {
    const latestKp = kpSensor.values?.[kpSensor.values.length - 1];
    if (latestKp >= 7) impacts.push({ severity: 'critical', title: 'Geomagnetic Storm (G3+)', desc: `Kp index at ${latestKp}. GPS accuracy degraded, possible satellite disruptions, radio blackouts. Verify all location-dependent workflows.`, icon: '🌌' });
    else if (latestKp >= 5) impacts.push({ severity: 'warning', title: 'Geomagnetic Activity', desc: `Kp index at ${latestKp}. Aurora visible at low latitudes. Minor radio interference possible.`, icon: '🌌' });
  }

  const xraySensor = sensors.find(s => s.profile_id?.includes('goes'));
  if (xraySensor) {
    const latestXray = xraySensor.values?.[xraySensor.values.length - 1];
    if (latestXray > -4) impacts.push({ severity: 'warning', title: 'Solar Flare Activity', desc: `X-ray flux at 10^${latestXray.toFixed(1)} W/m². HF radio blackout possible on sunlit side. Satellite charging risk.`, icon: '☀️' });
  }

  // Air quality impact
  const aqiSensor = sensors.find(s => s.profile_id?.includes('aqi') || s.profile_id?.includes('air_quality'));
  if (aqiSensor) {
    const latestAqi = aqiSensor.values?.[aqiSensor.values.length - 1];
    if (latestAqi > 150) impacts.push({ severity: 'warning', title: 'Poor Air Quality', desc: `AQI ${latestAqi.toFixed(0)}. Sensitive individuals should limit outdoor exposure. Indoor air filtration recommended.`, icon: '🌬️' });
  }

  // NEO impact
  const neoSensor = sensors.find(s => s.profile_id?.includes('neo') || s.profile_id?.includes('asteroid'));
  if (neoSensor?.metadata?.hazardous_count > 0) {
    impacts.push({ severity: 'info', title: 'Potentially Hazardous Asteroids', desc: `${neoSensor.metadata.hazardous_count} PHA(s) detected today. Current approach distances are safe (>4 LD). No action needed.`, icon: '☄️' });
  }

  // Overall gate
  const criticalCount = impacts.filter(i => i.severity === 'critical').length;
  const warningCount = impacts.filter(i => i.severity === 'warning').length;
  let gate = 'go';
  if (criticalCount > 0) gate = 'hold';
  else if (warningCount > 0) gate = 'warn';

  return { impacts, gate, criticalCount, warningCount };
}

export function generateDashboard(summary) {
  const mesh = summary.mesh || {};
  const sensors = summary.sensors || [];
  const alerts = summary.alerts || [];
  const ts = summary.timestamp || new Date().toISOString();

  const meshHealth = mesh.mesh_health ?? 0;
  const gate = summary.gate?.decision || 'unknown';
  const agentImpact = generateAgentImpact(sensors, meshHealth, alerts);

  // ============ SENSOR ROWS ============
  const sensorRows = sensors.map(s => {
    const m = s.metrics || {};
    const h = m.health_score ?? 0;
    const status = h >= 0.75 ? 'good' : h >= 0.45 ? 'warn' : 'bad';
    const source = s.used_live_data ? 'live' : 'fallback';
    const aCount = s.alerts?.length || 0;
    return `<tr class="s-row">
      <td class="s-label">${esc(s.label || s.profile_id)}</td>
      <td><span class="pv">${esc(s.provider)}</span></td>
      <td><span class="badge ${source}">${source}</span></td>
      <td style="color:${healthColor(h)}">${h.toFixed(3)}</td>
      <td style="color:${anomalyColor(m.anomaly_score||0)}">${(m.anomaly_score ?? 0).toFixed(3)}</td>
      <td>${(m.coherence_avg ?? 0).toFixed(3)}</td>
      <td>${m.spike_count ?? 0}</td>
      <td>${(m.mean ?? 0).toFixed(2)}</td>
      <td class="spark">${sparkline(s._normalized || [], 90, 22, healthColor(h))}</td>
      <td>${aCount > 0 ? `<span class="al">${aCount}</span>` : '—'}</td>
    </tr>`;
  }).join('\n');

  // ============ ALERT ITEMS ============
  const alertItems = alerts.slice(0, 30).map(a =>
    `<li class="al-${esc(a.severity)}"><b>${esc(a.severity)}</b> ${esc(a.profile_id)}: ${esc(a.message || `${a.metric} ${a.op} ${a.threshold} = ${a.value?.toFixed?.(3) ?? a.value}`)}</li>`
  ).join('\n');

  // ============ CHARTS ============

  // Health distribution (donut)
  const healthy = sensors.filter(s => (s.metrics?.health_score ?? 0) >= 0.75).length;
  const warnCount = sensors.filter(s => { const h = s.metrics?.health_score ?? 0; return h >= 0.45 && h < 0.75; }).length;
  const critCount = sensors.filter(s => (s.metrics?.health_score ?? 0) < 0.45).length;
  const donutDonut = donutChart([
    { value: healthy, color: '#19ef83' },
    { value: warnCount, color: '#ffd700' },
    { value: critCount, color: '#e53d8f' },
  ], 120, 18);

  // Anomaly bar chart (top 8 most anomalous)
  const anomalyBars = sensors
    .filter(s => s.metrics?.anomaly_score != null)
    .sort((a, b) => (b.metrics.anomaly_score || 0) - (a.metrics.anomaly_score || 0))
    .slice(0, 8)
    .map(s => ({
      label: (s.label || s.profile_id).substring(0, 16),
      value: s.metrics.anomaly_score || 0,
      display: (s.metrics.anomaly_score || 0).toFixed(3),
      color: anomalyColor(s.metrics.anomaly_score || 0),
    }));
  const anomalyChart = barChart(anomalyBars, 380, 200);

  // Coherence bar chart
  const coherenceBars = sensors
    .filter(s => s.metrics?.coherence_avg != null)
    .sort((a, b) => (b.metrics.coherence_avg || 0) - (a.metrics.coherence_avg || 0))
    .slice(0, 8)
    .map(s => ({
      label: (s.label || s.profile_id).substring(0, 16),
      value: s.metrics.coherence_avg || 0,
      display: (s.metrics.coherence_avg || 0).toFixed(3),
      color: healthColor(s.metrics.coherence_avg || 0),
    }));
  const coherenceChart = barChart(coherenceBars, 380, 200);

  // Health gauges for system sensors
  const systemSensors = sensors.filter(s =>
    ['agnt_cpu_load', 'agnt_memory_used', 'agnt_disk_free'].includes(s.profile_id)
  );
  const gaugeCharts = systemSensors.map(s => {
    const maxVal = s.profile_id === 'agnt_disk_free' ? 100 : 100;
    const val = s.metrics?.mean ?? 0;
    const color = healthColor(s.metrics?.health_score ?? 0.5);
    return `<div class="gauge-wrap">${gauge(val, maxVal, s.label || s.profile_id, color)}</div>`;
  }).join('');

  // Space weather sparklines
  const spaceSensors = sensors.filter(s =>
    ['goes_xray', 'noaa_kp', 'noaa_sunspots', 'solar_wind'].some(p => s.profile_id?.includes(p.replace('noaa_', '')))
  );
  const spaceCharts = spaceSensors.map(s => `
    <div class="mini-card">
      <div class="mc-title">${esc(s.label || s.profile_id)}</div>
      <div class="mc-spark">${sparkline(s._normalized || s.values?.slice(-48) || [], 240, 40, healthColor(s.metrics?.health_score || 0.5))}</div>
      <div class="mc-val">health: ${(s.metrics?.health_score ?? 0).toFixed(3)}</div>
    </div>
  `).join('\n');

  // ============ AGENT IMPACT ============
  const impactCards = agentImpact.impacts.map(imp => `
    <div class="impact-${imp.severity}">
      <span class="ic-icon">${imp.icon}</span>
      <div class="ic-body">
        <div class="ic-title">${esc(imp.title)}</div>
        <div class="ic-desc">${esc(imp.desc)}</div>
      </div>
    </div>
  `).join('\n');

  // Interpret the data
  const dataInterpretation = generateDataInterpretation(sensors, meshHealth);

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PulseMesh Mission Control — ${esc(ts)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0d1117;--card:#161b22;--card2:#1c2128;--border:#30363d;
  --text:#e6edf3;--dim:#8b949e;--pink:#e53d8f;--cyan:#12e0ff;--green:#19ef83;--gold:#ffd700;--orange:#ff9500;--blue:#7d3de5;
}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text);line-height:1.5;overflow-x:hidden}
/* Layout */
.grid{display:grid;gap:16px;padding:16px}
.g-12{grid-template-columns:repeat(12,1fr)}
.row{display:flex;gap:16px;flex-wrap:wrap}
.col{flex:1;min-width:280px}
/* Header */
.header{padding:20px 24px;background:linear-gradient(135deg,#161b22 0%,#0d1117 100%);border-bottom:1px solid var(--border)}
.header h1{font-size:24px;font-weight:800;letter-spacing:-0.03em;color:var(--text)}
.header h1 span{color:var(--cyan)}
.header .sub{font-size:13px;color:var(--dim);margin-top:2px}
.header .gate-badge{display:inline-block;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:700;letter-spacing:0.05em;float:right}
.gate-go{background:rgba(25,239,131,0.15);color:var(--green)}
.gate-warn{background:rgba(255,215,0,0.15);color:var(--gold)}
.gate-hold{background:rgba(229,61,143,0.15);color:var(--pink)}
/* Cards */
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px}
.card-title{font-size:13px;font-weight:600;color:var(--dim);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px}
/* Mesh Hero */
.hero{padding:24px 28px;background:linear-gradient(135deg,#0f1923 0%,#161b22 100%);border:2px solid var(--border);border-radius:16px;margin:16px}
.hero-grid{display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:20px}
.hero-stat{text-align:center}.hero-stat .val{font-size:26px;font-weight:700}.hero-stat .lbl{font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:0.06em;margin-top:2px}
/* Charts */
.chart-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;margin:16px}
/* Sensor table */
.tbl-wrap{overflow-x:auto;margin:16px}
table{width:100%;border-collapse:collapse;background:var(--card);border-radius:12px;overflow:hidden;font-size:12px}
th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #21262d;vertical-align:middle}
th{background:var(--card2);color:var(--dim);font-size:10px;text-transform:uppercase;letter-spacing:0.05em;text-align:left}
tr.s-row:hover td{background:#1c2128}
.s-label{font-weight:600;font-size:12px}
.pv{background:rgba(125,61,229,0.12);color:#a78bfa;padding:1px 7px;border-radius:8px;font-size:10px;font-weight:600}
.badge{padding:1px 7px;border-radius:8px;font-size:10px;font-weight:700}
.badge.live{background:rgba(25,239,131,0.15);color:var(--green)}
.badge.fallback{background:rgba(255,215,0,0.15);color:var(--gold)}
.al{background:var(--pink);color:#fff;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700}
.spark svg{display:block;vertical-align:middle}
/* Gauge */
.gauge-wrap{display:inline-block;text-align:center}
.mini-card{background:var(--card2);border-radius:10px;padding:12px;margin:4px}
.mc-title{font-size:11px;color:var(--dim);margin-bottom:4px}
.mc-val{font-size:11px;color:var(--text);margin-top:4x}
/* Impact cards */
.impact-ok,.impact-warning,.impact-critical,.impact-info{padding:12px 16px;border-radius:10px;margin:6px 0;display:flex;gap:12px;align-items:flex-start}
.impact-ok{background:rgba(25,239,131,0.06);border:1px solid rgba(25,239,131,0.2)}
.impact-warning{background:rgba(255,215,0,0.06);border:1px solid rgba(255,215,0,0.2)}
.impact-critical{background:rgba(229,61,143,0.06);border:1px solid rgba(229,61,143,0.2)}
.impact-info{background:rgba(125,61,229,0.06);border:1px solid rgba(125,61,229,0.2)}
.ic-icon{font-size:22px;flex-shrink:0}
.ic-title{font-size:13px;font-weight:700;margin-bottom:3px}
.ic-desc{font-size:12px;color:var(--dim);line-height:1.5}
/* Alerts */
.alerts-list{list-style:none;margin:12px 0}
.alerts-list li{padding:7px 12px;border-radius:6px;margin-bottom:3px;font-size:12px;background:var(--card2);border-left:3px solid var(--border)}
.alerts-list .al-critical{border-left-color:var(--pink);background:rgba(229,61,143,0.05)}
.alerts-list .al-warning{border-left-color:var(--gold);background:rgba(255,215,0,0.05)}
/* Section */
.section-title{font-size:15px;font-weight:700;padding:0 16px;margin-top:8px;margin-bottom:8px;color:var(--text)}
.section-title::before{content:'';display:inline-block;width:3px;height:16px;background:var(--cyan);border-radius:2px;margin-right:8px;vertical-align:middle}
/* Responsive */
@media(max-width:800px){.hero-grid{grid-template-columns:repeat(2,1fr)}.chart-grid{grid-template-columns:1fr}}
/* Interp */
.interp{background:linear-gradient(135deg,rgba(18,224,255,0.06) 0%,rgba(125,61,229,0.06) 100%);border:1px solid rgba(18,224,255,0.15);border-radius:12px;padding:16px 20px;margin:16px}
.interp p{font-size:13px;color:var(--text);margin-bottom:8px;line-height:1.6}
.interp p b{color:var(--cyan)}
.interp h3{color:var(--cyan);font-size:14px;font-weight:700;margin-bottom:8px}
</style></head>
<body>

<!-- HEADER -->
<div class="header">
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
    <div>
      <h1>⚡ PulseMesh <span>Mission Control</span></h1>
      <div class="sub">${esc(ts)} · ${sensors.length} sensors · ${alerts.length} alerts · ${mesh.fallback_sensor_count ?? 0} fallback</div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <span class="gate-badge gate-${gate}">${gate.toUpperCase()}</span>
      <span style="font-size:11px;color:var(--dim)">Mesh Health: <b style="color:${healthColor(meshHealth)}">${meshHealth.toFixed(3)}</b></span>
    </div>
  </div>
</div>

<!-- HERO METRICS -->
<div class="hero">
  <div class="hero-grid">
    <div class="hero-stat"><div class="val" style="color:${healthColor(meshHealth)}">${meshHealth.toFixed(3)}</div><div class="lbl">Mesh Health</div></div>
    <div class="hero-stat"><div class="val">${mesh.sensor_count ?? 0}</div><div class="lbl">Sensors</div></div>
    <div class="hero-stat"><div class="val" style="color:${(mesh.fallback_sensor_count??0)>0?'var(--gold)':'var(--green)'}">${mesh.fallback_sensor_count ?? 0}</div><div class="lbl">Fallback</div></div>
    <div class="hero-stat"><div class="val" style="color:${(mesh.alert_count??0)>0?'var(--pink)':'var(--green)'}">${mesh.alert_count ?? 0}</div><div class="lbl">Alerts</div></div>
    <div class="hero-stat"><div class="val" style="color:${(mesh.critical_alert_count??0)>0?'var(--pink)':'var(--green)'}">${mesh.critical_alert_count ?? 0}</div><div class="lbl">Critical</div></div>
  </div>
</div>

<!-- AGENT IMPACT -->
<div class="section-title">🤖 Agent Impact Analysis — How This Data Affects AGNT Workflows</div>
<div class="grid g-12" style="padding:0 16px">
  <div class="card" style="grid-column:span 7">
    <div class="card-title">System Effects on Agent Operations</div>
    ${agentImpact.impacts.length > 0 ? impactCards : '<p style="color:var(--dim);font-size:13px">All systems nominal. No agent-impacting conditions detected.</p>'}
  </div>
  <div class="card" style="grid-column:span 5">
    <div class="card-title">Health Distribution</div>
    <div style="display:flex;align-items:center;gap:16px">
      <div>${donutDonut}</div>
      <div style="flex:1">
        <div style="margin:4px 0"><span style="color:var(--green)">●</span> Healthy: ${healthy}</div>
        <div style="margin:4px 0"><span style="color:var(--gold)">●</span> Warning: ${warnCount}</div>
        <div style="margin:4px 0"><span style="color:var(--pink)">●</span> Critical: ${critCount}</div>
        <hr style="border-color:var(--border);margin:8px 0">
        <div style="font-size:11px;color:var(--dim)">Agent recommendation:</div>
        <div style="font-size:13px;font-weight:600;color:${agentImpact.goal==='go'?'var(--green)':agentImpact.goal==='warn'?'var(--gold)':'var(--pink)'}"><b>${agentImpact.goal === 'go' ? '✅ All systems clear' : agentImpact.goal === 'warn' ? '⚠️ Proceed with caution' : '🛑 Halt heavy workloads'}</b></div>
      </div>
    </div>
  </div>
</div>

<!-- DATA INTERPRETATION -->
<div class="interp">
  <h3>📊 What This Data Is Telling Us</h3>
  ${dataInterpretation}
</div>

<!-- SYSTEM GAUGES -->
<div class="section-title">🖥️ System Resources</div>
<div class="card" style="margin:0 16px">
  <div style="display:flex;gap:20px;flex-wrap:wrap;justify-content:center;align-items:center">
    ${gaugeCharts || '<span style="color:var(--dim)">No system sensors</span>'}
  </div>
</div>

<!-- ANOMALY + COHERENCE CHARTS -->
<div class="chart-grid">
  <div class="card">
    <div class="card-title">🔥 Anomaly Scores (Highest First)</div>
    ${anomalyChart}
  </div>
  <div class="card">
    <div class="card-title">🌊 Coherence (Signal Stability)</div>
    ${coherenceChart}
  </div>
</div>

<!-- SPACE & ENVIRONMENT -->
${spaceCharts ? `<div class="section-title">🌌 Space Weather & Environment</div>
<div class="card" style="margin:0 16px">
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px">${spaceCharts}</div>
</div>` : ''}

<!-- SENSOR DETAIL TABLE -->
<div class="section-title">📡 All Sensors</div>
<div class="tbl-wrap card" style="margin:0 16px;padding:0;overflow:hidden">
<table>
  <thead><tr>
    <th>Sensor</th><th>Provider</th><th>Source</th><th>Health</th>
    <th>Anomaly</th><th>Coherence</th><th>Spikes</th><th>Mean</th><th>Trend</th><th>Alerts</th>
  </tr></thead>
  <tbody>${sensorRows || '<tr><td colspan="10" style="text-align:center;color:var(--dim);padding:20px">No sensor data</td></tr>'}</tbody>
</table>
</div>

<!-- ALERTS -->
${alerts.length > 0 ? `<div class="section-title">🚨 Active Alerts</div>
<div class="card" style="margin:0 16px">
  <ul class="alerts-list">${alertItems}</ul>
</div>` : ''}

</body></html>`;
}

function generateDataInterpretation(sensors, meshHealth) {
  const parts = [];
  if (meshHealth >= 0.8) {
    parts.push('<p><b>The environment is stable and healthy.</b> All monitored systems are within nominal parameters. Agent workflows can run at full speed without resource-related risk.</p>');
  } else if (meshHealth >= 0.6) {
    parts.push('<p><b>The environment is degraded but functional.</b> Some sensors show anomalies or are running on fallback data. Agent operations should continue with increased monitoring.</p>');
  } else {
    parts.push('<p><b>The environment is in a critical state.</b> Multiple sensors are anomalous or offline. Agent workflows should be paused until conditions improve.</p>');
  }
  const sysSensors = sensors.filter(s => s.profile_id?.startsWith('agnt_'));
  if (sysSensors.length > 0) {
    const cpu = sysSensors.find(s => s.profile_id.includes('cpu'));
    const mem = sysSensors.find(s => s.profile_id.includes('memory'));
    if (cpu || mem) {
      const details = [];
      if (cpu) details.push('CPU ' + (cpu.metrics?.mean?.toFixed(1)) + '% load');
      if (mem) details.push('memory at ' + (mem.metrics?.mean?.toFixed(1)) + '% used');
      const memWarn = (mem && mem.metrics?.mean > 85) ? '<b>High memory pressure — large workflows (NeuralForge, batch agents) may be throttled.</b>' : 'Resource headroom is sufficient for most workloads.';
      parts.push('<p>The local machine reports ' + details.join(' and ') + '. ' + memWarn + '</p>');
    }
  }
  const netSensor = sensors.find(s => s.profile_id?.includes('latency') || s.profile_id?.includes('ping'));
  if (netSensor) {
    const lat = netSensor.metrics?.mean ?? 0;
    const latMsg = lat > 100 ? 'Elevated latency will slow all external API calls (GitHub, NOAA, CoinGecko). Cached data may be used instead.' : lat > 50 ? 'Moderate latency — external calls should be acceptable.' : 'Low latency — network is fast and reliable.';
    parts.push('<p>External connectivity: average TCP latency <b>' + lat.toFixed(0) + 'ms</b>. ' + latMsg + '</p>');
  }
  const ghSensor = sensors.find(s => s.profile_id?.includes('github') || s.profile_id?.includes('AGNT-PLUGINS'));
  if (ghSensor) {
    const desc = ghSensor.metadata?.description || 'Last updated: ' + (ghSensor.metadata?.updated || 'unknown');
    parts.push('<p>GitHub repository <b>' + esc(ghSensor.metadata?.full_name || ghSensor.label) + '</b>: ' + desc + '.</p>');
  }
  const spaceSensor = sensors.find(s => s.profile_id?.includes('kp') || s.profile_id?.includes('sunspot'));
  if (spaceSensor) {
    const lv = spaceSensor.values?.[spaceSensor.values.length - 1];
    const spMsg = (spaceSensor.profile_id?.includes('kp') && lv >= 5) ? 'Elevated geomagnetic activity — GPS accuracy may be affected.' : 'Within normal range.';
    parts.push('<p>Space weather: ' + esc(spaceSensor.label) + ' latest <b>' + (lv?.toFixed(2) ?? 'N/A') + '</b>. ' + spMsg + '</p>');
  }
  const fbCount = sensors.filter(s => !s.used_live_data).length;
  if (fbCount > 0) {
    const fbNames = sensors.filter(s => !s.used_live_data).map(s => s.label || s.profile_id).join(', ');
    const warn30 = fbCount > sensors.length * 0.3 ? ' More than 30% on fallback — mesh health may not reflect live conditions.' : '';
    parts.push('<p><b>' + fbCount + ' sensor(s) using fallback:</b> ' + esc(fbNames) + '.' + warn30 + '</p>');
  }
  return parts.join('\n');
}

export function writeDashboard(summaryPath, outPath) {
  const summary = typeof summaryPath === 'string' ? JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) : summaryPath;
  const html = generateDashboard(summary);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
  return outPath;
}
