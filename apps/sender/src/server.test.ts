import { describe, test, expect, afterEach } from 'vitest';
import http from 'node:http';
import { loadSimulations, buildEvents, buildServer, startRun } from './server.js';

const servers: any[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((s: any) => new Promise(r => s.close(r)))); });

function mockArgus() {
  const received: { url: string; body: string }[] = [];
  const srv = http.createServer((req, res) => {
    if (req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ id: 'insp-1', lifecycleStatus: 'WAITING' })); }
    const chunks: Buffer[] = []; req.on('data', c => chunks.push(c as Buffer)); req.on('end', () => { received.push({ url: req.url!, body: Buffer.concat(chunks).toString('latin1') }); res.writeHead(202, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ evidenceId: 'ev-1', accepted: true, processingStatus: 'queued' })); });
  });
  servers.push(srv);
  return { srv, received };
}

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
