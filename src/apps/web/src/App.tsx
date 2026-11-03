import { useEffect, useRef, useState } from 'react';

type SimFile = { name: string; path: string; size: number };
type PlanEvent = SimFile & { mediaType: string; atMs: number; pointCount?: number };
type Simulation = { model_id: string; display_name: string; folder: string; images: SimFile[]; video: SimFile | null; pointcloud: SimFile | null; plan?: PlanEvent[]; totals?: { video: number; photo: number; pointcloud: number; total: number } };
type RunEvent = SimFile & { mediaType: string; status: string };
type Run = { state: string; events: RunEvent[]; accepted: number; errors: number; retries?: number; latestFile: string; serverResponse: string; completeSent: boolean };
const titleCase = (s: string) => (s || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const ICON = { video: 'M4 6h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2ZM17 10l5-3v10l-5-3', cube: 'M12 2l9 5v10l-9 5-9-5V7ZM12 22V12M21 7l-9 5-9-5' };
const off = (ms: number) => String(Math.floor(ms / 60000)).padStart(2, '0') + ':' + (ms % 60000 / 1000).toFixed(1).padStart(4, '0');
const mb = (b: number) => (b / 1048576).toFixed(1) + ' MB';

export default function App() {
  const [sims, setSims] = useState<Simulation[]>([]);
  const [modelId, setModelId] = useState('');
  const [url, setUrl] = useState('http://localhost:8000');
  const [sid, setSid] = useState('');
  const [tab, setTab] = useState('video');
  const [run, setRun] = useState<Run | null>(null);
  const [reachable, setReachable] = useState(false);
  const [sessionOk, setSessionOk] = useState(false);
  const [sessionNote, setSessionNote] = useState('Paste the session ID shown in Argus');
  const [sessionModel, setSessionModel] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const deb = useRef<any>(null);

  const cur = sims.find(s => s.model_id === modelId);
  const sending = run?.state === 'SENDING';

  useEffect(() => { fetch('/api/simulations').then(r => r.json()).then(j => { setSims(j.simulations); if (j.simulations[0]) setModelId(j.simulations[0].model_id); }); }, []);
  useEffect(() => { const t = setInterval(() => fetch('/api/run').then(r => r.json()).then(j => setRun(j.run)).catch(() => {}), 1000); return () => clearInterval(t); }, []);
  // After a reload, show the scenario of the replay the sender is reporting.
  const [runSynced, setRunSynced] = useState(false);
  useEffect(() => { if (!runSynced && run && (run as any).model_id && sims.some(x => x.model_id === (run as any).model_id)) { setModelId((run as any).model_id); setRunSynced(true); } }, [run, sims, runSynced]);
  useEffect(() => { validate(url, sid); }, []);

  const validate = (u: string, s: string) => {
    if (!s.trim()) {
      setSessionNote('Paste the session ID shown in Argus'); setSessionOk(false);
      fetch('/api/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ argusBaseUrl: u }) }).then(r => r.json()).then(j => setReachable(!!j.reachable)).catch(() => setReachable(false));
      return;
    }
    fetch('/api/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ argusBaseUrl: u, inspectionId: s }) })
      .then(r => r.json()).then(j => {
        setReachable(!!j.reachable); setSessionOk(!!j.accepting); setSessionModel(j.model_id || null);
        setSessionNote(!j.reachable ? 'Cannot check session'
          : j.status === 404 ? 'Session not found. Check the ID in Argus.'
          : j.status !== 200 ? `Argus answered HTTP ${j.status}`
          : j.accepting ? `Session found: ${titleCase(j.lifecycleStatus)}`
          : `Session is ${titleCase(j.lifecycleStatus || 'closed')}. It no longer accepts evidence; start a new inspection in Argus.`);
      })
      .catch(() => { setReachable(false); setSessionOk(false); });
  };
  const onInput = (u: string, s: string) => { clearTimeout(deb.current); deb.current = setTimeout(() => validate(u, s), 400); };

  const all = cur?.plan ? cur.plan.map(e => ({ ...e, kind: e.mediaType })) : [];
  const offsets: Record<string, number> = {}; (cur?.plan || []).forEach(e => offsets[e.name] = e.atMs);
  const st: Record<string, string> = {}; (run?.events || []).forEach(e => st[e.name] = e.status);
  const count = (t: string) => run ? `${run.events.filter(e => e.mediaType === t && e.status === 'Accepted').length} / ${run.events.filter(e => e.mediaType === t).length}` : `0 / ${(cur?.totals as any)?.[t] ?? all.filter(f => f.kind === t).length}`;

  const send = async () => { setNote(''); const r = await fetch('/api/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model_id: modelId, argusBaseUrl: url, inspectionId: sid }) }); const j = await r.json(); if (!r.ok) setNote(j.error || 'Cannot send'); };
  const stop = async () => { await fetch('/api/stop', { method: 'POST' }); };
  const finished = run && ['STREAM_COMPLETE', 'STOPPED', 'FAILED'].includes(run.state);

  return (
    <div className="ar-app" style={{ '--accent': '#6FD6E8', '--accent-soft': '#10292F' } as React.CSSProperties}>
      <header className="ar-top">
        <div className="ar-logo" style={{ cursor: 'default' }}>
          <svg viewBox="0 0 26 26" fill="none" aria-hidden="true"><circle cx="13" cy="13" r="11.5" stroke="#6FD6E8" strokeWidth="1.5" /><path d="M10 8.5v9l8-4.5Z" fill="#6FD6E8" /></svg>
          Argus Simulator
        </div>
        <span className="ar-badge plain">Prepared evidence replay</span>
        <div className="ar-spacer" />
        <span className={`ar-badge ${reachable ? 'pass' : 'fail'}`} role="status">{reachable ? 'Argus API reachable' : 'Argus API unreachable'}</span>
      </header>
      <div className="ar-scroll"><main className="ar-page" style={{ paddingTop: 24 }}>
        <div className="ar-split">
          <form className="ar-card pad ar-side" style={{ display: 'flex', flexDirection: 'column', gap: 16 }} aria-label="Replay setup" onSubmit={e => e.preventDefault()}>
            <div className="ar-field"><label htmlFor="scenario">Scenario</label>
              <select id="scenario" className="ar-select" value={modelId} disabled={!!sending} onChange={e => setModelId(e.target.value)}>{sims.map(s => <option key={s.model_id} value={s.model_id}>{s.display_name}</option>)}</select></div>
            <div className="ar-field"><label htmlFor="api-url">Argus API URL</label>
              <input id="api-url" className="ar-input ar-mono" type="url" value={url} disabled={!!sending} onChange={e => { setUrl(e.target.value); onInput(e.target.value, sid); }} /></div>
            <div className="ar-field"><label htmlFor="session-id">Inspection Session ID</label>
              <input id="session-id" className="ar-input ar-mono" type="text" placeholder="Paste from Argus" value={sid} disabled={!!sending} onChange={e => { setSid(e.target.value); onInput(url, e.target.value); }} />
              <span className="ar-small" style={{ color: sessionOk ? '#4BE0A0' : undefined }}>{sessionNote}</span>
              {sessionOk && sessionModel && cur && sessionModel !== cur.model_id && <span className="ar-small" style={{ color: '#FFC554' }}>This session pins {sessionModel}; the scenario is {cur.model_id}. Its rules were chosen for {sessionModel}.</span>}</div>
            <button type="button" className="ar-btn primary" disabled={!(reachable && sessionOk && cur && !sending)} onClick={send}>Send Simulated Data</button>
            {sending && <span className="ar-small">Camera, photo and laser sources send in parallel, each in its own order.</span>}
            {sending && <div className="ar-bar"><button type="button" className="ar-btn secondary" style={{ flex: '1 1 auto' }} onClick={stop}>Stop</button></div>}
            {finished && <button type="button" className="ar-btn secondary" onClick={() => { setSid(''); setRun(null); }}>Replay with a new session</button>}
            <p className="ar-small">{sending ? 'Stop ends this replay only. The inspection is closed from Argus.' : finished ? 'Each replay needs a new inspection from Argus.' : 'Files go out once, at their scheduled offsets.'}</p>
          </form>

          <div className="ar-grow" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <section className="ar-card pad" aria-label="Delivery status" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="ar-bar" style={{ justifyContent: 'space-between' }}>
                <h1 className="ar-h2" style={{ fontSize: 22 }}>{run?.state === 'STREAM_COMPLETE' ? 'All files sent' : run?.state === 'STOPPED' ? 'Replay stopped' : run?.state === 'SENDING' ? 'Sending' : 'Ready to send'}</h1>
                <span className="ar-mono ar-small">{run ? `${run.accepted} of ${run.events.length}` : `${all.length} files`}</span>
              </div>
              {(note || run?.state === 'STREAM_COMPLETE') && <div className={`ar-note ${run?.state === 'STREAM_COMPLETE' ? 'ok' : ''}`}>{note || 'Stream finished — end inspection in Argus to generate dossier.'}</div>}
              <div className="ar-meter"><i style={{ width: `${run && run.events.length ? run.accepted / run.events.length * 100 : 0}%` }} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(140px,100%),1fr))', gap: 12 }}>
                <div><div className="ar-micro">Video segments</div><div className="ar-mono" style={{ fontSize: 22 }}>{count('video')}</div></div>
                <div><div className="ar-micro">Photographs</div><div className="ar-mono" style={{ fontSize: 22 }}>{count('photo')}</div></div>
                <div><div className="ar-micro">Point-cloud chunks</div><div className="ar-mono" style={{ fontSize: 22 }}>{count('pointcloud')}</div></div>
                <div><div className="ar-micro">Errors</div><div className="ar-mono" style={{ fontSize: 22, color: run?.errors ? '#FF7468' : '#4BE0A0' }}>{run?.errors ?? 0}{run?.retries ? <span className="ar-micro"> · {run.retries} retries</span> : null}</div></div>
              </div>
              <dl className="ar-dl" style={{ gridTemplateColumns: '120px minmax(0,1fr)' }}>
                <dt>Latest file</dt><dd className="ar-mono">{run?.completeSent ? 'POST /complete' : (run?.latestFile || '—')}</dd>
                <dt>Server response</dt><dd className="ar-mono">{run?.serverResponse || '—'}</dd>
              </dl>
            </section>

            <section className="ar-card" aria-label="Files in this scenario" style={{ overflow: 'hidden' }}>
              <div className="ar-tabs" role="tablist" style={{ padding: '4px 20px 0', borderBottom: '1px solid var(--line)' }}>
                {[['video', 'Videos'], ['photo', 'Photographs'], ['pointcloud', 'Laser point-cloud chunks']].map(([t, l]) => (
                  <button key={t} type="button" className="ar-tab" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{l} <b>{all.filter(f => f.kind === t).length}</b></button>
                ))}
              </div>
              <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                {all.filter(f => f.kind === tab).map(f => {
                  const status = st[f.name] || 'Scheduled';
                  const cls = status === 'Accepted' ? 'ar-badge pass' : (status.startsWith('Not sent') || status === 'Failed') ? 'ar-badge warn' : status === 'Retrying' ? 'ar-badge info' : 'ar-badge';
                  return (
                    <div key={f.name} className="ar-row static" style={{ gridTemplateColumns: '44px minmax(0,1fr) 90px 76px 190px', minHeight: 52, paddingBlock: 6 }}>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 36, overflow: 'hidden', background: 'var(--surface-2)', borderRadius: 8, color: 'var(--text-2)' }}>
                        {f.kind === 'photo' ? <img src={`/preview?model_id=${modelId}&path=${encodeURIComponent(f.path)}`} alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} /> : <svg className="ar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={f.kind === 'video' ? ICON.video : ICON.cube} /></svg>}
                      </span>
                      <span className="ar-mono" style={{ overflowWrap: 'anywhere' }}>{f.name}</span>
                      <span className="ar-micro">{f.kind === 'pointcloud' && (f as any).pointCount ? `${(f as any).pointCount.toLocaleString('en')} pts` : f.size ? mb(f.size) : 'chunk'}</span>
                      <span className="ar-mono ar-micro">{off(offsets[f.name] || 0)}</span>
                      <span><span className={cls}>{status === 'Accepted' ? 'Acknowledged' : status}</span></span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </main></div>
    </div>
  );
}
