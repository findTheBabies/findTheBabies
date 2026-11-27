import React, {useEffect, useState} from 'react';
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit,
  serverTimestamp, Timestamp,
} from 'firebase/firestore';
import {ArrowUpRight, ArrowRight, Bell, BellRing, Copy, Phone, Printer, Share2, ShieldCheck, MapPin, Clock, RefreshCw, Siren} from 'lucide-react';
import {app, brand, db} from './firebase';

const TYPE = {amber: 'AMBER Alert', endangered: 'Endangered missing', missing: 'Missing child'};
const SITE = `https://${brand.domain}`;
const fmt = (ts, withTime = false) => ts?.toDate?.().toLocaleString(undefined, withTime
  ? {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'}
  : {month: 'short', day: 'numeric', year: 'numeric'}) || '—';
const isLive = (a) => a.status === 'active' && (a.expiresAt?.toMillis?.() || 0) > Date.now();
const link = (navigate, to) => (e) => { e.preventDefault(); navigate(to); };

export function useActiveAlerts() {
  const [state, setState] = useState({alerts: null, error: ''});
  useEffect(() => {
    let current = true;
    getDocs(query(collection(db, 'alerts'), where('status', '==', 'active'), orderBy('createdAt', 'desc'), limit(60)))
      .then((snap) => current && setState({alerts: snap.docs.map((d) => ({id: d.id, ...d.data()})).filter(isLive), error: ''}))
      .catch(() => current && setState({alerts: [], error: 'Alerts could not load. Please refresh to try again.'}));
    return () => { current = false; };
  }, []);
  return state;
}

function AlertPhoto({a, size = 'card'}) {
  const [broken, setBroken] = useState(false);
  if (!a.photoUrl || broken) return <div className={'alert-photo empty ' + size} aria-hidden="true"><Siren size={size === 'card' ? 30 : 46}/></div>;
  return <img className={'alert-photo ' + size} src={a.photoUrl} alt={'Photo of ' + a.childName} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)}/>;
}

export function AlertCard({a, navigate}) {
  return <a className="alert-card" href={'/alerts/' + a.id} onClick={link(navigate, '/alerts/' + a.id)}>
    <AlertPhoto a={a}/>
    <div>
      <span className={'type-tag ' + a.alertType}>{TYPE[a.alertType]}</span>
      <h3>{a.childName}<span>, {a.age}</span></h3>
      <p><MapPin size={14}/> {a.lastSeenCity}, {a.lastSeenState}</p>
      <p><Clock size={14}/> Last seen {fmt(a.lastSeenAt)}</p>
    </div>
  </a>;
}

export function AlertsPreview({navigate, onSubscribe, user}) {
  const {alerts, error} = useActiveAlerts();
  return <section id="alerts" className="alerts-preview wrap">
    <div className="row-heading">
      <div><p className="eyebrow"><span className="dot live"/>Active alerts</p><h2>Eyes open, together.</h2></div>
      <a className="text-button" href="/alerts" onClick={link(navigate, '/alerts')}>See all alerts <ArrowRight size={17}/></a>
    </div>
    {error && <p role="alert" className="alert">{error}</p>}
    {!alerts ? <p className="muted" role="status">Loading alerts…</p>
      : alerts.length === 0 ? <div className="empty-alerts"><ShieldCheck size={28}/><p>No active alerts right now. Get notified the moment one is issued near you.</p></div>
      : <div className="alert-grid">{alerts.slice(0, 3).map((a) => <AlertCard key={a.id} a={a} navigate={navigate}/>)}</div>}
    <div className="subscribe-strip">
      <BellRing size={24}/>
      <p><strong>Get alerts for your area.</strong> Choose your zip code and how far out to watch. We'll notify you by email or on this device when an official alert is issued nearby.</p>
      <button className="button" onClick={onSubscribe}>{user ? 'Set my alert area' : 'Sign up for alerts'} <ArrowUpRight size={17}/></button>
    </div>
  </section>;
}

export function AlertsPage({navigate, onSubscribe, user}) {
  const {alerts, error} = useActiveAlerts();
  const [state, setState] = useState('');
  const states = [...new Set((alerts || []).map((a) => a.lastSeenState))].sort();
  const shown = (alerts || []).filter((a) => !state || a.lastSeenState === state);
  return <section className="wrap alerts-page">
    <p className="eyebrow"><span className="dot live"/>Active alerts</p>
    <h1>Have you seen these children?</h1>
    <p className="lead">Every alert here comes from law enforcement or the National Center for Missing &amp; Exploited Children and links to its official source. If you see a child from these alerts, call 911.</p>
    <div className="alerts-toolbar">
      <label htmlFor="state-filter">State</label>
      <select id="state-filter" value={state} onChange={(e) => setState(e.target.value)}>
        <option value="">All states</option>
        {states.map((s) => <option key={s}>{s}</option>)}
      </select>
      <button className="button small" onClick={onSubscribe}><Bell size={16}/> {user ? 'My alert area' : 'Get alerts near me'}</button>
    </div>
    {error && <p role="alert" className="alert">{error}</p>}
    {!alerts ? <p className="muted" role="status">Loading alerts…</p>
      : shown.length === 0 ? <div className="empty-alerts"><ShieldCheck size={28}/><p>No active alerts{state ? ' in ' + state : ''} right now.</p></div>
      : <div className="alert-grid">{shown.map((a) => <AlertCard key={a.id} a={a} navigate={navigate}/>)}</div>}
    <p className="notice">For all current national cases, see <a href="https://www.missingkids.org/gethelpnow/search" target="_blank" rel="noreferrer">NCMEC's missing child search</a>. {brand.notice}</p>
  </section>;
}

function postText(a, url) {
  return `MISSING: ${a.childName}, age ${a.age}. Last seen ${a.lastSeenCity}, ${a.lastSeenState} on ${fmt(a.lastSeenAt)}. `
    + `If you have seen this child, call 911 or ${a.contactPhone} (case ${a.caseNumber}). Official alert: ${a.sourceUrl} · ${url}`;
}

export function AlertDetail({id, navigate}) {
  const [a, setA] = useState(undefined), [msg, setMsg] = useState('');
  useEffect(() => {
    let current = true;
    getDoc(doc(db, 'alerts', id)).then((s) => current && setA(s.exists() ? {id: s.id, ...s.data()} : null)).catch(() => current && setA(null));
    return () => { current = false; };
  }, [id]);
  useEffect(() => { if (a) document.title = `Missing: ${a.childName} — ${brand.name}`; return () => { document.title = brand.name; }; }, [a]);
  if (a === undefined) return <section className="wrap alerts-page"><p role="status">Loading alert…</p></section>;
  if (!a || !isLive(a)) return <section className="wrap alerts-page account-gate">
    <ShieldCheck size={38}/><h1>This alert is no longer active.</h1>
    <p>It may have been resolved. To protect children's privacy, details are removed once an alert ends.</p>
    <button className="button" onClick={() => navigate('/alerts')}>See active alerts <ArrowRight size={17}/></button>
  </section>;
  const url = `${SITE}/alerts/${a.id}`;
  const copy = async (text, done) => { try { await navigator.clipboard.writeText(text); setMsg(done); } catch { setMsg('Copy failed. Select and copy the text instead.'); } };
  const share = async () => {
    if (navigator.share) { try { await navigator.share({title: `Missing: ${a.childName}`, text: postText(a, url), url}); return; } catch (e) { if (e.name === 'AbortError') return; } }
    copy(url, 'Link copied.');
  };
  return <article className="wrap alert-detail poster">
    <a className="text-button no-print" href="/alerts" onClick={link(navigate, '/alerts')}>← All alerts</a>
    <div className="poster-head"><span className={'type-tag ' + a.alertType}>{TYPE[a.alertType]}</span><span className="print-only">{brand.domain}</span></div>
    <div className="alert-detail-grid">
      <AlertPhoto a={a} size="large"/>
      <div>
        <h1>{a.childName}</h1>
        <dl className="facts">
          <div><dt>Age</dt><dd>{a.age}</dd></div>
          <div><dt>Last seen</dt><dd>{a.lastSeenCity}, {a.lastSeenState} {a.lastSeenZip}</dd></div>
          <div><dt>When</dt><dd>{fmt(a.lastSeenAt, true)}</dd></div>
          <div><dt>Case</dt><dd>{a.caseNumber} · {a.sourceName}</dd></div>
        </dl>
        {a.description && <p className="alert-description">{a.description}</p>}
        <div className="seen-box">
          <h2><Phone size={20}/> Have you seen this child?</h2>
          <p><strong>If the child is in front of you or in danger, call 911 now.</strong></p>
          <p>Otherwise call <a href={'tel:' + a.contactPhone.replace(/[^0-9+]/g, '')}>{a.contactPhone}</a> and mention case <strong>{a.caseNumber}</strong>. Note the time, place, direction of travel, and any vehicle.</p>
          <p className="hint">Do not approach or confront anyone, and do not post guesses about suspects online. Leave that to investigators.</p>
        </div>
        <a className="source-link no-print" href={a.sourceUrl} target="_blank" rel="noreferrer">View the official alert from {a.sourceName} <ArrowUpRight size={16}/></a>
      </div>
    </div>
    <section className="share-kit no-print" aria-labelledby="share-heading">
      <h2 id="share-heading">Help spread the word</h2>
      <p className="muted">Share only this official alert. Please don't add rumors or personal theories.</p>
      <div className="share-actions">
        <button className="button" onClick={share}><Share2 size={17}/> Share alert</button>
        <button className="button outline" onClick={() => copy(postText(a, url), 'Post text copied. Paste it into any social app.')}><Copy size={17}/> Copy a post</button>
        <button className="button outline" onClick={() => window.print()}><Printer size={17}/> Print a poster</button>
      </div>
      <p className="post-preview">{postText(a, url)}</p>
      <p role="status" className="share-status">{msg}</p>
    </section>
    <p className="print-only poster-foot">If you have seen this child, call 911 or {a.contactPhone}. Case {a.caseNumber}. {url}</p>
  </article>;
}

async function pushToken() {
  if (!brand.vapidKey) throw new Error('not-configured');
  const {getMessaging, getToken, isSupported} = await import('firebase/messaging');
  if (!('serviceWorker' in navigator) || !(await isSupported())) throw new Error('unsupported');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('denied');
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  return getToken(getMessaging(app), {vapidKey: brand.vapidKey, serviceWorkerRegistration: registration});
}
const PUSH_ERRORS = {
  'not-configured': 'Device notifications are still being set up. Email alerts work now.',
  unsupported: "This browser can't receive notifications. On iPhone, add this site to your Home Screen first, or use email alerts.",
  denied: 'Notifications are blocked for this site. Allow them in your browser settings, or use email alerts.',
};

export function AlertArea({user}) {
  const blank = {zip: '', radiusMiles: 25, push: false, email: true, tokens: []};
  const [sub, setSub] = useState(null), [exists, setExists] = useState(false), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [err, setErr] = useState('');
  const ref = doc(db, 'subscriptions', user.uid);
  useEffect(() => {
    getDoc(ref).then((s) => { setExists(s.exists()); setSub(s.exists() ? {...blank, ...s.data()} : blank); })
      .catch(() => { setSub(blank); setErr('Your alert area could not load. Please refresh.'); });
  }, [user.uid]);
  async function save(e) {
    e.preventDefault(); setMsg(''); setErr('');
    if (!/^[0-9]{5}$/.test(sub.zip)) return setErr('Enter a 5-digit US zip code.');
    if (!sub.push && !sub.email) return setErr('Choose at least one way to be notified, or use "Stop alerts".');
    setBusy(true);
    try {
      let tokens = sub.tokens || [];
      if (sub.push) {
        try { const t = await pushToken(); tokens = [...tokens.filter((x) => x !== t), t].slice(-5); }
        catch (pe) { setBusy(false); return setErr(PUSH_ERRORS[pe.message] || 'Device notifications could not be turned on. Try again or use email alerts.'); }
      }
      const next = {zip: sub.zip, radiusMiles: Number(sub.radiusMiles), push: sub.push, email: sub.email, tokens: sub.push ? tokens : []};
      await setDoc(ref, {...next, updatedAt: serverTimestamp()});
      setSub(next); setExists(true);
      setMsg(`You're on watch within ${next.radiusMiles} miles of ${next.zip}.`);
    } catch { setErr('Your alert area could not be saved. Please try again.'); }
    setBusy(false);
  }
  async function stop() {
    if (!window.confirm('Stop all missing-child alerts for this account?')) return;
    setBusy(true); setMsg(''); setErr('');
    try { await deleteDoc(ref); setSub(blank); setExists(false); setMsg('Alerts stopped. You can turn them back on anytime.'); }
    catch { setErr('Could not stop alerts. Please try again.'); }
    setBusy(false);
  }
  if (!sub) return <div className="profile-card alert-area"><p role="status">Loading your alert area…</p></div>;
  return <form className="profile-card alert-area" onSubmit={save}>
    <h2><BellRing size={22}/> My alert area</h2>
    <p className="muted">When law enforcement or NCMEC issues an alert near you, we'll let you know right away.</p>
    <div className="area-row">
      <div><label htmlFor="zip">Zip code</label><input id="zip" inputMode="numeric" autoComplete="postal-code" maxLength={5} value={sub.zip} onChange={(e) => setSub({...sub, zip: e.target.value.replace(/\D/g, '')})}/></div>
      <div><label htmlFor="radius">Watch within</label><select id="radius" value={sub.radiusMiles} onChange={(e) => setSub({...sub, radiusMiles: Number(e.target.value)})}>{[10, 25, 50, 100].map((m) => <option key={m} value={m}>{m} miles</option>)}</select></div>
    </div>
    <fieldset><legend>Notify me by</legend>
      <label className="check"><input type="checkbox" checked={sub.email} onChange={(e) => setSub({...sub, email: e.target.checked})}/> Email to {user.email}</label>
      <label className="check"><input type="checkbox" checked={sub.push} onChange={(e) => setSub({...sub, push: e.target.checked})}/> Notifications on this device</label>
    </fieldset>
    <div className="form-actions">
      <button className="button" disabled={busy} type="submit">{busy ? 'Saving…' : exists ? 'Update alert area' : 'Start alerts'} <Bell size={16}/></button>
      {exists && <button type="button" className="text-button" disabled={busy} onClick={stop}>Stop alerts</button>}
      <span role="status">{msg}</span>
    </div>
    {err && <p role="alert" className="alert">{err}</p>}
  </form>;
}

const STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA PR RI SC SD TN TX UT VT VA VI WA WV WI WY'.split(' ');
const emptyAlert = {childName: '', age: '', alertType: 'missing', lastSeenCity: '', lastSeenState: '', lastSeenZip: '', lastSeenAt: '', description: '', photoUrl: '', sourceName: '', sourceUrl: '', caseNumber: '', contactPhone: '', radiusMiles: 50, days: 14, verified: false};

export function AdminAlerts({user, navigate}) {
  const [form, setForm] = useState(emptyAlert), [rows, setRows] = useState(null), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [err, setErr] = useState('');
  const set = (k) => (e) => setForm({...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value});
  async function load() {
    try {
      const snap = await getDocs(query(collection(db, 'alerts'), orderBy('createdAt', 'desc'), limit(50)));
      const list = snap.docs.map((d) => ({id: d.id, ...d.data()}));
      const stats = await Promise.all(list.map((a) => getDoc(doc(db, 'alertStats', a.id)).then((s) => s.data()).catch(() => null)));
      setRows(list.map((a, i) => ({...a, stats: stats[i]})));
    } catch { setErr('Could not load alerts.'); }
  }
  useEffect(() => { load(); }, []);
  async function submit(e) {
    e.preventDefault(); setErr(''); setMsg('');
    const f = form, https = (v) => /^https:\/\/\S+$/.test(v);
    if (!f.verified) return setErr('Confirm you verified this alert with the official source.');
    if (!https(f.sourceUrl)) return setErr('The official source link must start with https://');
    if (f.photoUrl && !https(f.photoUrl)) return setErr('The photo link must start with https://');
    if (!/^[0-9]{5}$/.test(f.lastSeenZip)) return setErr('Enter the 5-digit zip code where the child was last seen.');
    const age = Number(f.age), seen = new Date(f.lastSeenAt);
    if (!Number.isInteger(age) || age < 0 || age > 20) return setErr('Age must be a whole number from 0 to 20.');
    if (isNaN(seen) || seen > new Date()) return setErr('Enter when the child was last seen (not in the future).');
    if (!window.confirm(`Publish this alert and notify members within ${f.radiusMiles} miles of ${f.lastSeenZip}?`)) return;
    setBusy(true);
    try {
      await addDoc(collection(db, 'alerts'), {
        childName: f.childName.trim(), age, description: f.description.trim(), lastSeenCity: f.lastSeenCity.trim(),
        lastSeenState: f.lastSeenState, lastSeenZip: f.lastSeenZip, lastSeenAt: Timestamp.fromDate(seen), photoUrl: f.photoUrl.trim(),
        sourceName: f.sourceName.trim(), sourceUrl: f.sourceUrl.trim(), caseNumber: f.caseNumber.trim(), contactPhone: f.contactPhone.trim(),
        alertType: f.alertType, status: 'active', radiusMiles: Number(f.radiusMiles), createdBy: user.uid,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + Number(f.days) * 86400000),
      });
      setForm(emptyAlert); setMsg('Alert published. Notifications are going out to members in range.'); load();
    } catch { setErr('The alert could not be published. Check every field and try again.'); }
    setBusy(false);
  }
  async function resolve(a, status) {
    const word = status === 'found' ? 'found safe' : 'closed';
    if (!window.confirm(`Mark ${a.childName} as ${word}? The photo and description will be removed and the alert will come down.`)) return;
    setBusy(true);
    try { await updateDoc(doc(db, 'alerts', a.id), {status, photoUrl: '', description: '', updatedAt: serverTimestamp()}); load(); }
    catch { setErr('Could not update that alert.'); }
    setBusy(false);
  }
  const field = (k, label, props = {}) => <div><label htmlFor={'f-' + k}>{label}</label><input id={'f-' + k} value={form[k]} onChange={set(k)} required {...props}/></div>;
  return <section className="admin-panel admin-alerts">
    <div className="saved-heading"><h2><Siren size={20}/> Admin: official alerts</h2><button className="icon-button" aria-label="Refresh alerts" disabled={busy} onClick={load}><RefreshCw size={18}/></button></div>
    <form className="profile-card alert-form" onSubmit={submit}>
      <h3>Post an alert</h3>
      <p className="hint">Only post alerts issued by law enforcement, NCMEC, or a state clearinghouse. Copy details exactly from the official source. Publishing notifies every member in range.</p>
      <div className="form-grid">
        {field('childName', "Child's name", {maxLength: 100})}
        {field('age', 'Age', {inputMode: 'numeric', maxLength: 2})}
        <div><label htmlFor="f-type">Alert type</label><select id="f-type" value={form.alertType} onChange={set('alertType')}>{Object.entries(TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        {field('lastSeenAt', 'Last seen (date & time)', {type: 'datetime-local'})}
        {field('lastSeenCity', 'Last seen city', {maxLength: 100})}
        <div><label htmlFor="f-state">State</label><select id="f-state" value={form.lastSeenState} onChange={set('lastSeenState')} required><option value="">Choose…</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select></div>
        {field('lastSeenZip', 'Last seen zip code', {inputMode: 'numeric', maxLength: 5})}
        <div><label htmlFor="f-radius">Notify members within</label><select id="f-radius" value={form.radiusMiles} onChange={set('radiusMiles')}>{[10, 25, 50, 100, 250].map((m) => <option key={m} value={m}>{m} miles</option>)}</select></div>
        {field('sourceName', 'Issuing agency', {maxLength: 100, placeholder: 'e.g. NCMEC, Springfield PD'})}
        {field('sourceUrl', 'Official alert link', {type: 'url', maxLength: 500, placeholder: 'https://'})}
        {field('caseNumber', 'Case number', {maxLength: 60})}
        {field('contactPhone', 'Tip line phone', {maxLength: 30, placeholder: 'e.g. 1-800-843-5678'})}
        {field('photoUrl', 'Official photo link (optional)', {type: 'url', maxLength: 500, required: false, placeholder: 'https://'})}
        <div><label htmlFor="f-days">Take down after</label><select id="f-days" value={form.days} onChange={set('days')}>{[7, 14, 30].map((d) => <option key={d} value={d}>{d} days</option>)}</select></div>
      </div>
      <label htmlFor="f-desc">Description (from the official alert)</label>
      <textarea id="f-desc" rows={3} maxLength={1000} value={form.description} onChange={set('description')} placeholder="Height, hair, clothing, vehicle…"/>
      <label className="check"><input type="checkbox" checked={form.verified} onChange={set('verified')}/> I verified this alert with the official source above.</label>
      <div className="form-actions"><button className="button" disabled={busy} type="submit">{busy ? 'Publishing…' : 'Publish & notify'} <BellRing size={16}/></button><span role="status">{msg}</span></div>
      {err && <p role="alert" className="alert">{err}</p>}
    </form>
    <h3 className="admin-sub">Posted alerts</h3>
    {!rows ? <p className="muted">Loading…</p> : rows.length === 0 ? <p className="muted">No alerts posted yet.</p>
      : <ul className="admin-alert-list">{rows.map((a) => <li key={a.id}>
        <div>
          <a href={'/alerts/' + a.id} onClick={link(navigate, '/alerts/' + a.id)}><strong>{a.childName}</strong></a>, {a.age} · {a.lastSeenCity}, {a.lastSeenState}
          <small>{a.status === 'active' ? (isLive(a) ? 'Active' : 'Expired') : a.status === 'found' ? 'Found safe' : 'Closed'} · posted {fmt(a.createdAt)} · {a.stats ? `${a.stats.recipients || 0} members notified` : 'notifications pending'}</small>
        </div>
        {a.status === 'active' && <span className="admin-actions"><button className="button small light" disabled={busy} onClick={() => resolve(a, 'found')}>Found safe</button><button className="button small outline" disabled={busy} onClick={() => resolve(a, 'closed')}>Close</button></span>}
      </li>)}</ul>}
  </section>;
}
