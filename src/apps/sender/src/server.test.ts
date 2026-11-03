import { describe, test, expect, afterEach } from 'vitest';
import http from 'node:http';
import { loadSimulations, buildEvents, buildServer, startRun } from './server.js';

const servers: any[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((s: any) => new Promise(r => s.close(r)))); });

function mockArgus(opts: { lifecycle?: string; closeAfter?: number; delayMs?: number } = {}) {
  const received: { url: string; body: string; at: number }[] = [];
  let inFlight = 0, peak = 0;
  const srv = http.createServer((req, res) => {
    if (req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ id: 'insp-1', lifecycleStatus: opts.lifecycle || 'WAITING', model_id: 'CVS6000_VALVE' })); }
    inFlight++; peak = Math.max(peak, inFlight);
    const chunks: Buffer[] = []; req.on('data', c => chunks.push(c as Buffer)); req.on('end', () => setTimeout(() => {
      inFlight--;
      received.push({ url: req.url!, body: Buffer.concat(chunks).toString('latin1'), at: Date.now() });
      if (opts.closeAfter !== undefined && received.filter(r => !r.url.endsWith('/complete')).length > opts.closeAfter) { res.writeHead(409, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { code: 'SESSION_CLOSED' } })); }
      res.writeHead(202, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ evidenceId: 'ev-1', accepted: true, processingStatus: 'queued' }));
    }, opts.delayMs || 0));
  });
  servers.push(srv);
  return { srv, received, peak: () => peak };
}
const listen = async (srv: http.Server) => { await new Promise<void>(r => srv.listen(0, r)); return `http://127.0.0.1:${(srv.address() as any).port}`; };
const waitRun = async (run: any) => { for (let i = 0; i < 200 && run.state === 'SENDING'; i++) await new Promise(r => setTimeout(r, 50)); };

describe('simulator', () => {
  test('dropdown source: entry in available_simulations.json appears via loadSimulations', () => {
    const sims = loadSimulations();
    expect(sims.find(s => s.model_id === 'CVS6000_VALVE')).toBeTruthy();
    expect(sims[0].images).toHaveLength(6);
    expect(sims[0].video && sims[0].pointcloud).toBeTruthy();
  });

  test('events: files split into stream chunks, images at intervals', () => {
    const ev = buildEvents(loadSimulations()[0], 100);
    expect(ev.filter(e => e.mediaType === 'video').length).toBeGreaterThan(1);
    expect(ev.filter(e => e.mediaType === 'pointcloud').length).toBeGreaterThan(1);
    expect(ev.filter(e => e.mediaType === 'pointcloud').every(e => (e.pointCount ?? 0) > 0)).toBe(true);
    const photos = ev.filter(e => e.mediaType === 'photo');
    expect(photos.map(p => p.atMs)).toEqual([100, 200, 300, 400, 500, 600]);
    expect(photos.map(p => p.name)).toEqual(['1.png', '2.png', '3.png', '4.png', '5.png', '6.png']);
  });

  test('send: streams to Argus by inspection id and completes', async () => {
    const { srv, received } = mockArgus();
    await new Promise<void>(r => srv.listen(0, r));
    const base = `http://127.0.0.1:${(srv.address() as any).port}`;
    const app = await buildServer(); servers.push({ close: (cb: any) => app.close().then(cb) });
    const run = await startRun({ model_id: 'CVS6000_VALVE', argusBaseUrl: base, inspectionId: 'insp-1', intervalMs: 5 });
    for (let i = 0; i < 50 && run.state === 'SENDING'; i++) await new Promise(r => setTimeout(r, 100));
    expect(run.accepted).toBe(run.events.length);
    expect(run.completeSent).toBe(true);
    expect(received.some(r => r.url.includes('/photos'))).toBe(true);
    expect(received.some(r => /synthetic/.test(r.body))).toBe(true);
  });
});

import { plyStride } from './server.js';
describe('plyStride', () => {
  test('sums vertex property sizes from the header', () => {
    const header = ['ply', 'format binary_little_endian 1.0', 'element vertex 50000',
      'property float x', 'property float y', 'property float z',
      'property uchar red', 'property uchar green', 'property uchar blue',
      'property uchar scanner_id', 'property uchar intensity', 'end_header'].join('\n');
    expect(plyStride(header)).toBe(17);
  });
});

import { startRun as start2, backoffMs, checkSession, MAX_CONCURRENT_UPLOADS } from './server.js';
describe('sender engine', () => {
  test('second scenario is registered with its own evidence', () => {
    const sim = loadSimulations().find(s => s.model_id === 'CVS3000_VALVE')!;
    expect(sim).toBeTruthy();
    expect(sim.images.length).toBe(12);
    expect(sim.video?.name).toBe('valve_inspection_afterpaint.mp4');
  });
  test('a closed session is reported as not accepting and Send is refused', async () => {
    const { srv } = mockArgus({ lifecycle: 'COMPLETED' });
    const base = await listen(srv);
    const s = await checkSession(base, 'insp-1');
    expect(s).toMatchObject({ reachable: true, status: 200, lifecycleStatus: 'COMPLETED', accepting: false });
    await expect(start2({ model_id: 'CVS6000_VALVE', argusBaseUrl: base, inspectionId: 'insp-1', intervalMs: 5 })).rejects.toThrow(/no longer accepts evidence/);
  });
  test('sources send concurrently, each in its own order, within the in-flight cap', async () => {
    const mock = mockArgus({ delayMs: 20 });
    const base = await listen(mock.srv);
    const run = await start2({ model_id: 'CVS6000_VALVE', argusBaseUrl: base, inspectionId: 'insp-1', intervalMs: 1 });
    await waitRun(run);
    expect(run.state).toBe('STREAM_COMPLETE');
    expect(mock.peak()).toBeGreaterThan(1);
    expect(mock.peak()).toBeLessThanOrEqual(MAX_CONCURRENT_UPLOADS);
    for (const src of ['camera-01', 'camera-photos-01', 'laser-01']) {
      const seqs = mock.received.filter(r => r.body.includes(`"sourceId":"${src}"`)).map(r => Number(r.body.match(/"sequence":(\d+)/)![1]));
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    }
  });
  test('409 SESSION_CLOSED stops every source and never calls /complete', async () => {
    const mock = mockArgus({ closeAfter: 3 });
    const base = await listen(mock.srv);
    const run = await start2({ model_id: 'CVS6000_VALVE', argusBaseUrl: base, inspectionId: 'insp-1', intervalMs: 5 });
    await waitRun(run);
    expect(run.state).toBe('STOPPED');
    expect(run.completeSent).toBe(false);
    expect(mock.received.some(r => r.url.endsWith('/complete'))).toBe(false);
    expect(run.events.filter(e => e.status === 'Not sent — session closed').length).toBeGreaterThan(0);
  });
  test('backoff is jittered and capped', () => {
    expect(backoffMs(1, 500, 5000, () => 1)).toBe(500);
    expect(backoffMs(10, 500, 5000, () => 1)).toBe(5000);
    expect(backoffMs(3, 500, 5000, () => 0)).toBe(0);
  });
});
