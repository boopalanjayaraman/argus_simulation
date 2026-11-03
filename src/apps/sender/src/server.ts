import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// Minimal .env loader (no dependency): repo-root .env, process env wins.
// Skipped under tests so suites stay hermetic.
if (!process.env.VITEST) try {
  const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env');
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const MANIFEST = path.join(root, 'src/available_simulations.json');
export const PORT = Number(process.env.SIM_PORT || 4173);
const DEFAULT_ARGUS = process.env.ARGUS_BASE_URL || 'http://localhost:8000';
const TOKEN = process.env.ARGUS_INGEST_TOKEN || '';
const IMAGE_INTERVAL_MS = Number(process.env.IMAGE_INTERVAL_MS || 2000);
const RETRY_MAX = Number(process.env.RETRY_MAX_ATTEMPTS || 3);

export interface SimFile { name: string; path: string; size: number }
export interface Simulation { model_id: string; display_name: string; folder: string; images: SimFile[]; video: SimFile | null; pointcloud: SimFile | null; cad: SimFile | null }

export function loadSimulations(): Simulation[] {
  const raw = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  return (raw.available_simulation_data || []).map((e: any) => {
    const base = path.join(root, e.parent_folder_path);
    const list = (dir: string): SimFile[] => {
      const p = path.join(base, dir);
      return fs.existsSync(p) ? fs.readdirSync(p).sort().filter(f => !f.startsWith('.')).map(f => ({ name: f, path: `${dir}/${f}`, size: fs.statSync(path.join(p, f)).size })) : [];
    };
    const one = (rel?: string): SimFile | null => rel && fs.existsSync(path.join(base, rel)) ? { name: path.basename(rel), path: rel, size: fs.statSync(path.join(base, rel)).size } : null;
    return { model_id: e.model_id, display_name: e.display_name || e.model_id, folder: e.parent_folder_path, images: list((e.image_captures_path || 'ImageCaptures').replace(/\/$/, '')), video: one(e.video_path), pointcloud: one(e.laser_point_cloud_path), cad: one(e.cad_path) };
  });
}

export interface SimEvent extends SimFile { eventId: string; sourceId: string; sequence: number; atMs: number; mediaType: string; endpoint: string; units?: string; coordinateFrame?: string; status?: string; chunkIndex?: number; pointCount?: number; sourcePath?: string }

export const VIDEO_CHUNK_MS = Number(process.env.VIDEO_CHUNK_MS || 2000);
export const POINTCLOUD_CHUNK_POINTS = Number(process.env.POINTCLOUD_CHUNK_POINTS || 50000);
const CHUNK_CACHE = path.join(root, '.chunks');

function videoDurationMs(file: string): number {
  try { return Math.round(parseFloat(execFileSync('ffprobe', ['-v','error','-show_entries','format=duration','-of','csv=p=0', file], { encoding: 'utf8' })) * 1000) || 0; } catch { return 0; }
}

/** Bytes per vertex from a PLY header's property list (vertex element only). */
export function plyStride(header: string): number {
  const sizes: Record<string, number> = { char: 1, uchar: 1, int8: 1, uint8: 1, short: 2, ushort: 2, int16: 2, uint16: 2, int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
  let stride = 0; let inVertex = false;
  for (const line of header.split('\n')) {
    if (line.startsWith('element ')) { inVertex = line.split(/\s+/)[1] === 'vertex'; continue; }
    if (inVertex && line.startsWith('property ')) { const type = line.split(/\s+/)[1]; if (!(type in sizes)) throw new Error(`Unsupported PLY property type: ${type}`); stride += sizes[type]; }
  }
  if (!stride) throw new Error('PLY header has no vertex properties');
  return stride;
}

function plyVertexCount(file: string): number {
  const fd = fs.openSync(file, 'r'); const buf = Buffer.alloc(2048); fs.readSync(fd, buf, 0, 2048, 0); fs.closeSync(fd);
  const m = buf.toString('ascii').match(/element vertex (\d+)/); return m ? Number(m[1]) : 0;
}

/** Split source files into stream chunks so the dashboard shows segments/chunks before sending. */
export function buildEvents(sim: Simulation, intervalMs = IMAGE_INTERVAL_MS): SimEvent[] {
  const events: SimEvent[] = []; const seq: Record<string, number> = {};
  const push = (mediaType: string, sourceId: string, file: SimFile, atMs: number, endpoint: string, extra: any = {}) => { seq[sourceId] = (seq[sourceId] || 0) + 1; events.push({ eventId: `${mediaType}-${String(seq[sourceId]).padStart(4, '0')}`, sourceId, sequence: seq[sourceId], atMs, mediaType, endpoint, ...file, ...extra }); };
  if (sim.video) {
    const dur = videoDurationMs(path.join(root, sim.folder, sim.video.path));
    const n = Math.max(1, Math.ceil(dur / VIDEO_CHUNK_MS));
    for (let i = 0; i < n; i++) push('video', 'camera-01', { name: `segment_${String(i + 1).padStart(3, '0')}.mp4`, path: sim.video.path, size: 0 }, i * intervalMs, 'video', { chunkIndex: i, sourcePath: sim.video.path });
  }
  sim.images.forEach((f, i) => push('photo', 'camera-photos-01', f, (i + 1) * intervalMs, 'photos'));
  if (sim.pointcloud) {
    const total = plyVertexCount(path.join(root, sim.folder, sim.pointcloud.path));
    const n = Math.max(1, Math.ceil(total / POINTCLOUD_CHUNK_POINTS));
    for (let i = 0; i < n; i++) push('pointcloud', 'laser-01', { name: `chunk_${String(i + 1).padStart(4, '0')}.ply`, path: sim.pointcloud.path, size: 0 }, (sim.images.length + 1 + i) * intervalMs, 'pointcloud', { units: 'mm', coordinateFrame: 'scanner_local', chunkIndex: i, pointCount: Math.min(POINTCLOUD_CHUNK_POINTS, total - i * POINTCLOUD_CHUNK_POINTS), sourcePath: sim.pointcloud.path });
  }
  return events.sort((a, b) => a.atMs - b.atMs || a.sequence - b.sequence);
}

/** Materialize chunk files (ffmpeg segments + PLY vertex slices) into .chunks/<model_id>/. Cached. */
export function materializeChunks(sim: Simulation, events: SimEvent[]): Map<string, string> {
  const out = new Map<string, string>();
  const dir = path.join(CHUNK_CACHE, sim.model_id); fs.mkdirSync(dir, { recursive: true });
  if (sim.video && events.some(e => e.mediaType === 'video')) {
    const seg0 = path.join(dir, 'segment_000.mp4');
    if (!fs.existsSync(seg0)) execFileSync('ffmpeg', ['-y','-v','error','-i', path.join(root, sim.folder, sim.video.path), '-c:v','libx264','-preset','veryfast','-force_key_frames',`expr:gte(t,n_forced*${VIDEO_CHUNK_MS / 1000})`,'-an','-f','segment','-segment_time', String(VIDEO_CHUNK_MS / 1000), '-reset_timestamps','1', path.join(dir, 'segment_%03d.mp4')]);
    let idx = 1; for (const f of fs.readdirSync(dir).filter(f => f.startsWith('segment_')).sort()) { out.set(`video-${idx}`, path.join(dir, f)); idx++; }
    const actual = idx - 1;
    for (let i = events.length - 1; i >= 0; i--) if (events[i].mediaType === 'video' && (events[i].chunkIndex ?? 0) >= actual) events.splice(i, 1);
    events.filter(e => e.mediaType === 'video').forEach(e => { const p = out.get(`video-${(e.chunkIndex ?? 0) + 1}`); if (p) { e.name = path.basename(p); e.path = path.relative(root, p); e.size = fs.statSync(p).size; } });
  }
  if (sim.pointcloud) {
    const src = path.join(root, sim.folder, sim.pointcloud.path);
    const data = fs.readFileSync(src); const headerEnd = data.indexOf('end_header\n') + 'end_header\n'.length;
    const header = data.subarray(0, headerEnd).toString('ascii'); const stride = plyStride(header);
    events.filter(e => e.mediaType === 'pointcloud').forEach(e => {
      const p = path.join(dir, e.name);
      const start = (e.chunkIndex ?? 0) * POINTCLOUD_CHUNK_POINTS; const count = e.pointCount ?? 0;
      const expected = headerEnd + count * stride;
      // Regenerate stale chunks written with a wrong stride.
      if (!fs.existsSync(p) || fs.statSync(p).size !== expected) { const h = header.replace(/element vertex \d+/, `element vertex ${count}`); fs.writeFileSync(p, Buffer.concat([Buffer.from(h), data.subarray(headerEnd + start * stride, headerEnd + (start + count) * stride)])); }
      e.path = path.relative(root, p); e.size = fs.statSync(p).size;
    });
  }
  events.filter(e => e.mediaType === 'photo').forEach(e => { e.sourcePath = e.path; });
  return out;
}

export interface Run { state: string; model_id: string; inspectionId: string; argusBaseUrl: string; sessionStatus: string; startedAt: number; events: SimEvent[]; accepted: number; errors: number; latestFile: string; serverResponse: string; completeSent: boolean; stopped: boolean }
let run: Run | null = null;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function postMultipart(url: string, filePath: string, metadata: any) {
  const bytes = fs.readFileSync(filePath);
  const boundary = '----argus' + Date.now().toString(36);
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${path.basename(filePath)}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const headers: Record<string, string> = { 'Content-Type': `multipart/form-data; boundary=${boundary}` };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(url, { method: 'POST', headers, body: Buffer.concat([head, bytes, tail]) });
  return { status: res.status, body: (await res.text()).slice(0, 500) };
}

async function uploadWithRetry(argusBase: string, inspectionId: string, sim: Simulation, ev: SimEvent) {
  const url = `${argusBase.replace(/\/$/, '')}/api/v1/inspections/${encodeURIComponent(inspectionId)}/${ev.endpoint}`;
  const metadata = { schemaVersion: '1.0', eventId: ev.eventId, sourceId: ev.sourceId, sequence: ev.sequence, relativeTimeMs: ev.atMs, mediaType: ev.mediaType, synthetic: true, ...(ev.mediaType === 'pointcloud' ? { units: ev.units, coordinateFrame: ev.coordinateFrame } : {}) };
  let last = { status: 0, body: '' };
  for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
    const fp = fs.existsSync(path.join(root, ev.path)) ? path.join(root, ev.path) : path.join(root, sim.folder, ev.path);
    try { last = await postMultipart(url, fp, metadata); } catch (e: any) { last = { status: 0, body: String(e?.message || e) }; }
    if (last.status === 202) return last;
    if ([400, 404, 409, 413, 415].includes(last.status)) return last;
    if (attempt < RETRY_MAX) await sleep(500 * Math.pow(2, attempt - 1));
  }
  return last;
}

export async function startRun(opts: { model_id: string; argusBaseUrl?: string; inspectionId: string; intervalMs?: number }): Promise<Run> {
  const sim = loadSimulations().find(s => s.model_id === opts.model_id);
  if (!sim) throw new Error(`Unknown model_id: ${opts.model_id}`);
  if (!opts.inspectionId) throw new Error('Inspection Session ID is required');
  const base = (opts.argusBaseUrl || DEFAULT_ARGUS).replace(/\/$/, '');
  let sessionStatus = 'unknown';
  try { const r = await fetch(`${base}/api/v1/inspections/${encodeURIComponent(opts.inspectionId)}`); sessionStatus = `${r.status}`; if (r.status === 404) throw new Error('Session not found (404)'); if (r.status === 409) throw new Error('Session closed (409)'); }
  catch (e: any) { if (!/Session/.test(e.message)) throw new Error(`Argus API unreachable: ${e.message}`); throw e; }
  const events = buildEvents(sim, opts.intervalMs || IMAGE_INTERVAL_MS);
  materializeChunks(sim, events);
  run = { state: 'SENDING', model_id: opts.model_id, inspectionId: opts.inspectionId, argusBaseUrl: base, sessionStatus, startedAt: Date.now(), events: events.map(e => ({ ...e, status: 'Scheduled' })), accepted: 0, errors: 0, latestFile: '', serverResponse: '', completeSent: false, stopped: false };
  const current = run;
  (async () => {
    const t0 = Date.now();
    for (const ev of current.events) {
      if (current.stopped) { ev.status = 'Not sent'; continue; }
      const wait = ev.atMs - (Date.now() - t0); if (wait > 0) await sleep(wait);
      if (current.stopped) { ev.status = 'Not sent'; continue; }
      ev.status = 'Sending'; current.latestFile = ev.name;
      const res = await uploadWithRetry(base, opts.inspectionId, sim, ev);
      current.serverResponse = `${res.status} ${res.body}`;
      if (res.status === 202) { ev.status = 'Accepted'; current.accepted++; }
      else if (res.status === 409) { ev.status = 'Failed'; current.errors++; current.events.filter(x => x.status === 'Scheduled').forEach(x => x.status = 'Not sent — session closed'); current.state = 'STOPPED'; break; }
      else { ev.status = 'Failed'; current.errors++; }
    }
    if (current.stopped) { current.state = 'STOPPED'; return; }
    if (current.state === 'STOPPED') return;
    if (current.accepted === current.events.length) {
      try { await fetch(`${base}/api/v1/inspections/${encodeURIComponent(opts.inspectionId)}/complete`, { method: 'POST', headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {} }); current.completeSent = true; } catch {}
      current.state = 'STREAM_COMPLETE';
    } else current.state = 'FAILED';
  })();
  return current;
}

export async function buildServer() {
  const app = Fastify();
  app.get('/api/simulations', async () => ({ simulations: loadSimulations().map(s => { const plan = buildEvents(s); return { ...s, plan, totals: { video: plan.filter(e => e.mediaType === 'video').length, photo: plan.filter(e => e.mediaType === 'photo').length, pointcloud: plan.filter(e => e.mediaType === 'pointcloud').length, total: plan.length } }; }) }));
  app.get('/api/health', async () => ({ ok: true, argusBaseUrl: DEFAULT_ARGUS }));
  app.get('/api/run', async () => ({ run }));
  app.post('/api/stop', async () => { if (run) { run.stopped = true; run.state = 'STOPPED'; run.events.filter(e => e.status === 'Scheduled').forEach(e => e.status = 'Not sent'); } return { run }; });
  app.post('/api/send', async (req: any, reply) => { try { const r = await startRun(req.body); return reply.code(202).send({ run: r }); } catch (e: any) { return reply.code(400).send({ error: String(e.message || e) }); } });
  app.post('/api/validate', async (req: any) => { const b = req.body || {}; const base = (b.argusBaseUrl || DEFAULT_ARGUS).replace(/\/$/, ''); try { const r = await fetch(`${base}/api/v1/inspections/${encodeURIComponent(b.inspectionId)}`); return { reachable: true, status: r.status, body: (await r.text()).slice(0, 500) }; } catch (e: any) { return { reachable: false, error: String(e.message || e) }; } });
  app.get('/preview', async (req: any, reply) => { const sim = loadSimulations().find(s => s.model_id === req.query.model_id); const rel = req.query.path || ''; const folderAbs = sim ? path.join(root, sim.folder) : ''; const full = path.join(folderAbs, rel); if (!sim || !full.startsWith(folderAbs)) return reply.code(400).send({ error: 'bad preview' }); const mime: Record<string,string> = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.mp4':'video/mp4', '.ply':'application/octet-stream' }; return reply.type(mime[path.extname(full)] || 'application/octet-stream').send(fs.createReadStream(full)); });
  const webDist = path.join(root, 'src/apps/web/dist');
  if (fs.existsSync(webDist)) await app.register(fastifyStatic, { root: webDist });
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await buildServer();
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Argus Simulator: http://localhost:${PORT}`);
}
