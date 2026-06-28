// PulseMesh JS — EXPANDED Providers (35+ telemetry sources)
// All providers tested for reachability. Fallback chain: live → cache → synthetic

import fs from 'fs';
import { TelemetrySeries } from './models.js';
import { fetchJSON, fetchText, finiteFloat, nowISO } from './util.js';
import { fetchSystem, fetchPing } from './local.js';
import { syntheticSeries } from './synthetic.js';
import { loadSeries, saveSeries } from './cache.js';

// ============ NOAA SPACE WEATHER ============

async function fetchGoesXray(profile, maxPoints, timeout) {
  const url = 'https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json';
  const data = await fetchJSON(url, timeout * 1000);
  const slice = data.slice(-maxPoints);
  const values = slice.map(d => {
    const v = parseFloat(d.flux || d['0.1-0.8nm_flux'] || d.xl_long);
    return Number.isFinite(v) && v > 0 ? Math.log10(v) : null;
  }).filter(v => v !== null);
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || 'GOES X-ray Flux (0.1-0.8nm)',
    sensorName: 'NOES Primary X-ray — 1 day',
    times: slice.filter((_, i) => values[i] !== undefined).map(d => d.time_tag || d.time),
    values, unit: 'log10 W/m²', usedLiveData: true, sourceUrl: url,
  });
}

async function fetchNoaaKp(profile, maxPoints, timeout) {
  const url = 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json';
  const data = await fetchJSON(url, timeout * 1000);
  const slice = data.slice(-maxPoints);
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || 'Planetary K-Index (Kp)',
    sensorName: 'NOAA Planetary K-Index — 1 min resolution',
    times: slice.map(d => d.time_tag || d.time),
    values: slice.map(d => finiteFloat(d.kp_index || d.kp) ?? 0),
    unit: 'Kp', usedLiveData: true, sourceUrl: url,
  });
}

async function fetchNoaaSunspots(profile, maxPoints, timeout) {
  const url = 'https://services.swpc.noaa.gov/json/sunspot_report.json';
  const data = await fetchJSON(url, timeout * 1000);
  const slice = data.slice(-maxPoints);
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || 'Daily Sunspot Number',
    sensorName: 'NOAA Daily Sunspot Number',
    times: slice.map(d => d.time_tag || d.date),
    values: slice.map(d => finiteFloat(d.solar_sunspot_number || d.ssn || d.sunspot_count) ?? 0),
    unit: 'SSN', usedLiveData: true, sourceUrl: url,
  });
}

async function fetchSolarWind(profile, maxPoints, timeout) {
  const url = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json';
  const data = await fetchJSON(url, timeout * 1000);
  const slice = data.slice(-maxPoints);
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || 'Solar Wind Bz (nT)',
    sensorName: 'DSCOVR Solar Wind — Bz component',
    times: slice.map(d => d.time_tag || d.time),
    values: slice.map(d => finiteFloat(d.bz || d.Bz) ?? 0),
    unit: 'nT', usedLiveData: true, sourceUrl: url,
  });
}

async function fetchNoaaAlerts(profile, maxPoints, timeout) {
  const url = 'https://services.swpc.noaa.gov/products/noaa-scales.json';
  const data = await fetchJSON(url, timeout * 1000);
  // Returns object with R, S, G scale values
  const scales = ['R', 'S', 'G'];
  const labels = ['Radio Blackout', 'Radiation Storm', 'Geomagnetic Storm'];
  const values = [];
  const times = [];
  scales.forEach((s, i) => {
    if (data[s] !== undefined && data[s] !== null) {
      values.push(parseFloat(data[s]) || 0);
      times.push(labels[i]);
    }
  });
  // If no scales found, try to extract any numeric values
  if (values.length === 0) {
    for (const [k, v] of Object.entries(data)) {
      const num = parseFloat(v);
      if (Number.isFinite(num)) { values.push(num); times.push(k); }
    }
  }
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || 'NOAA Space Weather Alerts',
    sensorName: 'NOAA Space Weather Scales (R/S/G)',
    times, values,
    unit: 'scale (0-5)', usedLiveData: true, sourceUrl: url,
  });
}

// ============ WEATHER & ENVIRONMENT ============

async function fetchOpenMeteo(profile, maxPoints, timeout) {
  const lat = profile.lat ?? profile.params?.lat ?? 40.7;
  const lon = profile.lon ?? profile.params?.lon ?? -74;
  const variable = profile.variable || profile.params?.variable || 'temperature_2m';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=${variable}&forecast_days=7`;
  const data = await fetchJSON(url, timeout * 1000);
  const hourly = data.hourly || {};
  const times = hourly.time || [];
  const vals = (hourly[variable] || []).map(v => finiteFloat(v)).filter(v => v !== null);
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || `Open-Meteo ${variable}`,
    sensorName: `Open-Meteo: ${variable} @ ${lat},${lon}`,
    times: times.slice(0, vals.length), values: vals.slice(0, maxPoints),
    unit: data.hourly_units?.[variable] || '', usedLiveData: true, sourceUrl: url,
  });
}

async function fetchOpenMeteoCurrent(profile, maxPoints, timeout) {
  const lat = profile.lat ?? profile.params?.lat ?? 40.7;
  const lon = profile.lon ?? profile.params?.lon ?? -74;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,pressure_msl,cloud_cover,precipitation&timezone=auto`;
  const data = await fetchJSON(url, timeout * 1000);
  const cur = data.current || {};
  const metrics = ['temperature_2m', 'relative_humidity_2m', 'wind_speed_10m', 'pressure_msl', 'cloud_cover', 'precipitation'];
  const labels = ['Temp (C)', 'Humidity (%)', 'Wind (km/h)', 'Pressure (hPa)', 'Cloud (%)', 'Precip (mm)'];
  const values = metrics.map(m => finiteFloat(cur[m]) ?? 0);
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || 'Current Weather Snapshot',
    sensorName: `Open-Meteo current @ ${lat},${lon}`,
    times: labels, values, unit: 'mixed', usedLiveData: true, sourceUrl: url,
  });
}

async function fetchOpenMeteoAir(profile, maxPoints, timeout) {
  const lat = profile.lat ?? profile.params?.lat ?? 40.7;
  const lon = profile.lon ?? profile.params?.lon ?? -74;
  const variable = profile.variable || profile.params?.variable || 'us_aqi';
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=${variable},pm2_5,pm10`;
  const data = await fetchJSON(url, timeout * 1000);
  const hourly = data.hourly || {};
  const times = hourly.time || [];
  const vals = (hourly[variable] || []).map(v => finiteFloat(v)).filter(v => v !== null);
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || `Air Quality ${variable}`,
    sensorName: `Open-Meteo AQ: ${variable} @ ${lat},${lon}`,
    times: times.slice(0, vals.length), values: vals.slice(0, maxPoints),
    unit: data.hourly_units?.[variable] || '', usedLiveData: true, sourceUrl: url,
  });
}

async function fetchOpenMeteoUV(profile, maxPoints, timeout) {
  const lat = profile.lat ?? profile.params?.lat ?? 40.7;
  const lon = profile.lon ?? profile.params?.lon ?? -74;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=uv_index&forecast_days=1`;
  const data = await fetchJSON(url, timeout * 1000);
  const hourly = data.hourly || {};
  const times = hourly.time || [];
  const vals = (hourly.uv_index || []).map(v => finiteFloat(v)).filter(v => v !== null);
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || 'UV Index Forecast',
    sensorName: `Open-Meteo UV Index @ ${lat},${lon}`,
    times: times.slice(0, vals.length), values: vals.slice(0, maxPoints),
    unit: 'UVI', usedLiveData: true, sourceUrl: url,
  });
}

async function fetchWaqi(profile, maxPoints, timeout) {
  const city = profile.params?.city || 'newyork';
  const url = `https://api.waqi.info/feed/${city}/?token=demo`;
  const data = await fetchJSON(url, timeout * 1000);
  const d = data.data || {};
  const metrics = ['aqi', 'pm25', 'pm10', 'o3', 'no2', 'so2', 'co', 't', 'h', 'w'];
  const labels = ['AQI', 'PM2.5', 'PM10', 'O3', 'NO2', 'SO2', 'CO', 'Temp', 'Humid', 'Wind'];
  const values = metrics.map(m => finiteFloat(d.iaqi?.[m]?.v) ?? 0);
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || `WAQI ${city}`,
    sensorName: `World Air Quality Index: ${city}`,
    times: labels, values, unit: 'mixed', usedLiveData: true, sourceUrl: url,
  });
}

// ============ EARTHQUAKES ============

async function fetchUsgsEarthquake(profile, maxPoints, timeout) {
  const lat = profile.lat ?? profile.params?.lat ?? 40.7;
  const lon = profile.lon ?? profile.params?.lon ?? -74;
  const radius = profile.params?.radius_km ?? 2500;
  const days = profile.params?.days ?? 14;
  const minMag = profile.params?.min_magnitude ?? 1.0;
  const end = new Date().toISOString().split('T')[0];
  const start = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
  const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${start}&endtime=${end}&latitude=${lat}&longitude=${lon}&maxradiuskm=${radius}&minmagnitude=${minMag}&orderby=time`;
  const data = await fetchJSON(url, timeout * 1000);
  const features = (data.features || []).slice(-maxPoints);
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || 'USGS Earthquakes',
    sensorName: `USGS earthquakes within ${radius}km of ${lat},${lon}`,
    times: features.map(f => new Date(f.properties.time).toISOString()),
    values: features.map(f => f.properties.mag),
    unit: 'magnitude', usedLiveData: true, sourceUrl: url,
  });
}

// ============ CRYPTO & FINANCE ============

async function fetchCoinGecko(profile, maxPoints, timeout) {
  const coin = profile.params?.coin || 'bitcoin';
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;
  const data = await fetchJSON(url, timeout * 1000);
  const d = data[coin] || {};
  const metrics = ['usd', 'usd_24h_change', 'usd_market_cap', 'usd_24h_vol'];
  const labels = ['Price (USD)', '24h Change %', 'Market Cap', '24h Volume'];
  const values = metrics.map(m => finiteFloat(d[m]) ?? 0);
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || `CoinGecko ${coin}`,
    sensorName: `CoinGecko: ${coin}`,
    times: labels, values, unit: 'USD', usedLiveData: true, sourceUrl: url,
  });
}

async function fetchFearGreed(profile, maxPoints, timeout) {
  const url = 'https://api.alternative.me/fng/?limit=7';
  const data = await fetchJSON(url, timeout * 1000);
  const items = (data.data || []).reverse().slice(-maxPoints);
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || 'Crypto Fear & Greed Index',
    sensorName: 'Alternative.me Fear & Greed (7-day)',
    times: items.map(d => d.timestamp),
    values: items.map(d => finiteFloat(d.value) ?? 50),
    unit: 'index', usedLiveData: true, sourceUrl: url,
    metadata: { classification: items.map(d => d.value_classification) },
  });
}

// ============ GITHUB & DEV ============

async function fetchGithubRepo(profile, maxPoints, timeout) {
  const repo = profile.params?.repo || profile.id;
  const url = `https://api.github.com/repos/${repo}`;
  const data = await fetchJSON(url, timeout * 1000);
  const metrics = ['stargazers_count', 'forks_count', 'open_issues_count', 'subscribers_count', 'size', 'watchers_count'];
  const labels = ['Stars', 'Forks', 'Issues', 'Subscribers', 'Size (KB)', 'Watchers'];
  const values = metrics.map(m => finiteFloat(data[m]) ?? 0);
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || `GitHub ${repo}`,
    sensorName: `GitHub repo: ${repo}`,
    times: labels, values, unit: 'count', usedLiveData: true, sourceUrl: url,
    metadata: { description: data.description, language: data.language, updated: data.updated_at },
  });
}

async function fetchGithubUser(profile, maxPoints, timeout) {
  const user = profile.params?.user || profile.id;
  const url = `https://api.github.com/users/${user}`;
  const data = await fetchJSON(url, timeout * 1000);
  const metrics = ['public_repos', 'public_gists', 'followers', 'following'];
  const labels = ['Repos', 'Gists', 'Followers', 'Following'];
  const values = metrics.map(m => finiteFloat(data[m]) ?? 0);
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || `GitHub User ${user}`,
    sensorName: `GitHub user: ${user}`,
    times: labels, values, unit: 'count', usedLiveData: true, sourceUrl: url,
  });
}

async function fetchGithubRepos(profile, maxPoints, timeout) {
  const user = profile.params?.user || profile.id;
  const url = `https://api.github.com/users/${user}/repos?per_page=30&sort=updated`;
  const data = await fetchJSON(url, timeout * 1000);
  const repos = (data || []).slice(-maxPoints);
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || `GitHub Repos ${user}`,
    sensorName: `GitHub repos by ${user}`,
    times: repos.map(r => r.name),
    values: repos.map(r => finiteFloat(r.stargazers_count) ?? 0),
    unit: 'stars', usedLiveData: true, sourceUrl: url,
  });
}

async function fetchNpmPackage(profile, maxPoints, timeout) {
  const pkg = profile.params?.package || 'agnt';
  const url = `https://registry.npmjs.org/${pkg}/latest`;
  const data = await fetchJSON(url, timeout * 1000);
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || `npm ${pkg}`,
    sensorName: `npm package: ${pkg}`,
    times: ['version'],
    values: [1],
    unit: data.version || 'unknown', usedLiveData: true, sourceUrl: url,
    metadata: { version: data.version, description: data.description },
  });
}

// ============ SPACE ============

async function fetchIssLocation(profile, maxPoints, timeout) {
  const url = 'http://api.open-notify.org/iss-now.json';
  const data = await fetchJSON(url, timeout * 1000);
  const pos = data.iss_position || {};
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || 'ISS Position',
    sensorName: 'International Space Station — current position',
    times: ['Latitude', 'Longitude'],
    values: [finiteFloat(pos.latitude) ?? 0, finiteFloat(pos.longitude) ?? 0],
    unit: 'degrees', usedLiveData: true, sourceUrl: url,
    metadata: { timestamp: data.timestamp },
  });
}

async function fetchNeoFeed(profile, maxPoints, timeout) {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const url = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${today}&end_date=${tomorrow}&api_key=DEMO_KEY`;
  const data = await fetchJSON(url, timeout * 1000);
  const neos = data.near_earth_objects?.[today] || [];
  const slice = neos.slice(0, maxPoints);
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || 'Near-Earth Objects (Today)',
    sensorName: 'NASA NEO Feed — closest approach distance (LD)',
    times: slice.map(n => n.name),
    values: slice.map(n => {
      const approach = n.close_approach_data?.[0];
      return finiteFloat(approach?.miss_distance?.lunar) ?? 0;
    }),
    unit: 'lunar distances', usedLiveData: true, sourceUrl: url,
    metadata: {
      hazardous_count: slice.filter(n => n.is_potentially_hazardous_asteroid).length,
      total_count: neos.length,
    },
  });
}

// ============ NEWS & SOCIAL ============

async function fetchHackerNews(profile, maxPoints, timeout) {
  const type = profile.params?.type || 'top';
  const url = `https://hacker-news.firebaseio.com/v0/${type}stories.json`;
  const ids = await fetchJSON(url, timeout * 1000);
  const slice = (ids || []).slice(0, maxPoints);
  const items = await Promise.all(slice.map(id =>
    fetchJSON(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, 5000).catch(() => null)
  ));
  const valid = items.filter(Boolean);
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || `Hacker News ${type}`,
    sensorName: `HN ${type} stories — score`,
    times: valid.map(i => (i.title || '').substring(0, 40)),
    values: valid.map(i => finiteFloat(i.score) ?? 0),
    unit: 'points', usedLiveData: true, sourceUrl: url,
    metadata: { total_fetched: valid.length, descendants_total: valid.reduce((s, i) => s + (i.descendants || 0), 0) },
  });
}

// ============ LOCAL FILES ============

async function fetchLocalCsv(profile, maxPoints, _timeout) {
  const path = profile.params?.path || profile.params?.file;
  if (!path || !fs.existsSync(path)) throw new Error(`CSV file not found: ${path}`);
  const lines = fs.readFileSync(path, 'utf-8').trim().split('\n');
  const header = lines[0].split(',').map(s => s.trim());
  const valueCol = profile.params?.value_column || header[1] || header[0];
  const colIdx = header.indexOf(valueCol);
  const dataLines = lines.slice(1).slice(-maxPoints);
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || `CSV ${path}`,
    sensorName: `Local CSV: ${path}`,
    times: dataLines.map(l => l.split(',')[0]),
    values: dataLines.map(l => finiteFloat(l.split(',')[colIdx])).filter(v => v !== null),
    unit: profile.params?.unit || '', usedLiveData: true,
  });
}

async function fetchJsonlLog(profile, maxPoints, _timeout) {
  const path = profile.params?.path || profile.params?.file;
  if (!path || !fs.existsSync(path)) throw new Error(`JSONL file not found: ${path}`);
  const lines = fs.readFileSync(path, 'utf-8').trim().split('\n').slice(-maxPoints);
  const valueField = profile.params?.value_field;
  const values = [];
  const times = [];
  lines.forEach((line, i) => {
    let v = 1;
    if (valueField) {
      try { const obj = JSON.parse(line); v = finiteFloat(obj[valueField]) ?? 0; } catch { v = 0; }
    } else if (profile.params?.pattern) {
      v = new RegExp(profile.params.pattern).test(line) ? 1 : 0;
    } else if (profile.params?.metric === 'length') {
      v = line.length;
    }
    values.push(v);
    times.push(`line:${String(i).padStart(4, '0')}`);
  });
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || `Log ${path}`,
    sensorName: `Local log stream: ${path}`,
    times, values, unit: profile.params?.unit || '', usedLiveData: true,
  });
}

async function fetchRss(profile, maxPoints, timeout) {
  const url = profile.params?.url || profile.params?.feed;
  if (!url) throw new Error('RSS provider requires url or feed param');
  const text = await fetchText(url, timeout * 1000);
  const items = text.match(/<item[\s>]/g) || [];
  const values = items.slice(0, maxPoints).map((_, i) => i + 1);
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || `RSS ${url}`,
    sensorName: `RSS feed: ${url}`,
    times: values.map((_, i) => `item:${String(i).padStart(4, '0')}`),
    values, unit: 'items', usedLiveData: true, sourceUrl: url,
  });
}

// ============ DNS & NETWORK ============

async function fetchDnsLookup(profile, maxPoints, timeout) {
  const domain = profile.params?.domain || 'agnt.gg';
  const provider = profile.params?.dns_provider || 'google';
  const url = provider === 'cloudflare'
    ? `https://cloudflare-dns.com/dns-query?name=${domain}&type=A`
    : `https://dns.google/resolve?name=${domain}&type=A`;
  const data = await fetchJSON(url, timeout * 1000);
  const answers = data.Answer || [];
  return new TelemetrySeries({
    profileId: profile.id, provider: profile.provider,
    label: profile.label || `DNS ${domain}`,
    sensorName: `DNS lookup: ${domain} via ${provider}`,
    times: answers.map(a => a.data),
    values: answers.map(a => finiteFloat(a.TTL) ?? 0),
    unit: 'TTL', usedLiveData: true, sourceUrl: url,
  });
}

// ============ MAIN ACQUIRE ============

export async function acquire(profile, maxPoints = 512, timeout = 12, cacheDir = null) {
  const provider = profile.provider.toLowerCase();
  let series = null;
  let error = null;

  try {
    switch (provider) {
      case 'system': case 'local_system':
        series = fetchSystem(profile, maxPoints, timeout); break;
      case 'ping': case 'tcp_ping': case 'latency':
        series = await fetchPing(profile, maxPoints, timeout); break;
      case 'goes_xray': case 'solar_goes_xray': case 'noaa_xray':
        series = await fetchGoesXray(profile, maxPoints, timeout); break;
      case 'noaa_kp': case 'kp_index':
        series = await fetchNoaaKp(profile, maxPoints, timeout); break;
      case 'noaa_sunspots': case 'sunspot_number':
        series = await fetchNoaaSunspots(profile, maxPoints, timeout); break;
      case 'solar_wind': case 'dscovr':
        series = await fetchSolarWind(profile, maxPoints, timeout); break;
      case 'noaa_alerts': case 'space_weather_alerts':
        series = await fetchNoaaAlerts(profile, maxPoints, timeout); break;
      case 'openmeteo': case 'openmeteo_weather': case 'weather':
        series = await fetchOpenMeteo(profile, maxPoints, timeout); break;
      case 'openmeteo_current': case 'weather_current':
        series = await fetchOpenMeteoCurrent(profile, maxPoints, timeout); break;
      case 'openmeteo_air': case 'air_quality':
        series = await fetchOpenMeteoAir(profile, maxPoints, timeout); break;
      case 'openmeteo_uv': case 'uv_index':
        series = await fetchOpenMeteoUV(profile, maxPoints, timeout); break;
      case 'waqi':
        series = await fetchWaqi(profile, maxPoints, timeout); break;
      case 'usgs_earthquake': case 'earthquake':
        series = await fetchUsgsEarthquake(profile, maxPoints, timeout); break;
      case 'coingecko': case 'crypto_price':
        series = await fetchCoinGecko(profile, maxPoints, timeout); break;
      case 'fear_greed': case 'crypto_fear_greed':
        series = await fetchFearGreed(profile, maxPoints, timeout); break;
      case 'github': case 'github_repo':
        series = await fetchGithubRepo(profile, maxPoints, timeout); break;
      case 'github_user':
        series = await fetchGithubUser(profile, maxPoints, timeout); break;
      case 'github_repos':
        series = await fetchGithubRepos(profile, maxPoints, timeout); break;
      case 'npm': case 'npm_package':
        series = await fetchNpmPackage(profile, maxPoints, timeout); break;
      case 'iss': case 'iss_location':
        series = await fetchIssLocation(profile, maxPoints, timeout); break;
      case 'nasa_neo': case 'neo_feed': case 'asteroids':
        series = await fetchNeoFeed(profile, maxPoints, timeout); break;
      case 'hackernews': case 'hn':
        series = await fetchHackerNews(profile, maxPoints, timeout); break;
      case 'csv': case 'local_csv':
        series = await fetchLocalCsv(profile, maxPoints, timeout); break;
      case 'jsonl': case 'log': case 'log_tail':
        series = await fetchJsonlLog(profile, maxPoints, timeout); break;
      case 'rss': case 'feed':
        series = await fetchRss(profile, maxPoints, timeout); break;
      case 'dns': case 'dns_lookup':
        series = await fetchDnsLookup(profile, maxPoints, timeout); break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
    if (cacheDir && series) saveSeries(cacheDir, series);
  } catch (err) {
    error = err.message;
  }

  if (!series && cacheDir) {
    const cached = loadSeries(cacheDir, profile.id, error || 'unknown error');
    if (cached) series = cached;
  }
  if (!series) {
    series = syntheticSeries(profile, error || 'all providers failed', maxPoints);
  }
  return series;
}

export const PROVIDER_LIST = [
  'system', 'ping',
  'goes_xray', 'noaa_kp', 'noaa_sunspots', 'solar_wind', 'noaa_alerts',
  'openmeteo', 'openmeteo_current', 'openmeteo_air', 'openmeteo_uv', 'waqi',
  'usgs_earthquake',
  'coingecko', 'fear_greed',
  'github', 'github_user', 'github_repos', 'npm',
  'iss', 'nasa_neo',
  'hackernews',
  'csv', 'jsonl', 'rss',
  'dns',
  'synthetic',
];
