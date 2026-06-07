import { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } from 'react';
import {
  CheckCircle2, AlertCircle, Info, X, AlertTriangle,
  LayoutGrid, Target, Trophy, Calendar, History, Brain,
  Settings as SettingsIcon, Eye, EyeOff, Sparkles, Package,
  Search, Plus, ChevronLeft, ChevronRight, ChevronDown,
  TrendingUp, TrendingDown, Minus, Star, Check,
  Trash2, Save, Wand2, BarChart3, LineChart, PieChart,
  Tag, FileText, Archive, Flame, Award, Zap,
  Clock, Volume2, VolumeX, Undo2, List, Grid3x3,
  Camera, Share2, Lock, Unlock, Filter, Hash,
  Cloud, CloudOff, RefreshCw, Copy, Upload, Download, KeyRound,
  Image as ImageIcon,
} from 'lucide-react';
import { loadState, saveState as cloudSaveState, getSyncKey, setSyncKey, generateSyncKey, normalizeMachine, normalizeHunt, normalizeSaved } from './lib/supabase';

/* ===== DATA ===== */
const MEGA_DATABASE = {
  'Pragmatic Play': ['Sugar Rush 1000','Sweet Bonanza 1000','Starlight Princess 1000','Wisdom of Athena 1000',"Big Bass Mission Fishin'",'Big Bass Amazon Xtreme','Big Bass Splash','Big Bass Bonanza','The Dog House Megaways','Zeus vs Hades','Fruit Party','Gems Bonanza','Madame Destiny Megaways'],
  'Hacksaw Gaming': ['Wanted Dead or a Wild','Le Bandit','Rip City','Hand of Anubis','Dork Unit','Rotten','Itero','Gladiator Legends',"Stack 'Em",'Cursed Crypt'],
  'Nolimit City': ['Mental','San Quentin xWays','Fire in the Hole 2','Deadwood RIP','The Crypt'],
  "Play'n GO": ['Book of Dead'],
  'Relax Gaming': ['Money Train 4','Iron Bank','Beast Mode',"Dead Man's Trail"],
  'Push Gaming': ['Razor Returns','Retro Tapes',"Jammin' Jars 2",'Giga Jar','Dinopolis','Fat Banker','Goat Getter'],
};
const PROVIDER_LIST = ['Pragmatic Play','Hacksaw Gaming','Nolimit City',"Play'n GO",'Push Gaming','Relax Gaming','Paperclip Gaming','Peter And Sons','Just Slots'];
const PROVIDER_COLORS = {'Pragmatic Play':'#d4af37','Hacksaw Gaming':'#6c8ea8','Nolimit City':'#c3654f',"Play'n GO":'#7da66f','Push Gaming':'#c98a4b','Relax Gaming':'#9e7bb5','Paperclip Gaming':'#5fa8a8','Peter And Sons':'#b8a87a','Just Slots':'#a89486'};
const PROVIDER_VOLATILITY = {'Nolimit City':1.5,'Hacksaw Gaming':1.3,'Relax Gaming':1.2,'Push Gaming':1.2,'Pragmatic Play':1.0,"Play'n GO":0.8,'Paperclip Gaming':1.2,'Peter And Sons':1.5,'Just Slots':1.4};
const DEFAULT_BET_SCALES = {
  'Nolimit City':[20,40,60,80,100,120,160,200,240,280],
  'Pragmatic Play':[10,20,30,40,50,60,70,80,90,100],
  'Hacksaw Gaming':[11,22,44,66,88,110,132,154,176,198],
  "Play'n GO":[10,20,30,40,50,70,100,120,160,200],
  'Push Gaming':[10,20,50,100,200,300,500,1000,2000,5000],
  'Relax Gaming':[9,18,27,45,72,90,135,180,270,450],
  'Paperclip Gaming':[9,18,27,45,72,90,135,180,270,450],
  'Peter And Sons':[9,18,27,45,72,90,135,180,270,450],
  'Just Slots':[9,18,27,45,72,90,135,180,270,450],
};
const PROVIDER_GROUPS = [
  {name:'Pragmatic Play',key:'Pragmatic Play',members:['Pragmatic Play']},
  {name:'Nolimit City',key:'Nolimit City',members:['Nolimit City']},
  {name:'Hacksaw / Backseat / Bullshark',key:'Hacksaw Gaming',members:['Hacksaw Gaming','Backseat Gaming','Bullshark Games']},
  {name:'Relax / Print Studios',key:'Relax Gaming',members:['Relax Gaming','Print Studios']},
  {name:"Play'n GO",key:"Play'n GO",members:["Play'n GO"]},
  {name:'Push Gaming',key:'Push Gaming',members:['Push Gaming']},
];

/* ===== HELPERS ===== */
const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2,11)}`;
const getProviderColor = (n) => {
  if (PROVIDER_COLORS[n]) return PROVIDER_COLORS[n];
  let h = 0;
  for (let i = 0; i < (n||'').length; i++) h = n.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360}, 35%, 55%)`;
};
const computeVolatility = (m) => {
  if ((m.tentatives||0) < 2 && (m.totalGain||0) > 1000) return 'low';
  let avg = 0;
  if (m.history?.length) { const r = m.history.slice(0,5); avg = r.reduce((a,h) => a + h.gain/(h.bet||1), 0) / r.length; }
  if ((m.tentatives >= 2 && m.tentatives <= 6) || avg > 20) return 'med';
  return 'high';
};
const getIAScore = (m) => {
  const lat = Math.pow(m.tentatives||0, 2) * 15;
  const w = m.ia_weight || 1.0;
  const total = m.totalGain || 0;
  const bc = m.history?.length || 0;
  const prof = bc > 0 ? total / (bc * 2) : 0;
  const pv = PROVIDER_VOLATILITY[m.provider] || 1.0;
  const v = computeVolatility(m);
  const vb = {low:45,med:30,high:20}[v] || 20;
  return lat * w + vb * pv - prof * 0.1;
};
const formatEUR = (n) => new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(n||0);
const formatEURCompact = (n) => {
  const v = n||0;
  if (Math.abs(v) >= 10000) return new Intl.NumberFormat('fr-FR',{notation:'compact',maximumFractionDigits:1}).format(v) + ' €';
  return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(v);
};
const seedMachines = () => {
  const out = [];
  for (const [provider, names] of Object.entries(MEGA_DATABASE)) {
    for (const nom of names) {
      out.push({id:uid(),nom,provider,image:'',history:[],tentatives:0,totalGain:0,ia_weight:1.0,fav:false,bonusCount:0,lastBonusDate:'Jamais',playCount:0,tags:[],notes:'',archived:false});
    }
  }
  return out;
};

/* ===== ANALYTICS ===== */
const computeRecords = (machines, hunts) => {
  let biggestMult = { value: 0, machine: null, bet: 0, gain: 0 };
  let biggestGain = { value: 0, machine: null };
  let biggestHunt = { value: 0, date: '' };
  let longestDrySpell = { value: 0, machine: null };
  machines.forEach((m) => {
    (m.history || []).forEach((h) => {
      const mult = h.gain / (h.bet || 1);
      if (mult > biggestMult.value) biggestMult = { value: mult, machine: m.nom, bet: h.bet, gain: h.gain };
      if (h.gain > biggestGain.value) biggestGain = { value: h.gain, machine: m.nom };
    });
    if ((m.tentatives || 0) > longestDrySpell.value) longestDrySpell = { value: m.tentatives, machine: m.nom };
  });
  hunts.forEach((h) => { if ((h.net || 0) > biggestHunt.value) biggestHunt = { value: h.net, date: h.date }; });
  return { biggestMult, biggestGain, biggestHunt, longestDrySpell };
};

const computeStreaks = (hunts) => {
  if (hunts.length === 0) return { current: 0, best: 0, currentType: 'none', worstStreak: 0 };
  const sorted = [...hunts].sort((a, b) => new Date(a.date.split(' ')[0].split('/').reverse().join('-')) - new Date(b.date.split(' ')[0].split('/').reverse().join('-')));
  let current = 0, best = 0, worstStreak = 0, worst = 0;
  let currentType = 'none';
  sorted.forEach((h, i) => {
    if (h.net > 0) {
      if (currentType === 'win') current++;
      else { current = 1; currentType = 'win'; }
      best = Math.max(best, current);
    } else if (h.net < 0) {
      if (currentType === 'loss') worst++;
      else { worst = 1; currentType = 'loss'; current = worst; }
      worstStreak = Math.max(worstStreak, worst);
    }
  });
  return { current, best, currentType, worstStreak };
};

const computePersonalRTP = (machines) => {
  const out = {};
  machines.forEach((m) => {
    const totalBet = (m.playCount || 0) * 1; // approximation : 1€/spin moyen
    const totalGain = m.totalGain || 0;
    const bonusBets = (m.history || []).reduce((a, h) => a + (h.bet || 0), 0);
    if (bonusBets > 0) out[m.id] = { rtp: (totalGain / bonusBets) * 100, sample: m.history.length };
  });
  return out;
};

const computeMultDistribution = (machines) => {
  const buckets = { '0-10':0, '10-50':0, '50-100':0, '100-250':0, '250-500':0, '500-1000':0, '1000+':0 };
  machines.forEach((m) => {
    (m.history || []).forEach((h) => {
      const mult = h.gain / (h.bet || 1);
      if (mult < 10) buckets['0-10']++;
      else if (mult < 50) buckets['10-50']++;
      else if (mult < 100) buckets['50-100']++;
      else if (mult < 250) buckets['100-250']++;
      else if (mult < 500) buckets['250-500']++;
      else if (mult < 1000) buckets['500-1000']++;
      else buckets['1000+']++;
    });
  });
  return buckets;
};

const computeBalanceCurve = (hunts, startStack = 0) => {
  const sorted = [...hunts].sort((a, b) => {
    const da = a.date.split(' ')[0].split('/').reverse().join('-');
    const db = b.date.split(' ')[0].split('/').reverse().join('-');
    return new Date(da) - new Date(db);
  });
  let bal = startStack;
  return [{ date: 'Start', balance: bal }, ...sorted.map((h) => { bal += h.net; return { date: h.date.split(' ')[0], balance: bal }; })];
};

const computeProviderROI = (machines, hunts) => {
  const data = {};
  hunts.forEach((h) => {
    h.items.forEach((it) => {
      const m = machines.find((x) => x.id === it.machineId);
      if (!m) return;
      if (!data[m.provider]) data[m.provider] = { bet: 0, gain: 0, count: 0 };
      data[m.provider].bet += it.bet || 0;
      if (it.status === 'bonus') data[m.provider].gain += it.finalGain || 0;
      data[m.provider].count++;
    });
  });
  return Object.entries(data).map(([provider, d]) => ({
    provider, bet: d.bet, gain: d.gain, count: d.count,
    roi: d.bet > 0 ? ((d.gain - d.bet) / d.bet) * 100 : 0,
  })).sort((a, b) => b.roi - a.roi);
};

const computeHourlyHeatmap = (hunts) => {
  const hourly = Array(24).fill(0).map(() => ({ count: 0, net: 0 }));
  hunts.forEach((h) => {
    const parts = h.date.split(' ');
    if (parts[1]) {
      const hour = parseInt(parts[1].split(':')[0]);
      if (!isNaN(hour) && hour < 24) {
        hourly[hour].count++;
        hourly[hour].net += h.net || 0;
      }
    }
  });
  return hourly;
};

const predictNextBonus = (m) => {
  if (!m.history || m.history.length < 2) return null;
  const tents = m.history.slice(0, 10).map((_, i, arr) => {
    // approximation : on a déjà reset les tentatives. Utilisons la moyenne.
    return 100; // placeholder
  });
  const avg = (m.playCount || 0) / Math.max(1, m.bonusCount || 1);
  const remaining = Math.max(0, avg - (m.tentatives || 0));
  return { avg: Math.round(avg), remaining: Math.round(remaining) };
};

/* ===== SOUNDS ===== */
let audioCtx = null;
const beep = (freq = 440, duration = 80, type = 'sine', vol = 0.04) => {
  if (typeof window === 'undefined') return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration / 1000);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + duration / 1000);
  } catch (e) {}
};
const sounds = {
  click: () => beep(800, 30, 'sine', 0.02),
  validate: () => beep(660, 80, 'triangle', 0.04),
  bigWin: () => {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 120, 'triangle', 0.05), i * 80));
  },
  monster: () => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => beep(f, 150, 'sawtooth', 0.06), i * 100));
  },
  error: () => beep(220, 200, 'square', 0.03),
};

/* ===== CHARTS (SVG pur) ===== */
function LineChartSVG({ data, height = 160, color = '#7da66f' }) {
  if (!data || data.length < 2) return <div className="h-40 grid place-items-center text-xs text-zinc-500">Pas assez de données</div>;
  const w = 600, h = height, pad = 24;
  const xs = data.map((_, i) => pad + (i / (data.length - 1)) * (w - pad * 2));
  const ys = data.map((d) => d.balance);
  const min = Math.min(...ys), max = Math.max(...ys), range = max - min || 1;
  const points = data.map((d, i) => `${xs[i]},${h - pad - ((d.balance - min) / range) * (h - pad * 2)}`).join(' ');
  const areaPoints = `${xs[0]},${h - pad} ${points} ${xs[xs.length-1]},${h - pad}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
      <defs>
        <linearGradient id="grad-line" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#grad-line)" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1={pad} y1={h - pad - ((0 - min) / range) * (h - pad * 2)} x2={w - pad} y2={h - pad - ((0 - min) / range) * (h - pad * 2)} stroke="#27272a" strokeDasharray="2 4" />
      <text x={pad} y={pad - 6} fill="#71717a" fontSize="10" fontFamily="monospace">{formatEURCompact(max)}</text>
      <text x={pad} y={h - pad + 14} fill="#71717a" fontSize="10" fontFamily="monospace">{formatEURCompact(min)}</text>
    </svg>
  );
}

function BarChartSVG({ data, height = 180, formatLabel }) {
  const keys = Object.keys(data);
  const vals = Object.values(data);
  const max = Math.max(...vals, 1);
  const w = 600, h = height, pad = 30;
  const barW = (w - pad * 2) / keys.length;
  const colors = ['#7da66f','#9ab57f','#d4af37','#e8a560','#c98a4b','#c3654f','#9e4b3a'];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
      {keys.map((k, i) => {
        const bh = (vals[i] / max) * (h - pad * 2);
        return (
          <g key={k}>
            <rect x={pad + i * barW + 4} y={h - pad - bh} width={barW - 8} height={bh} fill={colors[i] || '#6c8ea8'} rx="3" />
            <text x={pad + i * barW + barW / 2} y={h - pad + 14} fill="#71717a" fontSize="9" fontFamily="monospace" textAnchor="middle">{k}</text>
            {vals[i] > 0 && <text x={pad + i * barW + barW / 2} y={h - pad - bh - 4} fill="#a1a1aa" fontSize="10" fontFamily="monospace" textAnchor="middle">{vals[i]}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function HourlyHeatmapSVG({ data }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const w = 600, h = 80;
  const cellW = w / 24;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
      {data.map((d, i) => {
        const intensity = d.count / max;
        const color = d.net >= 0 ? `rgba(125,166,111,${0.1 + intensity * 0.9})` : `rgba(195,101,79,${0.1 + intensity * 0.9})`;
        return (
          <g key={i}>
            <rect x={i * cellW + 2} y={20} width={cellW - 4} height={40} fill={d.count === 0 ? 'rgba(255,255,255,0.03)' : color} rx="3">
              <title>{i}h : {d.count} session(s), {formatEUR(d.net)}</title>
            </rect>
            {i % 3 === 0 && <text x={i * cellW + cellW / 2} y={75} fill="#71717a" fontSize="9" fontFamily="monospace" textAnchor="middle">{i}h</text>}
          </g>
        );
      })}
    </svg>
  );
}

/* ===== CONFETTI ===== */
function Confetti({ active }) {
  const [particles, setParticles] = useState([]);
  useEffect(() => {
    if (!active) return;
    const arr = Array.from({ length: 60 }, () => ({
      id: uid(),
      x: 50 + (Math.random() - 0.5) * 30,
      y: 50,
      vx: (Math.random() - 0.5) * 8,
      vy: -Math.random() * 12 - 4,
      color: ['#d4af37','#e8c560','#7da66f','#6c8ea8','#c3654f','#fff'][Math.floor(Math.random() * 6)],
      rot: Math.random() * 360,
    }));
    setParticles(arr);
    const t = setTimeout(() => setParticles([]), 2500);
    return () => clearTimeout(t);
  }, [active]);
  if (particles.length === 0) return null;
  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <div key={p.id} className="absolute w-2 h-3" style={{
          left: `${p.x}%`, top: `${p.y}%`, background: p.color,
          transform: `rotate(${p.rot}deg)`,
          animation: `confetti-fall 2.5s cubic-bezier(0.4,0,0.6,1) forwards`,
          '--vx': `${p.vx * 20}px`, '--vy': `${p.vy * 30}px`,
        }} />
      ))}
      <style>{`@keyframes confetti-fall { to { transform: translate(var(--vx), 600px) rotate(720deg); opacity: 0; } }`}</style>
    </div>
  );
}

/* ===== CACHE LOCAL (offline fallback) ===== */
const CACHE_KEY = 'elite_slot_tracker_cache_v14';
const localCache = {
  get() {
    try { const raw = localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  },
  set(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
  },
};

/* ===== TOAST ===== */
const ToastCtx = createContext(() => {});
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, type = 'info') => {
    const id = uid();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  const icons = {
    success: <CheckCircle2 className="text-emerald-400" size={18} />,
    error: <AlertCircle className="text-rose-400" size={18} />,
    info: <Info className="text-sky-400" size={18} />,
  };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl bg-zinc-900 border border-white/10 shadow-2xl text-sm">
            {icons[t.type]}
            <span className="flex-1 text-zinc-100">{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
const useToast = () => useContext(ToastCtx);

/* ===== MODAL ===== */
function Modal({ children, onClose, size = 'md', title, subtitle }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  const sizes = { sm:'max-w-sm', md:'max-w-lg', lg:'max-w-2xl', xl:'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md" onClick={onClose}>
      <div className={`relative w-full ${sizes[size]} bg-zinc-900 border border-white/10 shadow-2xl rounded-2xl max-h-[88vh] overflow-hidden flex flex-col`} onClick={(e) => e.stopPropagation()}>
        {(title || onClose) && (
          <div className="flex items-start justify-between px-6 py-5 border-b border-white/10">
            <div>
              {title && <h2 style={{fontFamily:'Instrument Serif, serif'}} className="text-2xl text-zinc-100 leading-none">{title}</h2>}
              {subtitle && <p className="text-sm text-zinc-400 mt-1">{subtitle}</p>}
            </div>
            {onClose && (
              <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
                <X size={18} />
              </button>
            )}
          </div>
        )}
        <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

function useConfirm() {
  const [state, setState] = useState(null);
  const confirm = (msg, opts = {}) => new Promise((resolve) => setState({ msg, opts, resolve }));
  const node = state && (
    <Modal onClose={() => { state.resolve(false); setState(null); }} size="sm">
      <div className="text-center py-2">
        <div className={`mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full ${state.opts.danger ? 'bg-rose-500/15 text-rose-400' : 'bg-amber-500/15 text-amber-400'}`}>
          <AlertTriangle size={22} />
        </div>
        <p className="mb-6 text-zinc-100 leading-relaxed">{state.msg}</p>
        <div className="flex gap-2">
          <button onClick={() => { state.resolve(false); setState(null); }} className="flex-1 px-3 py-2 rounded-lg bg-zinc-800 border border-white/10 text-zinc-100 hover:bg-zinc-700 text-sm font-medium">Annuler</button>
          <button onClick={() => { state.resolve(true); setState(null); }} className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${state.opts.danger ? 'bg-rose-500 text-white hover:bg-rose-400' : 'bg-amber-400 text-zinc-950 hover:bg-amber-300'}`}>
            {state.opts.confirmLabel || 'Confirmer'}
          </button>
        </div>
      </div>
    </Modal>
  );
  return [confirm, node];
}

/* ===== NAV ===== */
const navItems = [
  { id: 'machines', label: 'Machines', icon: LayoutGrid },
  { id: 'hunt', label: 'Hunt', icon: Target },
  { id: 'ia', label: 'IA', icon: Brain },
  { id: 'savedHunts', label: 'En attente', icon: Package },
  { id: 'history', label: 'Historique', icon: History },
  { id: 'top5', label: 'Top 5', icon: Trophy },
  { id: 'records', label: 'Records', icon: Award },
  { id: 'stats', label: 'Stats', icon: BarChart3 },
  { id: 'monthly', label: 'Mensuel', icon: Calendar },
];

function Sidebar({ active, onNav, savedHuntsCount, hasActiveHunt, streamerMode, onToggleStreamer, soundOn, onToggleSound, theme, onToggleTheme, onOpenSettings, onOpenSearch, syncStatus, syncEnabled, onOpenSync }) {
  return (
    <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-white/10 bg-zinc-900/40 backdrop-blur-xl h-screen sticky top-0">
      <div className="px-6 py-6 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="grid h-9 w-9 place-items-center rounded-lg text-zinc-950 font-bold" style={{background:'linear-gradient(135deg,#d4af37,#9c7f1f)'}}>
              <Sparkles size={16} />
            </div>
            <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400" />
          </div>
          <div className="flex-1">
            <div style={{fontFamily:'Instrument Serif, serif'}} className="text-lg leading-none">Elite</div>
            <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 mt-0.5">Tracker</div>
          </div>
        </div>
        <button onClick={onOpenSearch} className="w-full mt-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-950/50 border border-white/5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition text-xs">
          <Search size={12} />
          <span className="flex-1 text-left">Rechercher…</span>
          <kbd style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[9px] bg-zinc-800 px-1 rounded">⌘K</kbd>
        </button>
      </div>
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 px-3 mb-2">Workspace</div>
        {navItems.map((item) => {
          const isActive = active === item.id;
          const Icon = item.icon;
          const showDot = (item.id === 'savedHunts' && savedHuntsCount > 0) || (item.id === 'hunt' && hasActiveHunt);
          return (
            <button key={item.id} onClick={() => onNav(item.id)} className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg mb-0.5 text-sm transition ${isActive ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100'}`}>
              <Icon size={16} className={isActive ? 'text-amber-400' : ''} />
              <span className="flex-1 text-left">{item.label}</span>
              {showDot && <span className={`h-1.5 w-1.5 rounded-full ${item.id === 'hunt' ? 'bg-amber-400 animate-pulse' : 'bg-rose-400'}`} />}
              {item.id === 'savedHunts' && savedHuntsCount > 0 && <span style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] text-zinc-500">{savedHuntsCount}</span>}
            </button>
          );
        })}
      </nav>
      <div className="px-3 py-3 border-t border-white/10 space-y-0.5">
        <button onClick={onToggleStreamer} className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100">
          {streamerMode ? <EyeOff size={16} /> : <Eye size={16} />}
          <span>Streamer</span>
          <span style={{fontFamily:'JetBrains Mono, monospace'}} className={`ml-auto text-[10px] ${streamerMode ? 'text-amber-400' : 'text-zinc-600'}`}>{streamerMode ? 'ON' : 'OFF'}</span>
        </button>
        <button onClick={onToggleSound} className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100">
          {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          <span>Sons</span>
          <span style={{fontFamily:'JetBrains Mono, monospace'}} className={`ml-auto text-[10px] ${soundOn ? 'text-amber-400' : 'text-zinc-600'}`}>{soundOn ? 'ON' : 'OFF'}</span>
        </button>
        <button onClick={onToggleTheme} className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100">
          {theme === 'dark' ? <Eye size={16} /> : <EyeOff size={16} />}
          <span>Thème</span>
          <span style={{fontFamily:'JetBrains Mono, monospace'}} className="ml-auto text-[10px] text-zinc-500">{theme === 'dark' ? 'sombre' : 'clair'}</span>
        </button>
        <button onClick={onOpenSettings} className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100">
          <SettingsIcon size={16} /><span>Paramètres</span>
        </button>
        <button onClick={onOpenSync} className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100">
          {syncEnabled ? (
            syncStatus === 'syncing' ? <RefreshCw size={16} className="animate-spin text-sky-400" /> :
            syncStatus === 'offline' || syncStatus === 'error' ? <CloudOff size={16} className="text-rose-400" /> :
            <Cloud size={16} className="text-emerald-400" />
          ) : <CloudOff size={16} />}
          <span>Synchronisation</span>
          <span style={{fontFamily:'JetBrains Mono, monospace'}} className={`ml-auto text-[10px] ${syncEnabled ? (syncStatus === 'offline' || syncStatus === 'error' ? 'text-rose-400' : 'text-emerald-400') : 'text-zinc-600'}`}>
            {syncEnabled ? (syncStatus === 'syncing' ? '···' : syncStatus === 'offline' ? 'OFF' : 'ON') : 'OFF'}
          </span>
        </button>
      </div>
    </aside>
  );
}

function MobileNav({ active, onNav, savedHuntsCount, hasActiveHunt }) {
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-zinc-900/95 backdrop-blur-xl px-2 py-1.5 flex items-center justify-around">
      {navItems.slice(0, 5).map((item) => {
        const isActive = active === item.id;
        const Icon = item.icon;
        const showDot = (item.id === 'savedHunts' && savedHuntsCount > 0) || (item.id === 'hunt' && hasActiveHunt);
        return (
          <button key={item.id} onClick={() => onNav(item.id)} className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg ${isActive ? 'text-amber-400' : 'text-zinc-500'}`}>
            <Icon size={18} />
            <span className="text-[10px] font-medium">{item.label}</span>
            {showDot && <span className="absolute top-0.5 right-2 h-1.5 w-1.5 rounded-full bg-rose-400" />}
          </button>
        );
      })}
    </nav>
  );
}

/* ===== MACHINE CARD ===== */
function MachineCard({ m, onClick, onToggleFav, streamerMode, selected, onSelect, selectMode }) {
  const best = m.history?.length ? Math.max(...m.history.map((h) => h.gain)) : 0;
  const color = getProviderColor(m.provider);
  const iaScore = getIAScore(m).toFixed(0);
  const vol = computeVolatility(m);
  const volDot = { high:'bg-rose-400', med:'bg-amber-400', low:'bg-emerald-400' }[vol];
  return (
    <div onClick={selectMode ? onSelect : onClick} className={`group relative cursor-pointer bg-zinc-900/80 backdrop-blur-xl border rounded-2xl overflow-hidden transition-all duration-200 ${selected ? 'border-amber-400 ring-2 ring-amber-400/30' : 'border-white/5 hover:border-white/15 hover:-translate-y-0.5'} ${m.archived ? 'opacity-60' : ''}`}>
      <div className="relative aspect-[4/3] bg-zinc-950 overflow-hidden">
        {m.image ? (
          <>
            <div className="absolute inset-0 bg-cover bg-center blur-2xl scale-110 opacity-60" style={{ backgroundImage: `url(${m.image})` }} />
            <img src={m.image} alt={m.nom} className="relative w-full h-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent" />
          </>
        ) : (
          <div className="grid place-items-center h-full">
            <div style={{ color, fontFamily:'Instrument Serif, serif' }} className="text-3xl opacity-30">{m.nom.charAt(0)}</div>
          </div>
        )}

        {selectMode ? (
          <div className={`absolute top-2 left-2 grid h-7 w-7 place-items-center rounded-md backdrop-blur transition z-10 ${selected ? 'bg-amber-400 text-zinc-950' : 'bg-zinc-950/60 text-zinc-400 border border-white/10'}`}>
            {selected && <Check size={14} />}
          </div>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); onToggleFav(); }} className={`absolute top-2 left-2 grid h-7 w-7 place-items-center rounded-md backdrop-blur transition z-10 ${m.fav ? 'bg-amber-400 text-zinc-950' : 'bg-zinc-950/60 text-zinc-400 hover:text-amber-400'}`}>
            <Star size={12} fill={m.fav ? 'currentColor' : 'none'} />
          </button>
        )}

        <div style={{fontFamily:'JetBrains Mono, monospace'}} className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-950/70 backdrop-blur border border-white/10 text-[10px]">
          <span className={`h-1.5 w-1.5 rounded-full ${volDot}`} title={`Vol. ${vol}`} />
          <span className="text-sky-400">IA {iaScore}</span>
        </div>

        {m.archived && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-zinc-950/80 backdrop-blur border border-white/10 text-[9px] text-zinc-400 flex items-center gap-1">
            <Archive size={10} /> Archive
          </div>
        )}

        {best > 0 && !m.archived && (
          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-medium bg-zinc-950/80 backdrop-blur text-amber-400 border border-amber-500/30">
            MAX {formatEURCompact(best)}
          </div>
        )}
      </div>
      <div className="p-3">
        <div style={{ color, fontFamily:'JetBrains Mono, monospace' }} className="text-[10px] uppercase tracking-wider truncate">{m.provider}</div>
        <div className="font-medium text-sm leading-tight mt-1 truncate">{m.nom}</div>
        {(m.tags || []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {m.tags.slice(0, 2).map((t) => (
              <span key={t} className="px-1.5 py-0 rounded text-[9px] bg-sky-500/10 text-sky-400 border border-sky-500/20">{t}</span>
            ))}
            {m.tags.length > 2 && <span className="text-[9px] text-zinc-500">+{m.tags.length - 2}</span>}
          </div>
        )}
        <div className="flex items-baseline justify-between mt-2 gap-2">
          <span className="text-[10px] text-zinc-500 shrink-0">{m.tentatives || 0} tent.</span>
          <span style={{fontFamily:'JetBrains Mono, monospace', filter: streamerMode ? 'blur(8px)' : 'none'}} className="text-sm text-emerald-400 truncate">{formatEURCompact(Math.max(0, m.totalGain))}</span>
        </div>
      </div>
    </div>
  );
}

/* ===== STAT CARD ===== */
function StatCard({ label, value, sub, trend, sensitive, accent, streamerMode }) {
  const accentCls = { gold:'text-amber-400', sage:'text-emerald-400', rust:'text-rose-400', mist:'text-sky-400' }[accent] || 'text-zinc-100';
  const Trend = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendColor = trend > 0 ? 'text-emerald-400' : trend < 0 ? 'text-rose-400' : 'text-zinc-500';
  return (
    <div className="bg-zinc-900/80 backdrop-blur-xl border border-white/5 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
        {trend !== undefined && trend !== 0 && <div className={`flex items-center gap-0.5 text-[10px] ${trendColor}`}><Trend size={10} /></div>}
      </div>
      <div style={{fontFamily:'Instrument Serif, serif', filter:(sensitive && streamerMode) ? 'blur(8px)' : 'none'}} className={`text-3xl leading-none ${accentCls}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-2">{sub}</div>}
    </div>
  );
}

/* ===== HEATMAP ===== */
function Heatmap({ hunts, date, onChangeMonth, onDayClick }) {
  const year = date.getFullYear(), month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dStr = new Date(year, month, d).toLocaleDateString('fr-FR');
    const dayHunts = hunts.filter((h) => h.date.split(' ')[0] === dStr);
    const net = dayHunts.reduce((a, b) => a + (b.net || 0), 0);
    cells.push({ d, dStr, dayHunts, net });
  }
  const cellStyle = (c) => {
    if (!c || c.dayHunts.length === 0) return 'bg-white/[0.03] border border-white/[0.04]';
    if (c.net >= 200) return 'bg-emerald-500 border border-emerald-500/40';
    if (c.net > 0) return 'bg-emerald-500/50 border border-emerald-500/30';
    if (c.net > -100) return 'bg-rose-500/50 border border-rose-500/30';
    return 'bg-rose-500 border border-rose-500/40';
  };
  return (
    <div className="bg-zinc-900/80 backdrop-blur-xl border border-white/5 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500">Activité mensuelle</div>
          <div style={{fontFamily:'Instrument Serif, serif'}} className="text-xl mt-1 capitalize">{new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(date)}</div>
        </div>
        <div className="flex gap-1">
          <button onClick={() => onChangeMonth(-1)} className="grid h-8 w-8 place-items-center rounded-md bg-zinc-800 text-zinc-400 hover:bg-zinc-700"><ChevronLeft size={14} /></button>
          <button onClick={() => onChangeMonth(1)} className="grid h-8 w-8 place-items-center rounded-md bg-zinc-800 text-zinc-400 hover:bg-zinc-700"><ChevronRight size={14} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {['L','M','M','J','V','S','D'].map((l, i) => <div key={i} style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] text-center text-zinc-600 mb-1">{l}</div>)}
        {cells.map((c, i) => c ? (
          <button key={i} onClick={() => c.dayHunts.length > 0 && onDayClick(c.dayHunts)} title={`${c.dStr}: ${c.net.toFixed(0)}€`} className={`aspect-square rounded-md transition hover:scale-110 ${cellStyle(c)}`}>
            <span style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] text-zinc-300">{c.d}</span>
          </button>
        ) : <div key={i} />)}
      </div>
    </div>
  );
}

function AddMachineModal({ onClose, onAdd }) {
  const [nom, setNom] = useState('');
  const [provider, setProvider] = useState(PROVIDER_LIST[0]);
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState('');
  const fileRef = useRef(null);
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Image trop lourde (max 2 Mo)'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => { setImageFile(ev.target.result); setImageUrl(''); };
    reader.readAsDataURL(file);
  };
  const preview = imageFile || imageUrl;
  const submit = () => { if (onAdd(nom, provider, imageFile || imageUrl)) onClose(); };
  return (
    <Modal onClose={onClose} title="Nouveau slot" subtitle="Ajoute une machine a ta collection">
      <div className="space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 space-y-3">
            <div>
              <label style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-1.5">Nom</label>
              <input value={nom} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="Ex : Sweet Bonanza" autoFocus className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-amber-500/40" />
            </div>
            <div>
              <label style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-1.5">Provider</label>
              <select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none cursor-pointer">
                {PROVIDER_LIST.map((p) => <option key={p} value={p} className="bg-zinc-900">{p}</option>)}
              </select>
            </div>
          </div>
          <div className="w-28 shrink-0">
            <label style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-1.5">Apercu</label>
            <div className="aspect-square rounded-xl bg-zinc-950 border border-white/10 overflow-hidden grid place-items-center">
              {preview ? <img src={preview} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={20} className="text-zinc-600" />}
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <label style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 block">Image</label>
          <input value={imageUrl} onChange={(e) => { setImageUrl(e.target.value); setImageFile(''); }} placeholder="URL de l'image" className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500/40" />
          <div className="flex items-center gap-3 my-1">
            <div className="flex-1 h-px bg-white/10" /><span className="text-[10px] uppercase tracking-widest text-zinc-500">ou</span><div className="flex-1 h-px bg-white/10" />
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
          <button onClick={() => fileRef.current?.click()} className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/10 text-zinc-100 hover:bg-zinc-700 text-sm font-medium flex items-center justify-center gap-2">
            <Upload size={14} /> {imageFile ? 'Image chargee !' : "Charger depuis l'appareil"}
          </button>
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 px-3 py-2 rounded-lg bg-zinc-800 border border-white/10 text-zinc-100 hover:bg-zinc-700 text-sm font-medium">Annuler</button>
          <button onClick={submit} className="flex-1 px-3 py-2 rounded-lg bg-amber-400 text-zinc-950 hover:bg-amber-300 text-sm font-semibold">Enregistrer</button>
        </div>
      </div>
    </Modal>
  );
}

/* ===== MACHINE DETAIL ===== */
function MachineDetailModal({ machine, allTags, onClose, onUpdate, onDelete, onDeleteGain, onArchive, streamerMode }) {
  const [nom, setNom] = useState(machine?.nom || '');
  const [provider, setProvider] = useState(machine?.provider || '');
  const [image, setImage] = useState(machine?.image || '');
  const [tents, setTents] = useState(machine?.tentatives || 0);
  const [notes, setNotes] = useState(machine?.notes || '');
  const [tags, setTags] = useState(machine?.tags || []);
  const [newTag, setNewTag] = useState('');
  if (!machine) return null;
  const color = getProviderColor(machine.provider);
  const prediction = predictNextBonus(machine);
  const saveAll = () => onUpdate({ nom, provider, image, tentatives: parseInt(tents) || 0, notes, tags });
  const addTag = (t) => {
    const v = t.trim().toLowerCase();
    if (!v || tags.includes(v)) return;
    const newTags = [...tags, v];
    setTags(newTags);
    setNewTag('');
    onUpdate({ tags: newTags });
  };
  const removeTag = (t) => {
    const newTags = tags.filter((x) => x !== t);
    setTags(newTags);
    onUpdate({ tags: newTags });
  };
  return (
    <Modal onClose={onClose} title={machine.nom} subtitle={machine.provider}>
      <div className="space-y-5">
        <div className="bg-zinc-950/50 border border-white/5 rounded-2xl p-4 flex gap-4 items-center">
          <div className="h-20 w-20 rounded-xl overflow-hidden bg-zinc-950 shrink-0">
            {image ? <img src={image} alt="" className="w-full h-full object-cover" /> : <div style={{color, fontFamily:'Instrument Serif, serif'}} className="grid place-items-center h-full text-3xl">{machine.nom.charAt(0)}</div>}
          </div>
          <div className="flex-1 min-w-0">
            <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500">Gains cumulés</div>
            <div style={{fontFamily:'Instrument Serif, serif', filter: streamerMode ? 'blur(8px)' : 'none'}} className="text-3xl text-emerald-400 mt-1">{formatEUR(Math.max(0, machine.totalGain || 0))}</div>
            <div className="flex gap-3 mt-2 text-xs text-zinc-500">
              <span>🎁 {machine.bonusCount || 0} bonus</span>
              <span>🎮 {machine.playCount || 0} parties</span>
            </div>
          </div>
        </div>

        {prediction && prediction.avg > 0 && (
          <div className="bg-sky-500/5 border border-sky-500/20 rounded-xl p-3 flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-sky-500/15 text-sky-400"><Zap size={14} /></div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-sky-400">Prédiction prochain bonus</div>
              <div className="text-[10px] text-zinc-400 mt-0.5">Moyenne historique : ~{prediction.avg} tent. · Reste env. {prediction.remaining}</div>
            </div>
          </div>
        )}

        {/* Tags */}
        <div>
          <label style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-1.5 flex items-center gap-1"><Tag size={10} /> Tags</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/30 text-xs">
                {t}
                <button onClick={() => removeTag(t)} className="hover:text-rose-400"><X size={10} /></button>
              </span>
            ))}
          </div>
          <div className="relative">
            <input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag(newTag)} placeholder="Ajouter un tag…" className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-amber-500/40" />
            {allTags.length > 0 && newTag && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-white/10 rounded-lg shadow-2xl max-h-32 overflow-y-auto z-10">
                {allTags.filter((t) => t.includes(newTag.toLowerCase()) && !tags.includes(t)).slice(0, 5).map((t) => (
                  <button key={t} onClick={() => addTag(t)} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800">{t}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-1.5 flex items-center gap-1"><FileText size={10} /> Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveAll} placeholder="Vos remarques sur cette machine…" rows={3} className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500/40 resize-none" />
        </div>

        <div className="space-y-3">
          <div>
            <label style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-1.5">Nom</label>
            <input value={nom} onChange={(e) => setNom(e.target.value)} onBlur={saveAll} className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500/40" />
          </div>
          <div>
            <label style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-1.5">URL Image</label>
            <input value={image} onChange={(e) => setImage(e.target.value)} onBlur={saveAll} placeholder="https://..." className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500/40" />
          </div>
          <div className="flex items-center gap-2 bg-zinc-950/50 border border-white/5 rounded-lg p-3">
            <span className="text-xs text-zinc-400 flex-1">Tentatives</span>
            <select value={tents} onChange={(e) => setTents(e.target.value)} className="bg-zinc-950 border border-white/10 rounded-lg py-1 px-2 text-sm w-20 cursor-pointer">
              {Array.from({length:21},(_,i)=><option key={i} value={i} className="bg-zinc-900">{i}</option>)}
            </select>
            <button onClick={saveAll} className="px-3 py-1.5 rounded-lg bg-amber-400 text-zinc-950 hover:bg-amber-300 text-xs font-semibold">Valider</button>
          </div>
        </div>

        {(machine.history || []).length > 0 && (
          <div>
            <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Historique ({machine.history.length})</div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {machine.history.map((h, idx) => {
                const mult = h.gain / (h.bet || 1);
                const tagCls = mult >= 100 ? 'bg-emerald-500/15 text-emerald-400' : mult < 50 ? 'bg-rose-500/15 text-rose-400' : 'bg-zinc-800 text-zinc-400';
                return (
                  <div key={idx} className="px-3 py-2 rounded-lg bg-zinc-950/50 hover:bg-zinc-800 group">
                    <div className="flex items-center gap-2">
                      <span style={{fontFamily:'JetBrains Mono, monospace'}} className="text-xs text-zinc-500">{h.date}</span>
                      <span className="text-xs text-zinc-600 flex-1">{h.bet}€</span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] ${tagCls}`}>{mult.toFixed(1)}x</span>
                      <span style={{fontFamily:'JetBrains Mono, monospace', filter: streamerMode ? 'blur(8px)' : 'none'}} className="text-sm text-emerald-400">+{h.gain.toFixed(2)}€</span>
                      <button onClick={() => onDeleteGain(idx)} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400"><Trash2 size={12} /></button>
                    </div>
                    {(h.casino || h.note) && (
                      <div className="flex gap-2 mt-1 text-[10px] text-zinc-500">
                        {h.casino && <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400">🎰 {h.casino}</span>}
                        {h.note && <span className="italic truncate">"{h.note}"</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 px-3 py-2 rounded-lg bg-zinc-800 border border-white/10 text-zinc-100 hover:bg-zinc-700 text-sm font-medium">Fermer</button>
          <button onClick={onArchive} className="px-3 py-2 rounded-lg bg-zinc-800 border border-white/10 text-zinc-100 hover:bg-zinc-700 text-sm font-medium flex items-center gap-1" title={machine.archived ? 'Désarchiver' : 'Archiver'}>
            {machine.archived ? <Unlock size={14} /> : <Archive size={14} />}
          </button>
          <button onClick={onDelete} className="flex-1 px-3 py-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500 hover:text-white text-sm font-medium flex items-center justify-center gap-1"><Trash2 size={14} /> Supprimer</button>
        </div>
      </div>
    </Modal>
  );
}

/* ===== ADD TO HUNT ===== */
function AddToHuntModal({ machines, excludeIds, onClose, onSelect }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const query = q.toLowerCase();
    return machines.filter((m) => !excludeIds.has(m.id))
      .filter((m) => m.nom.toLowerCase().includes(query) || m.provider.toLowerCase().includes(query))
      .slice(0, 50);
  }, [q, machines, excludeIds]);
  return (
    <Modal onClose={onClose} title="Ajouter au hunt">
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher..." className="w-full bg-zinc-950 border border-white/10 rounded-lg pl-10 pr-3 py-2.5 text-sm outline-none focus:border-amber-500/40" />
        </div>
        <div className="max-h-96 overflow-y-auto -mx-2 space-y-0.5">
          {filtered.map((m) => {
            const color = getProviderColor(m.provider);
            return (
              <button key={m.id} onClick={() => onSelect(m.id)} className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-zinc-800 text-left">
                {m.image ? <img src={m.image} alt="" className="h-9 w-9 rounded-md object-cover" /> : <div style={{color, fontFamily:'Instrument Serif, serif'}} className="h-9 w-9 rounded-md bg-zinc-800 grid place-items-center">{m.nom.charAt(0)}</div>}
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{m.nom}</div>
                  <div style={{color, fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase mt-0.5">{m.provider}</div>
                </div>
                <span style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] text-zinc-600">{m.tentatives}t</span>
              </button>
            );
          })}
          {filtered.length === 0 && <div className="text-center py-8 text-sm text-zinc-500">Aucun résultat.</div>}
        </div>
      </div>
    </Modal>
  );
}

/* ===== HUNT PANEL ===== */
function HuntItem({ item, machine, onUpdate, onRemove, locked, onDragStart, onDragOver, onDrop, dragging }) {
  const m = machine;
  const color = getProviderColor(m?.provider || '');
  const t = m?.tentatives || 0;
  const recSpins = t <= 2 ? 100 : t <= 4 ? 75 : 50;
  return (
    <div draggable={!locked} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
      className={`group bg-zinc-900/80 backdrop-blur-xl border rounded-xl p-3 transition ${item.selected ? 'ring-2 ring-rose-500/50 border-rose-500/30' : 'border-white/5'} ${dragging ? 'opacity-40' : ''} ${!locked ? 'cursor-grab active:cursor-grabbing' : ''}`}>
      <div className="flex items-center gap-3">
        <input type="checkbox" checked={!!item.selected} onChange={(e) => onUpdate({ selected: e.target.checked })} className="accent-rose-500" />
        {m?.image ? <img src={m.image} alt="" className="h-12 w-12 rounded-lg object-cover pointer-events-none" /> : <div style={{fontFamily:'Instrument Serif, serif'}} className="h-12 w-12 rounded-lg bg-zinc-800 grid place-items-center text-zinc-600 text-xl">{m?.nom?.charAt(0) || '?'}</div>}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{m?.nom}</div>
          <div style={{color, fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-wide mt-0.5">{m?.provider}</div>
          <div className="text-[10px] text-zinc-500 mt-0.5 flex gap-3"><span>{t} tent.</span><span>{recSpins} spins rec.</span></div>
        </div>
        <button onClick={onRemove} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 p-1"><X size={14} /></button>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2 mt-3">
        <div className="flex items-center gap-2">
          <span style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-wider text-zinc-500">Mise{locked && <Lock size={9} className="inline ml-1 text-amber-400" />}</span>
          <div className="relative flex-1">
            <input type="number" step="0.1" value={item.bet || ''} onChange={(e) => onUpdate({ bet: parseFloat(e.target.value) || 0 })} disabled={locked} className="w-full bg-zinc-950 border border-white/10 rounded-lg py-1 px-2 text-sm text-right pr-6 outline-none focus:border-amber-500/40 disabled:opacity-50" placeholder="0" />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">€</span>
          </div>
        </div>
        <div className="flex bg-zinc-950 rounded-md p-0.5 border border-white/10">
          <button onClick={() => onUpdate({ status: item.status === 'tent' ? 'none' : 'tent' })} className={`px-3 py-1 rounded text-[10px] font-bold ${item.status === 'tent' ? 'bg-sky-500 text-zinc-950' : 'text-zinc-500'}`}>TENT</button>
          <button onClick={() => onUpdate({ status: item.status === 'bonus' ? 'none' : 'bonus' })} className={`px-3 py-1 rounded text-[10px] font-bold ${item.status === 'bonus' ? 'bg-amber-400 text-zinc-950' : 'text-zinc-500'}`}>BONUS</button>
        </div>
      </div>
    </div>
  );
}

function HuntPanel({ hunt, machines, onClose, onUpdateCost, onUpdateItem, onRemoveItem, onAddMachine, onAddRandomIA, onClear, onClearEmpty, onSave, onProcess, onReorder, duration, strictMode, onToggleStrict, practiceMode, onTogglePractice, onShare }) {
  const [draggedId, setDraggedId] = useState(null);
  if (!hunt) return null;
  const bonusOnly = hunt.items.filter((it) => it.status === 'bonus');
  const sumBets = bonusOnly.reduce((a, b) => a + (b.bet || 0), 0);
  const beMult = hunt.cost > 0 && sumBets > 0 ? hunt.cost / sumBets : 0;
  const selectedCount = hunt.items.filter((it) => it.selected).length;
  const handleDragStart = (id) => (e) => { setDraggedId(id); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const handleDrop = (overId) => (e) => { e.preventDefault(); if (draggedId && draggedId !== overId) { onReorder(draggedId, overId); } setDraggedId(null); };
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-2xl bg-zinc-900 border-l border-white/10 flex flex-col shadow-2xl">
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-amber-500/15 text-amber-400"><Target size={18} /></div>
            <div>
              <h2 style={{fontFamily:'Instrument Serif, serif'}} className="text-xl flex items-center gap-2">
                Bonus Hunt
                {practiceMode && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30">À BLANC</span>}
                {strictMode && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30"><Lock size={9} className="inline" /> STRICT</span>}
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2">
                <span>{hunt.items.length} machines · {bonusOnly.length} bonus</span>
                {duration > 0 && <span className="font-mono text-amber-400">· {duration}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onTogglePractice} title="Hunt à blanc" className={`grid h-9 w-9 place-items-center rounded-lg transition ${practiceMode ? 'bg-sky-500/15 text-sky-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'}`}><FileText size={14} /></button>
            <button onClick={onToggleStrict} title="Mode strict (verrouille les mises)" className={`grid h-9 w-9 place-items-center rounded-lg transition ${strictMode ? 'bg-amber-500/15 text-amber-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'}`}>{strictMode ? <Lock size={14} /> : <Unlock size={14} />}</button>
            <button onClick={onShare} title="Partager" className="grid h-9 w-9 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"><Share2 size={14} /></button>
            <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"><X size={18} /></button>
          </div>
        </div>
        <div className="px-6 py-4 border-b border-white/10 grid grid-cols-3 gap-3">
          <div>
            <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Budget</div>
            <div className="flex items-baseline gap-0.5">
              <input type="number" value={hunt.cost || ''} onChange={(e) => onUpdateCost(parseFloat(e.target.value) || 0)} disabled={strictMode && hunt.cost > 0} className="w-full bg-transparent border-b border-white/10 outline-none focus:border-amber-500/50 disabled:opacity-50" style={{fontFamily:'Instrument Serif, serif', fontSize:'1.5rem'}} placeholder="0" />
              <span className="text-zinc-500 text-sm">€</span>
            </div>
          </div>
          <div>
            <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Mises</div>
            <div style={{fontFamily:'Instrument Serif, serif'}} className="text-2xl text-sky-400">{sumBets.toFixed(0)}<span className="text-sm text-zinc-500">€</span></div>
          </div>
          <div>
            <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Mult. BE</div>
            <div style={{fontFamily:'Instrument Serif, serif'}} className="text-2xl text-amber-400">{beMult.toFixed(1)}<span className="text-sm text-zinc-500">x</span></div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {hunt.items.length === 0 ? (
            <div className="text-center py-16 text-zinc-500">
              <Wand2 className="mx-auto mb-3 opacity-40" size={32} />
              <p className="text-sm">Aucune machine</p>
            </div>
          ) : hunt.items.map((it) => (
            <HuntItem key={it.id} item={it} machine={machines.find((m) => m.id === it.machineId)}
              onUpdate={(p) => { if (strictMode && 'bet' in p) return; onUpdateItem(it.id, p); }}
              onRemove={() => onRemoveItem(it.id)} locked={strictMode}
              onDragStart={handleDragStart(it.id)} onDragOver={handleDragOver} onDrop={handleDrop(it.id)}
              dragging={draggedId === it.id} />
          ))}
        </div>
        <div className="px-6 py-4 border-t border-white/10 space-y-2 bg-zinc-900">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button onClick={onAddMachine} className="px-3 py-2 rounded-lg bg-zinc-800 border border-white/10 text-zinc-100 hover:bg-zinc-700 text-sm font-medium flex items-center justify-center gap-1"><Plus size={14} /> Ajouter</button>
            <button onClick={onAddRandomIA} className="px-3 py-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/30 hover:bg-sky-500/20 text-sm font-medium flex items-center justify-center gap-1"><Sparkles size={14} /> IA</button>
            <button onClick={onClearEmpty} className="px-3 py-2 rounded-lg bg-zinc-800 border border-white/10 text-zinc-100 hover:bg-zinc-700 text-sm font-medium flex items-center justify-center gap-1"><Wand2 size={14} /> Nettoyer</button>
            <button onClick={onClear} className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1 ${selectedCount > 0 ? 'bg-rose-500 text-white' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500 hover:text-white'}`}><Trash2 size={14} /> Vider{selectedCount > 0 && ` (${selectedCount})`}</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onSave} className="px-3 py-2 rounded-lg bg-zinc-800 border border-white/10 text-zinc-100 hover:bg-zinc-700 text-sm font-medium flex items-center justify-center gap-1"><Save size={14} /> Sauvegarder</button>
            <button onClick={onProcess} className="px-3 py-2 rounded-lg bg-emerald-500 text-zinc-950 hover:bg-emerald-400 text-sm font-semibold flex items-center justify-center gap-1">Ouverture <ChevronRight size={14} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== BONUS OPENER ===== */
function BonusOpener({ data, totalCount, currentIdx, gainValue, onGainChange, casinoValue, onCasinoChange, noteValue, onNoteChange, onPrev, onNext }) {
  const inputRef = useRef(null);
  const [showExtras, setShowExtras] = useState(false);
  useEffect(() => { inputRef.current?.focus(); setShowExtras(false); }, [currentIdx]);
  if (!data) return null;
  const { it, m, avgMult, liveMult, cost, currentTotal, need, reqMult, remainingCount } = data;
  const isBigWin = liveMult >= 100;
  const isMonster = liveMult >= 500;
  const progress = ((currentIdx + 1) / totalCount) * 100;
  return (
    <div className="fixed inset-0 z-[1500] bg-black/95 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <span style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500">Bonus {currentIdx + 1} sur {totalCount}</span>
          <span style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500">{Math.round(progress)}%</span>
        </div>
        <div className="h-0.5 bg-zinc-800 rounded-full overflow-hidden mb-6">
          <div className="h-full transition-all duration-500" style={{ width: `${progress}%`, background:'linear-gradient(to right,#d4af37,#e8c560)' }} />
        </div>
        <div className={`relative bg-zinc-900 border border-white/10 shadow-2xl rounded-3xl p-6 ${isMonster ? 'ring-2 ring-amber-400 animate-pulse' : ''}`}>
          <div className="relative h-32 mb-4 rounded-2xl overflow-hidden bg-zinc-950">
            {m?.image ? (
              <>
                <div className="absolute inset-0 bg-cover bg-center blur-3xl scale-125 opacity-60" style={{ backgroundImage: `url(${m.image})` }} />
                <img src={m.image} alt="" className="relative w-full h-full object-contain" />
              </>
            ) : <div style={{fontFamily:'Instrument Serif, serif'}} className="grid place-items-center h-full text-5xl text-zinc-600">{m?.nom?.charAt(0) || '?'}</div>}
          </div>
          <h1 style={{fontFamily:'Instrument Serif, serif'}} className="text-3xl text-center text-zinc-100">{m?.nom}</h1>
          <p className="text-center text-sm text-zinc-500 mt-1">Mise : <span style={{fontFamily:'JetBrains Mono, monospace'}} className="text-sky-400">{it.bet}€</span></p>
          <div className="mt-6">
            <label style={{fontFamily:'JetBrains Mono, monospace'}} className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-2 text-center">Gain obtenu</label>
            <div className="relative">
              <input ref={inputRef} type="number" step="0.01" value={gainValue} onChange={(e) => onGainChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onNext()} placeholder="0.00" style={{fontFamily:'Instrument Serif, serif'}} className={`w-full bg-zinc-950 border-2 rounded-2xl text-4xl text-center py-4 outline-none transition ${isMonster ? 'border-amber-400' : isBigWin ? 'border-amber-300' : 'border-white/10 focus:border-amber-400'}`} />
              <span className="absolute right-5 top-1/2 -translate-y-1/2 text-2xl text-zinc-500">€</span>
            </div>
            {liveMult > 0 && <div style={{fontFamily:'Instrument Serif, serif'}} className={`text-center text-3xl mt-3 ${isMonster ? 'text-amber-400 animate-bounce' : isBigWin ? 'text-amber-300' : 'text-zinc-200'}`}>{liveMult.toFixed(2)}<span className="text-lg text-zinc-500">x</span>{isMonster && <span className="ml-2">🔥</span>}</div>}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="bg-zinc-950 rounded-lg px-3 py-2">
              <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-wider text-zinc-500">Mult. moy.</div>
              <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-lg">{avgMult.toFixed(2)}x</div>
            </div>
            <div className="bg-zinc-950 rounded-lg px-3 py-2">
              <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-wider text-zinc-500">Total</div>
              <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-lg text-emerald-400">{formatEUR(currentTotal)}</div>
            </div>
          </div>
          <div className="mt-3 text-center text-xs">
            {currentTotal >= cost ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"><Check size={10} /> Hunt remboursé</span> : remainingCount > 0 && reqMult > 0 ? <span className="text-sky-400">Cible : <b>{reqMult.toFixed(2)}x</b> pour BE</span> : <span className="text-rose-400">Manque {formatEUR(need)}</span>}
          </div>

          <button onClick={() => setShowExtras((v) => !v)} className="w-full mt-3 text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center justify-center gap-1">
            {showExtras ? '− Cacher' : '+ Casino / Notes'}
          </button>
          {showExtras && (
            <div className="mt-2 space-y-2">
              <input value={casinoValue} onChange={(e) => onCasinoChange(e.target.value)} placeholder="Casino (Stake, Roobet…)" className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-amber-500/40" />
              <input value={noteValue} onChange={(e) => onNoteChange(e.target.value)} placeholder="Note (free spin retrigger…)" className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-amber-500/40" />
            </div>
          )}

          <div className="flex gap-2 mt-6">
            {currentIdx > 0 && <button onClick={onPrev} className="flex-1 px-3 py-2 rounded-lg bg-zinc-800 border border-white/10 text-zinc-100 hover:bg-zinc-700 text-sm font-medium flex items-center justify-center gap-1"><ChevronLeft size={16} /> Retour</button>}
            <button onClick={onNext} className="flex-[2] px-3 py-3 rounded-lg bg-amber-400 text-zinc-950 hover:bg-amber-300 text-base font-semibold flex items-center justify-center gap-1">Valider <ChevronRight size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== SUMMARY ===== */
function SummaryModal({ summary, machines, onClose, streamerMode }) {
  const isDaily = Array.isArray(summary.hunts);
  let items = [], totalNet = 0;
  if (isDaily) {
    summary.hunts.forEach((h) => {
      totalNet += h.net || 0;
      h.items.filter((it) => it.status === 'bonus').forEach((it) => items.push(it));
    });
  } else {
    items = summary.hunt.items.filter((it) => it.status === 'bonus');
    totalNet = summary.hunt.net;
  }
  const totalCost = isDaily ? summary.hunts.reduce((a,h)=>a+(h.cost||0),0) : summary.hunt.cost;
  const totalGain = items.reduce((a, b) => a + (b.finalGain || 0), 0);
  return (
    <Modal onClose={onClose} title={summary.title} size="lg">
      <div className="space-y-4">
        <div className={`rounded-2xl p-6 text-center border ${totalNet >= 0 ? 'bg-gradient-to-br from-emerald-500/15 to-emerald-500/[0.02] border-emerald-500/20' : 'bg-gradient-to-br from-rose-500/15 to-rose-500/[0.02] border-rose-500/20'}`}>
          <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Résultat net</div>
          <div style={{fontFamily:'Instrument Serif, serif', filter: streamerMode ? 'blur(8px)' : 'none'}} className={`text-5xl ${totalNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{totalNet >= 0 ? '+' : ''}{formatEUR(totalNet)}</div>
          <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-xs text-zinc-500 mt-2">{formatEUR(totalGain)} · {formatEUR(totalCost)} coût</div>
        </div>
        <div className="max-h-80 overflow-y-auto space-y-1">
          {items.length === 0 && <div className="text-center py-8 text-sm text-zinc-500">Aucun bonus.</div>}
          {items.map((it, idx) => {
            const m = machines.find((x) => x.id === it.machineId);
            const mult = (it.finalGain || 0) / (it.bet || 1);
            const tagCls = mult >= 100 ? 'bg-emerald-500/15 text-emerald-400' : mult < 50 ? 'bg-rose-500/15 text-rose-400' : 'bg-zinc-800 text-zinc-400';
            return (
              <div key={idx} className="flex items-center gap-3 px-3 py-2.5 bg-zinc-900/80 border border-white/5 rounded-lg">
                {m?.image ? <img src={m.image} alt="" className="h-10 w-10 rounded-md object-cover" /> : <div className="h-10 w-10 rounded-md bg-zinc-800" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{m?.nom || '?'}</div>
                  <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] text-zinc-500 mt-0.5">{it.bet}€</div>
                </div>
                <span className={`px-2 py-0.5 rounded-md text-[10px] ${tagCls}`}>{mult.toFixed(1)}x</span>
                <div style={{fontFamily:'JetBrains Mono, monospace', filter: streamerMode ? 'blur(8px)' : 'none'}} className="text-right text-emerald-400 text-sm min-w-[80px]">{formatEUR(it.finalGain)}</div>
              </div>
            );
          })}
        </div>
        <button onClick={onClose} className="w-full px-3 py-2 rounded-lg bg-amber-400 text-zinc-950 hover:bg-amber-300 text-sm font-semibold">Terminer</button>
      </div>
    </Modal>
  );
}

/* ===== SETTINGS ===== */
function SettingsModal({ providerBetScales, onSaveBets, theme, onSetTheme, accentColor, onSetAccent, onExport, onImport, onClose }) {
  const [bets, setBets] = useState(providerBetScales);
  const [tab, setTab] = useState('appearance');
  const fileRef = useRef(null);
  const updateBet = (group, idx, val) => {
    const v = parseFloat(val) || 0;
    setBets((prev) => {
      const next = { ...prev };
      const arr = [...(next[group] || Array(10).fill(0))];
      arr[idx] = v;
      next[group] = arr;
      const grp = PROVIDER_GROUPS.find((g) => g.key === group);
      if (grp) grp.members.forEach((m) => { next[m] = arr; });
      return next;
    });
  };
  const accents = [
    { id:'amber', label:'Or', color:'#d4af37' },
    { id:'emerald', label:'Émeraude', color:'#7da66f' },
    { id:'sky', label:'Ciel', color:'#6c8ea8' },
    { id:'rose', label:'Rose', color:'#c3654f' },
    { id:'violet', label:'Violet', color:'#9e7bb5' },
  ];
  return (
    <Modal onClose={onClose} title="Paramètres" size="lg">
      <div className="flex gap-1 mb-5 border-b border-white/10 -mt-2">
        {[['appearance','Apparence'],['bets','Mises'],['backup','Sauvegarde']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm border-b-2 transition ${tab === k ? 'border-amber-400 text-zinc-100' : 'border-transparent text-zinc-500'}`}>{l}</button>
        ))}
      </div>

      {tab === 'appearance' && (
        <div className="space-y-5">
          <div>
            <label style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-2">Thème</label>
            <div className="grid grid-cols-2 gap-2">
              {[['dark','Sombre'],['light','Clair']].map(([k,l]) => (
                <button key={k} onClick={() => onSetTheme(k)} className={`px-4 py-3 rounded-lg border transition ${theme === k ? 'bg-amber-500/15 border-amber-500/40 text-amber-400' : 'bg-zinc-950 border-white/10 text-zinc-300 hover:border-white/20'}`}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-2">Couleur d'accent</label>
            <div className="grid grid-cols-5 gap-2">
              {accents.map((a) => (
                <button key={a.id} onClick={() => onSetAccent(a.id)} className={`relative px-2 py-3 rounded-lg border transition ${accentColor === a.id ? 'border-white/30' : 'border-white/5'}`} style={{background: a.color + '20'}}>
                  <div className="w-6 h-6 rounded-full mx-auto" style={{background: a.color}} />
                  <div className="text-[10px] mt-1 text-zinc-400">{a.label}</div>
                  {accentColor === a.id && <Check size={10} className="absolute top-1 right-1 text-white" />}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-zinc-500 mt-2">La couleur d'accent affecte les boutons principaux et indicateurs.</p>
          </div>
        </div>
      )}

      {tab === 'bets' && (
        <div className="space-y-4">
          <p className="text-xs text-zinc-400">Configurez les 10 paliers de mises utilisés par l'IA pour suggérer une mise.</p>
          {PROVIDER_GROUPS.map((g) => (
            <div key={g.key}>
              <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-xs uppercase tracking-wide text-sky-400 border-l-2 border-amber-400 pl-2 mb-2">{g.name}</div>
              <div className="grid grid-cols-5 gap-1.5">
                {Array.from({length:10},(_,i)=>(
                  <input key={i} type="number" step="0.01" value={bets[g.key]?.[i] ?? 0} onChange={(e) => updateBet(g.key, i, e.target.value)} className="bg-zinc-950 border border-white/10 rounded-lg text-xs text-center py-1.5 outline-none focus:border-amber-500/40" />
                ))}
              </div>
            </div>
          ))}
          <button onClick={() => { onSaveBets(bets); onClose(); }} className="w-full px-3 py-2 rounded-lg bg-amber-400 text-zinc-950 hover:bg-amber-300 text-sm font-semibold mt-4">Enregistrer</button>
        </div>
      )}

      {tab === 'backup' && (
        <div className="space-y-4">
          <p className="text-xs text-zinc-400">Exportez ou restaurez l'intégralité de vos données.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <button onClick={onExport} className="bg-zinc-900/80 border border-white/5 rounded-xl p-5 text-left hover:border-white/15 transition">
              <Download className="mb-3 text-amber-400" size={24} />
              <div className="font-medium mb-1">Exporter (.json)</div>
              <div className="text-xs text-zinc-500">Téléchargez un fichier de sauvegarde.</div>
            </button>
            <button onClick={() => fileRef.current?.click()} className="bg-zinc-900/80 border border-white/5 rounded-xl p-5 text-left hover:border-white/15 transition">
              <Upload className="mb-3 text-sky-400" size={24} />
              <div className="font-medium mb-1">Importer (.json)</div>
              <div className="text-xs text-zinc-500">Restaurez depuis un fichier.</div>
            </button>
          </div>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={onImport} />
        </div>
      )}
    </Modal>
  );
}

/* ===== COMMAND PALETTE (Cmd+K) ===== */
function CommandPalette({ open, onClose, machines, hunts, onNavigate, onSelectMachine, onAction }) {
  const [q, setQ] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef(null);
  useEffect(() => { if (open) { setQ(''); setSelectedIdx(0); setTimeout(() => inputRef.current?.focus(), 50); } }, [open]);

  const items = useMemo(() => {
    const query = q.toLowerCase().trim();
    const actions = [
      { id:'a1', type:'action', icon:Target, label:'Démarrer un Hunt', action:'startHunt' },
      { id:'a2', type:'action', icon:Brain, label:'Générer Playlist IA', action:'goIa' },
      { id:'a3', type:'action', icon:Plus, label:'Nouvelle Machine', action:'addMachine' },
      { id:'a4', type:'action', icon:BarChart3, label:'Voir les Stats', action:'goStats' },
      { id:'a5', type:'action', icon:Award, label:'Voir les Records', action:'goRecords' },
      { id:'a6', type:'action', icon:Eye, label:'Toggle Mode Streamer', action:'streamer' },
    ];
    const mList = machines.filter((m) => !m.archived).map((m) => ({ id: m.id, type: 'machine', label: m.nom, sub: m.provider, m }));
    const hList = hunts.slice(-10).reverse().map((h) => ({ id: h.id, type: 'hunt', label: `Hunt du ${h.date.split(' ')[0]}`, sub: `${h.net >= 0 ? '+' : ''}${formatEUR(h.net)}`, h }));
    let all = [...actions, ...mList, ...hList];
    if (query) all = all.filter((it) => (it.label + ' ' + (it.sub || '')).toLowerCase().includes(query));
    return all.slice(0, 12);
  }, [q, machines, hunts]);

  useEffect(() => {
    if (!open) return;
    const k = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(items.length - 1, i + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => Math.max(0, i - 1)); }
      else if (e.key === 'Enter') { e.preventDefault(); handleSelect(items[selectedIdx]); }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, items, selectedIdx, onClose]);

  const handleSelect = (it) => {
    if (!it) return;
    if (it.type === 'machine') onSelectMachine(it.m);
    else if (it.type === 'hunt') onNavigate('history');
    else if (it.type === 'action') onAction(it.action);
    onClose();
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[2000] flex items-start justify-center pt-20 px-4 bg-black/70 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-xl bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <Search size={18} className="text-zinc-500" />
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setSelectedIdx(0); }} placeholder="Rechercher une machine, un hunt, ou une action…" className="flex-1 bg-transparent text-zinc-100 outline-none text-sm" />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">ESC</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {items.length === 0 && <div className="text-center py-8 text-sm text-zinc-500">Aucun résultat.</div>}
          {items.map((it, i) => {
            const Icon = it.icon || (it.type === 'machine' ? LayoutGrid : it.type === 'hunt' ? Target : Sparkles);
            return (
              <button key={it.id} onClick={() => handleSelect(it)} onMouseEnter={() => setSelectedIdx(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition ${i === selectedIdx ? 'bg-zinc-800' : ''}`}>
                <Icon size={16} className={i === selectedIdx ? 'text-amber-400' : 'text-zinc-500'} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{it.label}</div>
                  {it.sub && <div className="text-[10px] text-zinc-500 truncate">{it.sub}</div>}
                </div>
                {it.type === 'machine' && <span className="text-[10px] text-zinc-600 font-mono">{it.m.tentatives}t</span>}
                <span className="text-[10px] text-zinc-600 uppercase">{it.type === 'action' ? 'Action' : it.type === 'machine' ? 'Slot' : 'Hunt'}</span>
              </button>
            );
          })}
        </div>
        <div className="px-4 py-2 border-t border-white/10 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
          <span>↑↓ Naviguer · ↵ Sélectionner</span>
          <span>Cmd+K</span>
        </div>
      </div>
    </div>
  );
}

/* ===== RECORDS PAGE ===== */
function RecordsPage({ machines, hunts, streamerMode }) {
  const records = useMemo(() => computeRecords(machines, hunts), [machines, hunts]);
  const streaks = useMemo(() => computeStreaks(hunts), [hunts]);
  return (
    <div className="space-y-5">
      <div>
        <h1 style={{fontFamily:'Instrument Serif, serif'}} className="text-3xl flex items-center gap-3"><Award className="text-amber-400" /> Records</h1>
        <p className="text-sm text-zinc-500 mt-1">Vos meilleures performances</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-amber-500/15 to-amber-500/[0.02] border border-amber-500/30 rounded-2xl p-5">
          <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-amber-400 flex items-center gap-2"><Flame size={12} /> Plus gros mult.</div>
          <div style={{fontFamily:'Instrument Serif, serif'}} className="text-4xl mt-2 text-amber-400">{records.biggestMult.value.toFixed(0)}<span className="text-xl">x</span></div>
          <div className="text-xs text-zinc-400 mt-2">{records.biggestMult.machine || '—'}</div>
          {records.biggestMult.value > 0 && <div style={{fontFamily:'JetBrains Mono, monospace', filter: streamerMode ? 'blur(8px)' : 'none'}} className="text-[10px] text-zinc-500 mt-1">{formatEUR(records.biggestMult.bet)} → {formatEUR(records.biggestMult.gain)}</div>}
        </div>
        <div className="bg-gradient-to-br from-emerald-500/15 to-emerald-500/[0.02] border border-emerald-500/30 rounded-2xl p-5">
          <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-emerald-400 flex items-center gap-2"><Trophy size={12} /> Plus gros gain</div>
          <div style={{fontFamily:'Instrument Serif, serif', filter: streamerMode ? 'blur(8px)' : 'none'}} className="text-4xl mt-2 text-emerald-400">{formatEUR(records.biggestGain.value)}</div>
          <div className="text-xs text-zinc-400 mt-2">{records.biggestGain.machine || '—'}</div>
        </div>
        <div className="bg-gradient-to-br from-sky-500/15 to-sky-500/[0.02] border border-sky-500/30 rounded-2xl p-5">
          <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-sky-400 flex items-center gap-2"><Target size={12} /> Plus gros hunt net</div>
          <div style={{fontFamily:'Instrument Serif, serif', filter: streamerMode ? 'blur(8px)' : 'none'}} className="text-4xl mt-2 text-sky-400">{formatEUR(records.biggestHunt.value)}</div>
          <div className="text-xs text-zinc-400 mt-2">{records.biggestHunt.date || '—'}</div>
        </div>
        <div className="bg-gradient-to-br from-rose-500/15 to-rose-500/[0.02] border border-rose-500/30 rounded-2xl p-5">
          <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-rose-400 flex items-center gap-2"><Clock size={12} /> Plus long dry spell</div>
          <div style={{fontFamily:'Instrument Serif, serif'}} className="text-4xl mt-2 text-rose-400">{records.longestDrySpell.value}</div>
          <div className="text-xs text-zinc-400 mt-2">tentatives sans bonus · {records.longestDrySpell.machine || '—'}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-zinc-900/80 border border-white/5 rounded-2xl p-5">
          <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500">Série actuelle</div>
          <div style={{fontFamily:'Instrument Serif, serif'}} className={`text-3xl mt-2 ${streaks.currentType === 'win' ? 'text-emerald-400' : streaks.currentType === 'loss' ? 'text-rose-400' : 'text-zinc-400'}`}>
            {streaks.current} <span className="text-sm">{streaks.currentType === 'win' ? '🔥' : streaks.currentType === 'loss' ? '❄️' : ''}</span>
          </div>
          <div className="text-xs text-zinc-500 mt-1">{streaks.currentType === 'win' ? 'hunts gagnants' : streaks.currentType === 'loss' ? 'hunts perdants' : 'aucune série'}</div>
        </div>
        <div className="bg-zinc-900/80 border border-white/5 rounded-2xl p-5">
          <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500">Meilleure série</div>
          <div style={{fontFamily:'Instrument Serif, serif'}} className="text-3xl mt-2 text-emerald-400">{streaks.best}</div>
          <div className="text-xs text-zinc-500 mt-1">hunts gagnants d'affilée</div>
        </div>
        <div className="bg-zinc-900/80 border border-white/5 rounded-2xl p-5">
          <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500">Pire série</div>
          <div style={{fontFamily:'Instrument Serif, serif'}} className="text-3xl mt-2 text-rose-400">{streaks.worstStreak}</div>
          <div className="text-xs text-zinc-500 mt-1">hunts perdants d'affilée</div>
        </div>
      </div>
    </div>
  );
}

/* ===== STATS PAGE ===== */
function StatsPage({ machines, hunts, config, streamerMode }) {
  const curve = useMemo(() => computeBalanceCurve(hunts, config.startStack || 0), [hunts, config.startStack]);
  const distribution = useMemo(() => computeMultDistribution(machines), [machines]);
  const roi = useMemo(() => computeProviderROI(machines, hunts), [machines, hunts]);
  const hourly = useMemo(() => computeHourlyHeatmap(hunts), [hunts]);
  const totalBonus = machines.reduce((a, m) => a + (m.history?.length || 0), 0);
  const totalTent = machines.reduce((a, m) => a + (m.playCount || 0), 0);
  const hitRate = totalTent > 0 ? (totalBonus / totalTent) * 100 : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{fontFamily:'Instrument Serif, serif'}} className="text-3xl flex items-center gap-3"><BarChart3 className="text-sky-400" /> Statistiques</h1>
        <p className="text-sm text-zinc-500 mt-1">Analyses détaillées de vos sessions</p>
      </div>

      <div className="bg-zinc-900/80 border border-white/5 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500">Évolution du solde</div>
          <div style={{fontFamily:'JetBrains Mono, monospace', filter: streamerMode ? 'blur(8px)' : 'none'}} className="text-sm text-emerald-400">{formatEUR(curve[curve.length - 1]?.balance || 0)}</div>
        </div>
        <LineChartSVG data={curve} color={curve[curve.length - 1]?.balance >= (config.startStack || 0) ? '#7da66f' : '#c3654f'} />
      </div>

      <div className="bg-zinc-900/80 border border-white/5 rounded-2xl p-5">
        <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">Distribution des multiplicateurs</div>
        <BarChartSVG data={distribution} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-zinc-900/80 border border-white/5 rounded-2xl p-5">
          <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500">Taux de bonus</div>
          <div style={{fontFamily:'Instrument Serif, serif'}} className="text-3xl mt-2 text-amber-400">{hitRate.toFixed(2)}%</div>
          <div className="text-xs text-zinc-500 mt-1">{totalBonus} bonus / {totalTent} tent.</div>
        </div>
        <div className="bg-zinc-900/80 border border-white/5 rounded-2xl p-5">
          <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500">Bonus total</div>
          <div style={{fontFamily:'Instrument Serif, serif'}} className="text-3xl mt-2">{totalBonus}</div>
          <div className="text-xs text-zinc-500 mt-1">tous slots confondus</div>
        </div>
        <div className="bg-zinc-900/80 border border-white/5 rounded-2xl p-5">
          <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500">Sessions</div>
          <div style={{fontFamily:'Instrument Serif, serif'}} className="text-3xl mt-2">{hunts.length}</div>
          <div className="text-xs text-zinc-500 mt-1">hunts joués</div>
        </div>
      </div>

      <div className="bg-zinc-900/80 border border-white/5 rounded-2xl p-5">
        <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">Activité par heure</div>
        <HourlyHeatmapSVG data={hourly} />
      </div>

      {roi.length > 0 && (
        <div className="bg-zinc-900/80 border border-white/5 rounded-2xl p-5">
          <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">ROI par Provider</div>
          <div className="space-y-2">
            {roi.map((r) => {
              const cls = r.roi > 0 ? 'text-emerald-400' : r.roi < 0 ? 'text-rose-400' : 'text-zinc-400';
              const color = getProviderColor(r.provider);
              return (
                <div key={r.provider} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                  <div style={{background: color}} className="w-2 h-8 rounded-full" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.provider}</div>
                    <div className="text-[10px] text-zinc-500 font-mono">{r.count} entrées</div>
                  </div>
                  <div style={{filter: streamerMode ? 'blur(8px)' : 'none'}} className="text-right">
                    <div style={{fontFamily:'Instrument Serif, serif'}} className={`text-lg ${cls}`}>{r.roi > 0 ? '+' : ''}{r.roi.toFixed(1)}%</div>
                    <div className="text-[10px] text-zinc-500 font-mono">{formatEUR(r.gain - r.bet)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== SYNC MODAL ===== */
function SyncModal({ syncKey, syncStatus, onEnable, onDisable, onClose, toast }) {
  const [inputKey, setInputKey] = useState('');
  const [mode, setMode] = useState(syncKey ? 'active' : 'choice'); // choice | active | enter

  const copyKey = () => {
    navigator.clipboard.writeText(syncKey);
    toast('Clé copiée', 'success');
  };

  return (
    <Modal onClose={onClose} title="Synchronisation" subtitle="Accède à tes données sur tous tes appareils" size="md">
      <div className="space-y-4">
        {mode === 'active' && syncKey && (
          <>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 text-emerald-400 text-sm mb-2">
                <Cloud size={16} /> Synchronisation active
                {syncStatus === 'offline' && <span className="text-rose-400 text-xs ml-auto">hors ligne</span>}
                {syncStatus === 'syncing' && <span className="text-sky-400 text-xs ml-auto">sync…</span>}
                {syncStatus === 'saved' && <span className="text-emerald-400 text-xs ml-auto">à jour</span>}
              </div>
              <p className="text-xs text-zinc-400">Tes données sont sauvegardées dans le cloud et synchronisées automatiquement.</p>
            </div>
            <div>
              <label style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-1.5 flex items-center gap-1"><KeyRound size={10} /> Ta clé de sync</label>
              <div className="flex gap-2">
                <code className="flex-1 bg-zinc-950 border border-white/10 rounded-lg px-3 py-2.5 text-sm font-mono tracking-wider select-all">{syncKey}</code>
                <button onClick={copyKey} className="grid h-11 w-11 place-items-center rounded-lg bg-zinc-800 border border-white/10 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"><Copy size={16} /></button>
              </div>
              <p className="text-[10px] text-zinc-500 mt-2">📱 Pour synchroniser un autre appareil : ouvre l'app dessus, va dans Synchronisation, et entre cette clé.</p>
            </div>
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
              <p className="text-xs text-amber-400/90">⚠️ Garde cette clé secrète et note-la quelque part. C'est le seul moyen d'accéder à tes données. Si tu la perds, tu perds l'accès au cloud.</p>
            </div>
            <button onClick={() => { onDisable(); onClose(); }} className="w-full px-3 py-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500 hover:text-white text-sm font-medium">Désactiver la sync sur cet appareil</button>
          </>
        )}

        {mode === 'choice' && (
          <>
            <p className="text-sm text-zinc-400">Active la synchronisation cloud pour retrouver tes données sur tous tes appareils (iPhone, ordi, etc.).</p>
            <button onClick={() => { onEnable(); setMode('active'); }} className="w-full px-4 py-3 rounded-xl bg-amber-400 text-zinc-950 hover:bg-amber-300 font-semibold flex items-center justify-center gap-2">
              <Sparkles size={16} /> Activer la sync (nouvelle clé)
            </button>
            <div className="flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-white/10" /><span className="text-[10px] uppercase tracking-widest text-zinc-500">ou</span><div className="flex-1 h-px bg-white/10" />
            </div>
            <button onClick={() => setMode('enter')} className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-white/10 text-zinc-100 hover:bg-zinc-700 font-medium flex items-center justify-center gap-2">
              <KeyRound size={16} /> J'ai déjà une clé
            </button>
          </>
        )}

        {mode === 'enter' && (
          <>
            <label style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-1.5">Entre ta clé de sync</label>
            <input value={inputKey} onChange={(e) => setInputKey(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX-XXXX" autoFocus className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2.5 text-sm font-mono tracking-wider outline-none focus:border-amber-500/40" />
            <p className="text-[10px] text-zinc-500 mt-2">⚠️ Tes données locales actuelles seront remplacées par celles du cloud.</p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setMode('choice')} className="flex-1 px-3 py-2 rounded-lg bg-zinc-800 border border-white/10 text-zinc-100 hover:bg-zinc-700 text-sm">Retour</button>
              <button onClick={() => { if (inputKey.length >= 6) { onEnable(inputKey.trim()); setMode('active'); } else toast('Clé trop courte', 'error'); }} className="flex-1 px-3 py-2 rounded-lg bg-amber-400 text-zinc-950 hover:bg-amber-300 text-sm font-semibold">Connecter</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ===== APP ===== */
function SlotTrackerApp() {
  const toast = useToast();
  const [confirm, confirmNode] = useConfirm();

  const [machines, setMachines] = useState([]);
  const [hunts, setHunts] = useState([]);
  const [savedHuntQueue, setSavedHuntQueue] = useState([]);
  const [config, setConfig] = useState({ startStack: 0 });
  const [providerBetScales, setProviderBetScales] = useState(DEFAULT_BET_SCALES);
  const [loaded, setLoaded] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [theme, setTheme] = useState('dark'); // 'dark' | 'light'
  const [accentColor, setAccentColor] = useState('amber'); // amber, emerald, sky, rose, violet

  const [page, setPage] = useState('machines');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name_asc');
  const [streamerMode, setStreamerMode] = useState(false);
  const [heatmapDate, setHeatmapDate] = useState(new Date());
  const [showArchived, setShowArchived] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [filterTags, setFilterTags] = useState([]);
  const [filterProviders, setFilterProviders] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMachines, setSelectedMachines] = useState(new Set());

  const [modal, setModal] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [summary, setSummary] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [confettiActive, setConfettiActive] = useState(false);

  const [currentHunt, setCurrentHunt] = useState(null);
  const [showHuntPanel, setShowHuntPanel] = useState(false);
  const [bonusOpener, setBonusOpener] = useState(null);
  const [openerGain, setOpenerGain] = useState('');
  const [openerCasino, setOpenerCasino] = useState('');
  const [openerNote, setOpenerNote] = useState('');
  const [huntStartTime, setHuntStartTime] = useState(null);
  const [strictMode, setStrictMode] = useState(false);
  const [practiceMode, setPracticeMode] = useState(false);

  const [iaBudget, setIaBudget] = useState(200);
  const [iaCount, setIaCount] = useState(10);
  const [iaProviders, setIaProviders] = useState([]);

  // Undo stack
  const undoStackRef = useRef([]);
  const pushUndo = (label, restoreFn) => {
    undoStackRef.current = [{ label, restoreFn, time: Date.now() }, ...undoStackRef.current].slice(0, 10);
  };
  const undo = () => {
    const last = undoStackRef.current[0];
    if (!last) { toast('Rien à annuler', 'info'); return; }
    last.restoreFn();
    undoStackRef.current = undoStackRef.current.slice(1);
    toast(`↶ ${last.label}`, 'info');
  };

  const exportData = () => {
    const data = { machines, hunts, savedHuntQueue, config, providerBetScales, soundOn, theme, accentColor };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slot-tracker-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Sauvegarde téléchargée', 'success');
  };
  const importData = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const d = JSON.parse(ev.target.result);
        if (!(await confirm('Restaurer ces données ? Les actuelles seront remplacées.'))) return;
        if (d.machines) setMachines(d.machines.map((m) => ({ ...m, tags: m.tags || [], notes: m.notes || '', archived: m.archived || false })));
        if (d.hunts) setHunts(d.hunts);
        if (d.savedHuntQueue) setSavedHuntQueue(d.savedHuntQueue);
        if (d.config) setConfig(d.config);
        if (d.providerBetScales) setProviderBetScales(d.providerBetScales);
        toast('Données restaurées', 'success');
      } catch (err) { toast('Fichier invalide', 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const play = (sound) => { if (soundOn) sounds[sound]?.(); };

  // === SYNC SUPABASE ===
  const [syncKey, setSyncKeyState] = useState(getSyncKey());
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | saved | error | offline
  const saveTimerRef = useRef(null);
  const hydratingRef = useRef(false);

  const applyState = (d, fromCloud) => {
    if (d.machines) setMachines((fromCloud ? d.machines.map(normalizeMachine) : d.machines).map((m) => ({ ...m, tags: m.tags || [], notes: m.notes || '', archived: m.archived || false })));
    if (d.hunts) setHunts(fromCloud ? d.hunts.map(normalizeHunt) : d.hunts);
    const saved = fromCloud ? (d.saved_hunts || []).map(normalizeSaved) : d.savedHuntQueue;
    if (saved) setSavedHuntQueue(saved);
    const cfg = fromCloud ? d.config : d.config;
    if (cfg) setConfig(cfg);
    const scales = fromCloud ? d.provider_bet_scales : d.providerBetScales;
    if (scales && Object.keys(scales).length) setProviderBetScales(scales);
    const prefs = fromCloud ? d.prefs : d;
    if (prefs) {
      if (prefs.soundOn !== undefined) setSoundOn(prefs.soundOn);
      if (prefs.theme) setTheme(prefs.theme);
      if (prefs.accentColor) setAccentColor(prefs.accentColor);
    }
  };

  // Chargement initial
  useEffect(() => {
    (async () => {
      hydratingRef.current = true;
      // 1. cache local d'abord (instantané)
      const cached = localCache.get();
      if (cached) applyState(cached, false);

      // 2. cloud si on a une clé
      const key = getSyncKey();
      if (key) {
        try {
          setSyncStatus('syncing');
          const cloud = await loadState(key);
          const hasCloudData = (cloud.machines?.length || 0) > 0 || (cloud.hunts?.length || 0) > 0;
          if (hasCloudData) {
            applyState(cloud, true);
          } else if (!cached) {
            setMachines(seedMachines());
          }
          setSyncStatus('saved');
        } catch (e) {
          console.warn('Cloud load failed', e);
          setSyncStatus('offline');
          if (!cached) setMachines(seedMachines());
        }
      } else if (!cached) {
        setMachines(seedMachines());
      }
      setLoaded(true);
      setTimeout(() => { hydratingRef.current = false; }, 100);
    })();
  }, []);

  // Sauvegarde : cache local immédiat + cloud débounce
  useEffect(() => {
    if (!loaded || hydratingRef.current) return;
    const snapshot = {
      machines, hunts, savedHuntQueue, config, providerBetScales,
      soundOn, theme, accentColor,
      prefs: { soundOn, theme, accentColor },
    };
    localCache.set(snapshot);

    const key = getSyncKey();
    if (!key) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSyncStatus('syncing');
    saveTimerRef.current = setTimeout(async () => {
      try {
        await cloudSaveState(key, snapshot);
        setSyncStatus('saved');
      } catch (e) {
        console.warn('Cloud save failed', e);
        setSyncStatus('offline');
      }
    }, 1200);
  }, [machines, hunts, savedHuntQueue, config, providerBetScales, soundOn, theme, accentColor, loaded]);

  // Activer la sync : génère ou applique une clé puis recharge
  const enableSync = async (existingKey) => {
    const key = existingKey || generateSyncKey();
    setSyncKey(key);
    setSyncKeyState(key);
    try {
      setSyncStatus('syncing');
      const cloud = await loadState(key);
      const hasCloudData = (cloud.machines?.length || 0) > 0;
      if (hasCloudData) {
        applyState(cloud, true);
        toast('Données cloud récupérées', 'success');
      } else {
        // pousse l'état actuel vers le cloud
        await cloudSaveState(key, { machines, hunts, savedHuntQueue, config, providerBetScales, prefs: { soundOn, theme, accentColor } });
        toast('Sync activée, données envoyées', 'success');
      }
      setSyncStatus('saved');
    } catch (e) {
      setSyncStatus('error');
      toast('Erreur de connexion au cloud', 'error');
    }
  };

  const disableSync = () => {
    localStorage.removeItem('elite_sync_key');
    setSyncKeyState(null);
    setSyncStatus('idle');
    toast('Sync désactivée (données gardées en local)', 'info');
  };

  // Setup PWA (manifest + theme color)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    // Theme color
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    meta.content = theme === 'dark' ? '#0a0a0b' : '#fafafa';

    // Apple touch
    if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
      const m = document.createElement('meta');
      m.name = 'apple-mobile-web-app-capable'; m.content = 'yes';
      document.head.appendChild(m);
    }
    if (!document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')) {
      const m = document.createElement('meta');
      m.name = 'apple-mobile-web-app-status-bar-style'; m.content = 'black-translucent';
      document.head.appendChild(m);
    }
    if (!document.querySelector('meta[name="apple-mobile-web-app-title"]')) {
      const m = document.createElement('meta');
      m.name = 'apple-mobile-web-app-title'; m.content = 'Elite Tracker';
      document.head.appendChild(m);
    }

    // Manifest inline
    if (!document.querySelector('link[rel="manifest"]')) {
      const manifest = {
        name: 'Elite Slot Tracker',
        short_name: 'Elite',
        description: 'Tracker de slots casino avec IA',
        start_url: window.location.href,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0a0a0b',
        theme_color: '#d4af37',
        icons: [
          { src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0a0a0b" rx="20"/><text x="50" y="68" font-size="60" text-anchor="middle">🎰</text></svg>'), sizes: '192x192', type: 'image/svg+xml' },
          { src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0a0a0b" rx="20"/><text x="50" y="68" font-size="60" text-anchor="middle">🎰</text></svg>'), sizes: '512x512', type: 'image/svg+xml' },
        ],
      };
      const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = URL.createObjectURL(blob);
      document.head.appendChild(link);
    }
  }, [theme]);

  // Cmd+K / Ctrl+K + Ctrl+Z
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setShowSearch(true); }
      else if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        const tag = e.target.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); undo(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Hunt timer
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!currentHunt || !huntStartTime) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [currentHunt, huntStartTime]);
  const huntDuration = huntStartTime ? Math.floor((now - huntStartTime) / 1000) : 0;
  const formatDuration = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`;
  };

  const stats = useMemo(() => {
    const totalGains = hunts.reduce((a, h) => a + (h.totalG || 0), 0);
    const totalCost = hunts.reduce((a, h) => a + (h.cost || 0), 0);
    const net = totalGains - totalCost;
    return { profit:(config.startStack || 0) + net, sessions:hunts.length, machineCount:machines.length, net };
  }, [hunts, config.startStack, machines.length]);

  const addMachine = (nom, provider, image) => {
    if (!nom?.trim()) { toast('Nom requis', 'error'); return false; }
    if (machines.some((m) => m.nom.toLowerCase() === nom.toLowerCase())) { toast('Existe déjà', 'error'); return false; }
    setMachines((prev) => [...prev, {id:uid(),nom:nom.trim(),provider,image:image||'',history:[],tentatives:0,totalGain:0,ia_weight:1.0,fav:false,bonusCount:0,lastBonusDate:'Jamais',playCount:0}]);
    toast('Machine ajoutée', 'success'); return true;
  };
  const updateMachine = (id, patch) => setMachines((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const deleteMachine = async (id) => {
    if (await confirm('Supprimer cette machine ?', { danger: true })) {
      const m = machines.find((x) => x.id === id);
      pushUndo(`Restaurer ${m?.nom}`, () => setMachines((prev) => [...prev, m]));
      setMachines((prev) => prev.filter((x) => x.id !== id));
      setModal(null); setDetailId(null); toast('Supprimée', 'success');
      play('click');
    }
  };
  const toggleArchive = (id) => {
    setMachines((prev) => prev.map((m) => (m.id === id ? { ...m, archived: !m.archived } : m)));
    play('click');
  };
  const addMachinesToHunt = () => {
    const ids = Array.from(selectedMachines);
    if (ids.length === 0) { toast('Aucune machine sélectionnée', 'error'); return; }
    setCurrentHunt((h) => {
      const base = h || { date: new Date().toLocaleString('fr-FR'), cost: 0, items: [] };
      const newItems = ids.map((mid) => ({ id:uid(), machineId:mid, bet:0, status:'none', selected:false, finalGain:0 }));
      return { ...base, items: [...base.items, ...newItems] };
    });
    setShowHuntPanel(true);
    setSelectedMachines(new Set());
    setSelectMode(false);
    if (!huntStartTime) setHuntStartTime(Date.now());
    toast(`${ids.length} machines ajoutées au hunt`, 'success');
    play('validate');
  };
  const toggleFav = (id) => setMachines((prev) => prev.map((m) => (m.id === id ? { ...m, fav: !m.fav } : m)));
  const deleteGain = async (id, idx) => {
    if (!(await confirm('Supprimer ce gain ?', { danger: true }))) return;
    setMachines((prev) => prev.map((m) => {
      if (m.id !== id) return m;
      const h = [...(m.history || [])];
      const removed = h.splice(idx, 1)[0];
      return { ...m, history: h, totalGain: Math.max(0, (m.totalGain || 0) - (removed?.gain || 0)), bonusCount: Math.max(0, (m.bonusCount || 0) - 1) };
    }));
  };

  const startHunt = () => {
    if (currentHunt) { setShowHuntPanel(true); return; }
    setCurrentHunt({ date: new Date().toLocaleString('fr-FR'), cost: 0, items: [] });
    setHuntStartTime(Date.now());
    setShowHuntPanel(true);
    play('click');
  };
  const addToHunt = (machineId, bet = 0) => {
    setCurrentHunt((h) => {
      const base = h || { date: new Date().toLocaleString('fr-FR'), cost: 0, items: [] };
      return { ...base, items: [...base.items, { id:uid(), machineId, bet, status:'none', selected:false, finalGain:0 }] };
    });
    setShowHuntPanel(true);
  };
  const updateHuntItem = (itemId, patch) => setCurrentHunt((h) => h ? { ...h, items: h.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) } : h);
  const removeHuntItem = (itemId) => setCurrentHunt((h) => h ? { ...h, items: h.items.filter((it) => it.id !== itemId) } : h);

  const reorderHuntItems = (draggedId, overId) => {
    setCurrentHunt((h) => {
      if (!h) return h;
      const items = [...h.items];
      const fromIdx = items.findIndex((x) => x.id === draggedId);
      const toIdx = items.findIndex((x) => x.id === overId);
      if (fromIdx === -1 || toIdx === -1) return h;
      const [moved] = items.splice(fromIdx, 1);
      items.splice(toIdx, 0, moved);
      return { ...h, items };
    });
  };

  const clearHunt = async () => {
    if (!currentHunt) return;
    const sel = currentHunt.items.filter((it) => it.selected);
    if (sel.length > 0) {
      if (await confirm(`Supprimer ${sel.length} machines sélectionnées ?`, { danger: true }))
        setCurrentHunt((h) => ({ ...h, items: h.items.filter((it) => !it.selected) }));
    } else {
      if (await confirm('Vider la liste ?', { danger: true }))
        setCurrentHunt((h) => ({ ...h, items: [] }));
    }
  };
  const clearEmptyHuntLines = () => {
    setCurrentHunt((h) => {
      if (!h) return h;
      const before = h.items.length;
      const items = h.items.filter((it) => it.status === 'tent' || it.status === 'bonus');
      const removed = before - items.length;
      if (removed > 0) toast(`${removed} ligne(s) nettoyée(s)`, 'success'); else toast('Rien à nettoyer', 'info');
      return { ...h, items };
    });
  };
  const saveCurrentHunt = () => {
    if (!currentHunt || currentHunt.items.length === 0) { toast('Rien à sauvegarder', 'error'); return; }
    setSavedHuntQueue((q) => [{ ...currentHunt, savedId: uid() }, ...q]);
    setCurrentHunt(null); setShowHuntPanel(false); toast('Sauvegardé', 'success');
  };
  const loadSavedHunt = async (savedId) => {
    if (currentHunt && !(await confirm('Hunt actif déjà en cours. Remplacer ?'))) return;
    const found = savedHuntQueue.find((h) => h.savedId === savedId);
    if (!found) return;
    setCurrentHunt({ date: found.date, cost: found.cost, items: found.items.map((it) => ({ ...it, id: it.id || uid() })) });
    setSavedHuntQueue((q) => q.filter((h) => h.savedId !== savedId));
    setShowHuntPanel(true); setPage('hunt');
  };
  const deleteSavedHunt = async (savedId) => {
    if (await confirm('Supprimer ce hunt en attente ?', { danger: true }))
      setSavedHuntQueue((q) => q.filter((h) => h.savedId !== savedId));
  };

  const filterPoolByProviders = (pool, selected) => {
    if (selected.length === 0) return pool;
    return pool.filter((m) => {
      if (selected.includes('Hacksaw Gaming') && (m.provider === 'Bullshark Games' || m.provider === 'Backseat Gaming')) return true;
      if (selected.includes('Relax Gaming') && m.provider === 'Print Studios') return true;
      return selected.includes(m.provider);
    });
  };
  const pickBetForMachine = (m) => {
    const scales = (providerBetScales[m.provider] || [0.2, 0.4, 0.6]).filter((b) => b > 0);
    const tier = (m.tentatives || 0) <= 2 ? 0 : (m.tentatives || 0) <= 4 ? 1 : 2;
    return scales[tier] ?? scales[scales.length - 1] ?? 0;
  };
  const generateIA = (auto = false) => {
    const huntIds = new Set((currentHunt?.items || []).map((it) => it.machineId));
    let pool = filterPoolByProviders(machines.filter((m) => !huntIds.has(m.id)), iaProviders);
    if (pool.length === 0) { toast('Aucune machine éligible', 'error'); return; }
    let selection;
    if (auto) {
      const count = iaBudget <= 50 ? 5 : iaBudget <= 150 ? 8 : iaBudget <= 300 ? 12 : 15;
      let winners = [...pool].sort((a, b) => (b.totalGain || 0) - (a.totalGain || 0)).slice(0, 30);
      let underplayed = [...pool].sort((a, b) => (a.tentatives || 0) - (b.tentatives || 0)).slice(0, 30);
      selection = [];
      for (let i = 0; i < count; i++) {
        const src = i % 2 === 0 ? winners : underplayed;
        if (src.length === 0) break;
        const idx = Math.floor(Math.random() * src.length);
        const chosen = src.splice(idx, 1)[0];
        selection.push(chosen);
        winners = winners.filter((x) => x.id !== chosen.id);
        underplayed = underplayed.filter((x) => x.id !== chosen.id);
      }
    } else {
      pool = [...pool].sort(() => Math.random() - 0.5);
      selection = pool.slice(0, Math.max(1, iaCount));
    }
    const newItems = selection.map((m) => ({ id:uid(), machineId:m.id, bet:pickBetForMachine(m), status:'none', selected:false, finalGain:0 }));
    setCurrentHunt((h) => ({
      ...(h || { date: new Date().toLocaleString('fr-FR'), items: [] }),
      cost: iaBudget,
      items: [...(h?.items || []), ...newItems],
    }));
    setShowHuntPanel(true); setPage('hunt');
    toast(`${newItems.length} machines ajoutées`, 'success');
  };
  const addRandomIA = () => {
    const huntIds = new Set((currentHunt?.items || []).map((it) => it.machineId));
    const pool = filterPoolByProviders(machines.filter((m) => !huntIds.has(m.id)), iaProviders);
    if (pool.length === 0) { toast('Aucune machine', 'error'); return; }
    pool.sort((a, b) => (getIAScore(b) + Math.random() * 50) - (getIAScore(a) + Math.random() * 50));
    addToHunt(pool[0].id, pickBetForMachine(pool[0]));
  };

  const processHunt = () => {
    if (!currentHunt) return;
    if (currentHunt.items.length === 0) { toast('Aucune machine', 'error'); return; }
    if (currentHunt.items.some((it) => it.status === 'none')) { toast('Configurez chaque ligne', 'error'); return; }
    setMachines((prev) => prev.map((m) => {
      const tents = currentHunt.items.filter((it) => it.status === 'tent' && it.machineId === m.id).length;
      if (tents === 0) return m;
      return { ...m, tentatives: (m.tentatives || 0) + tents, playCount: (m.playCount || 0) + tents };
    }));
    const bonusList = currentHunt.items.filter((it) => it.status === 'bonus').sort((a, b) => (a.bet || 0) - (b.bet || 0));
    if (bonusList.length === 0) finishHunt([]);
    else { setBonusOpener({ queue: bonusList, idx: 0, results: [] }); setOpenerGain(''); setShowHuntPanel(false); }
  };

  const nextBonus = () => {
    const g = parseFloat(openerGain);
    if (isNaN(g) || g < 0) { toast('Gain invalide', 'error'); play('error'); return; }
    setBonusOpener((bo) => {
      if (!bo) return null;
      const it = bo.queue[bo.idx];
      const results = [...bo.results, { ...it, finalGain: g }];
      const mult = g / (it.bet || 1);
      if (mult >= 500) { play('monster'); setConfettiActive(true); setTimeout(() => setConfettiActive(false), 2700); }
      else if (mult >= 100) { play('bigWin'); setConfettiActive(true); setTimeout(() => setConfettiActive(false), 2700); }
      else play('validate');
      if (!practiceMode) {
        setMachines((prev) => prev.map((m) => {
          if (m.id !== it.machineId) return m;
          return {
            ...m, totalGain: (m.totalGain || 0) + g, tentatives: 0,
            bonusCount: (m.bonusCount || 0) + 1,
            lastBonusDate: new Date().toLocaleDateString('fr-FR'),
            history: [{ date: new Date().toLocaleDateString('fr-FR'), gain: g, bet: it.bet, casino: openerCasino || undefined, note: openerNote || undefined }, ...(m.history || [])],
          };
        }));
      }
      if (bo.idx + 1 >= bo.queue.length) { finishHunt(results); return null; }
      setOpenerGain(''); setOpenerCasino(''); setOpenerNote('');
      return { ...bo, idx: bo.idx + 1, results };
    });
  };

  const prevBonus = () => {
    setBonusOpener((bo) => {
      if (!bo || bo.idx === 0) return bo;
      const prev = bo.results[bo.results.length - 1];
      setMachines((mList) => mList.map((m) => {
        if (m.id !== prev.machineId) return m;
        const h = [...(m.history || [])];
        h.shift();
        return { ...m, totalGain: Math.max(0, (m.totalGain || 0) - (prev.finalGain || 0)), bonusCount: Math.max(0, (m.bonusCount || 0) - 1), history: h };
      }));
      setOpenerGain('');
      return { ...bo, idx: bo.idx - 1, results: bo.results.slice(0, -1) };
    });
  };

  const finishHunt = (bonusResults) => {
    if (!currentHunt) return;
    const totalG = bonusResults.reduce((a, b) => a + (b.finalGain || 0), 0);
    const finalItems = currentHunt.items.map((it) => {
      const found = bonusResults.find((r) => r.id === it.id);
      return found ? { ...it, finalGain: found.finalGain } : it;
    });
    const finished = { ...currentHunt, id: uid(), items: finalItems, totalG, net: totalG - (currentHunt.cost || 0), duration: huntDuration, practice: practiceMode };
    if (!practiceMode) {
      setMachines((prev) => prev.map((m) => {
        const wins = bonusResults.filter((r) => r.machineId === m.id);
        if (wins.length === 0) return m;
        let weight = m.ia_weight || 1.0;
        wins.forEach((w) => {
          const mult = (w.finalGain || 0) / (w.bet || 1);
          if (mult >= 250) weight += 0.4;
          else if (mult >= 100) weight += 0.15;
          else if (mult < 10) weight -= 0.15;
        });
        weight = Math.max(0.2, Math.min(3.5, weight));
        return { ...m, ia_weight: weight };
      }));
      setHunts((prev) => [...prev, finished]);
    } else {
      toast('Hunt à blanc terminé (non enregistré)', 'info');
    }
    setCurrentHunt(null); setBonusOpener(null); setShowHuntPanel(false); setHuntStartTime(null); setPracticeMode(false); setStrictMode(false);
    setSummary({ title: practiceMode ? 'Récap (à blanc)' : 'Récap du Hunt', hunt: finished });
  };

  const deleteHunt = async (huntId) => {
    if (!(await confirm('Supprimer ce hunt ? Les gains seront retirés.', { danger: true }))) return;
    const h = hunts.find((x) => x.id === huntId);
    if (!h) return;
    setMachines((prev) => prev.map((m) => {
      const concerned = h.items.filter((it) => it.status === 'bonus' && it.machineId === m.id);
      if (concerned.length === 0) return m;
      const removedGain = concerned.reduce((a, b) => a + (b.finalGain || 0), 0);
      let history = [...(m.history || [])];
      for (const c of concerned) {
        const idx = history.findIndex((hh) => hh.gain === c.finalGain && hh.bet === c.bet);
        if (idx !== -1) history.splice(idx, 1);
      }
      return { ...m, totalGain: Math.max(0, (m.totalGain || 0) - removedGain), bonusCount: Math.max(0, (m.bonusCount || 0) - concerned.length), history };
    }));
    setHunts((prev) => prev.filter((x) => x.id !== huntId));
  };

  const filteredMachines = useMemo(() => {
    const q = search.toLowerCase();
    let list = machines.filter((m) => {
      if (!showArchived && m.archived) return false;
      if (showArchived && !m.archived) return false;
      if (!m.nom.toLowerCase().includes(q) && !(m.provider || '').toLowerCase().includes(q) && !(m.tags || []).some((t) => t.includes(q))) return false;
      if (filterTags.length > 0 && !filterTags.every((t) => (m.tags || []).includes(t))) return false;
      if (filterProviders.length > 0 && !filterProviders.includes(m.provider)) return false;
      return true;
    });
    if (sort === 'favorites') list = list.filter((m) => m.fav);
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'name_asc': return a.nom.localeCompare(b.nom);
        case 'name_desc': return b.nom.localeCompare(a.nom);
        case 'gain_desc': return (b.totalGain || 0) - (a.totalGain || 0);
        case 'tent_desc': return (b.tentatives || 0) - (a.tentatives || 0);
        case 'ia_desc': return getIAScore(b) - getIAScore(a);
        default: return a.nom.localeCompare(b.nom);
      }
    });
  }, [machines, search, sort, showArchived, filterTags, filterProviders]);

  const allTags = useMemo(() => {
    const set = new Set();
    machines.forEach((m) => (m.tags || []).forEach((t) => set.add(t)));
    return [...set].sort();
  }, [machines]);

  const openerData = useMemo(() => {
    if (!bonusOpener) return null;
    const it = bonusOpener.queue[bonusOpener.idx];
    const m = machines.find((x) => x.id === it.machineId);
    const opened = bonusOpener.results;
    const avgMult = opened.length ? opened.reduce((a, b) => a + b.finalGain / (b.bet || 1), 0) / opened.length : 0;
    const g = parseFloat(openerGain) || 0;
    const liveMult = g > 0 ? g / (it.bet || 1) : 0;
    const cost = currentHunt?.cost || 0;
    const currentTotal = opened.reduce((a, b) => a + (b.finalGain || 0), 0) + g;
    const remaining = bonusOpener.queue.slice(bonusOpener.idx + 1);
    const remainingBets = remaining.reduce((a, b) => a + (b.bet || 0), 0);
    const need = Math.max(0, cost - currentTotal);
    const reqMult = remaining.length > 0 && need > 0 && remainingBets > 0 ? need / remainingBets : 0;
    return { it, m, avgMult, liveMult, cost, currentTotal, need, reqMult, remainingCount: remaining.length };
  }, [bonusOpener, openerGain, machines, currentHunt]);

  if (!loaded) {
    return <div style={{fontFamily:'JetBrains Mono, monospace'}} className="min-h-screen grid place-items-center text-zinc-500 text-sm bg-zinc-950">Chargement…</div>;
  }

  const top5 = [...machines].filter((m) => (m.totalGain || 0) > 0).sort((a, b) => (b.totalGain || 0) - (a.totalGain || 0)).slice(0, 5);
  const medals = ['🥇','🥈','🥉'];
  const monthly = (() => {
    const out = {};
    const now = new Date();
    for (let i = 0; i < 13; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      out[key] = { key, label: new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(d), profit:0, sessions:0, maxG:0, minG:Infinity, providers:{}, machinesG:{}, played:new Set() };
    }
    hunts.forEach((h) => {
      const parts = h.date.split(' ')[0].split('/');
      const key = `${parts[2]}-${parts[1]}`;
      const o = out[key];
      if (!o) return;
      o.profit += h.net; o.sessions++;
      h.items.forEach((it) => {
        if (it.status !== 'bonus') return;
        const m = machines.find((x) => x.id === it.machineId);
        if (!m) return;
        o.played.add(m.id);
        const g = it.finalGain || 0;
        if (g > o.maxG) o.maxG = g;
        if (g < o.minG && g > 0) o.minG = g;
        o.providers[m.provider] = (o.providers[m.provider] || 0) + g;
        o.machinesG[m.nom] = (o.machinesG[m.nom] || 0) + g;
      });
    });
    return Object.values(out).map((o) => ({
      ...o,
      minG: o.minG === Infinity ? 0 : o.minG,
      topProv: Object.entries(o.providers).sort((a,b) => b[1]-a[1])[0]?.[0] || '—',
      topMachine: Object.entries(o.machinesG).sort((a,b) => b[1]-a[1])[0]?.[0] || '—',
      flopMachine: Object.entries(o.machinesG).sort((a,b) => a[1]-b[1])[0]?.[0] || '—',
      playedCount: o.played.size,
    }));
  })();
  const providers = [...new Set(machines.map((m) => m.provider))].filter((p) => p && !['Bullshark Games','Backseat Gaming','Print Studios'].includes(p)).sort();

  return (
    <div className="flex min-h-screen text-zinc-100" style={{fontFamily:'system-ui, sans-serif', background:'var(--bg-base)', color:'var(--text-base)'}} data-theme={theme}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Instrument+Serif&display=swap');
        :root[data-theme='dark'], [data-theme='dark'] {
          --bg-base: #0a0a0b;
          --text-base: #fafafa;
          --bg-grad-1: radial-gradient(ellipse 80% 50% at 50% -20%, rgba(212,175,55,0.08), transparent);
          --bg-grad-2: radial-gradient(ellipse 60% 50% at 100% 50%, rgba(108,142,168,0.05), transparent);
        }
        :root[data-theme='light'], [data-theme='light'] {
          --bg-base: #fafafa;
          --text-base: #18181b;
          --bg-grad-1: radial-gradient(ellipse 80% 50% at 50% -20%, rgba(212,175,55,0.15), transparent);
          --bg-grad-2: radial-gradient(ellipse 60% 50% at 100% 50%, rgba(108,142,168,0.08), transparent);
        }
        [data-theme='light'] .bg-zinc-950 { background-color: #fafafa !important; }
        [data-theme='light'] .bg-zinc-900\\/80, [data-theme='light'] .bg-zinc-900\\/40, [data-theme='light'] .bg-zinc-900\\/95, [data-theme='light'] .bg-zinc-900 { background-color: rgba(255,255,255,0.85) !important; backdrop-filter: blur(12px); }
        [data-theme='light'] .bg-zinc-950\\/50, [data-theme='light'] .bg-zinc-950\\/60, [data-theme='light'] .bg-zinc-950\\/70, [data-theme='light'] .bg-zinc-950\\/80 { background-color: rgba(0,0,0,0.04) !important; }
        [data-theme='light'] .bg-zinc-800, [data-theme='light'] .bg-zinc-800\\/50, [data-theme='light'] .bg-zinc-800\\/60, [data-theme='light'] .bg-zinc-800\\/30 { background-color: #e4e4e7 !important; }
        [data-theme='light'] .bg-zinc-700 { background-color: #d4d4d8 !important; }
        [data-theme='light'] .text-zinc-100, [data-theme='light'] .text-zinc-200 { color: #18181b !important; }
        [data-theme='light'] .text-zinc-300, [data-theme='light'] .text-zinc-400 { color: #52525b !important; }
        [data-theme='light'] .text-zinc-500, [data-theme='light'] .text-zinc-600 { color: #71717a !important; }
        [data-theme='light'] .border-white\\/5, [data-theme='light'] .border-white\\/10, [data-theme='light'] .border-white\\/15 { border-color: rgba(0,0,0,0.08) !important; }
        [data-theme='light'] .text-amber-400 { color: #b45309 !important; }
        [data-theme='light'] .bg-amber-400 { background-color: #f59e0b !important; }
        [data-theme='light'] body, [data-theme='light'] { color: #18181b; }
        body { font-family: 'Space Grotesk', system-ui, sans-serif; background: var(--bg-base); background-image: var(--bg-grad-1), var(--bg-grad-2); background-attachment: fixed; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
        input[type=number] { -moz-appearance:textfield; }
        *::-webkit-scrollbar { width:10px; height:10px; }
        *::-webkit-scrollbar-track { background:transparent; }
        *::-webkit-scrollbar-thumb { background:rgba(128,128,128,0.2); border-radius:5px; }
        [data-theme='light'] *::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); }
      `}</style>
      {confirmNode}
      <Confetti active={confettiActive} />
      <CommandPalette
        open={showSearch}
        onClose={() => setShowSearch(false)}
        machines={machines}
        hunts={hunts}
        onNavigate={setPage}
        onSelectMachine={(m) => { setDetailId(m.id); setModal('detail'); setPage('machines'); }}
        onAction={(a) => {
          if (a === 'startHunt') { startHunt(); setPage('hunt'); }
          else if (a === 'goIa') setPage('ia');
          else if (a === 'addMachine') setModal('addMachine');
          else if (a === 'goStats') setPage('stats');
          else if (a === 'goRecords') setPage('records');
          else if (a === 'streamer') setStreamerMode((s) => !s);
        }}
      />

      <Sidebar active={page} onNav={setPage} savedHuntsCount={savedHuntQueue.length} hasActiveHunt={!!currentHunt} streamerMode={streamerMode} onToggleStreamer={() => setStreamerMode((s) => !s)} soundOn={soundOn} onToggleSound={() => setSoundOn((s) => !s)} theme={theme} onToggleTheme={() => setTheme((t) => t === 'dark' ? 'light' : 'dark')} onOpenSettings={() => setModal('settings')} onOpenSearch={() => setShowSearch(true)} syncStatus={syncStatus} syncEnabled={!!syncKey} onOpenSync={() => setModal('sync')} />

      <main className="flex-1 min-w-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 pb-24 lg:pb-8">
          {page === 'machines' && (
            <>
              <div className="mb-8 space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="bg-zinc-900/80 backdrop-blur-xl border border-white/5 rounded-2xl p-5">
                    <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">Stack initial</div>
                    <div className="flex items-baseline gap-1">
                      <input type="number" value={config.startStack || ''} onChange={(e) => setConfig({ ...config, startStack: parseFloat(e.target.value) || 0 })} placeholder="0" style={{fontFamily:'Instrument Serif, serif', filter: streamerMode ? 'blur(8px)' : 'none'}} className="bg-transparent border-none text-3xl text-sky-400 outline-none w-full p-0" />
                      <span className="text-sky-400 text-xl">€</span>
                    </div>
                  </div>
                  <StatCard label="Solde Actuel" value={formatEUR(stats.profit)} sub={stats.net >= 0 ? `+${formatEUR(stats.net)} gains` : `${formatEUR(stats.net)} pertes`} trend={stats.net} sensitive streamerMode={streamerMode} accent={stats.net >= 0 ? 'sage' : 'rust'} />
                  <StatCard label="Sessions" value={stats.sessions} sub="Hunts joués" />
                  <StatCard label="Machines" value={stats.machineCount} sub="Collection" accent="mist" />
                </div>
                <Heatmap hunts={hunts} date={heatmapDate} onChangeMonth={(delta) => { const d = new Date(heatmapDate); d.setMonth(d.getMonth() + delta); setHeatmapDate(d); }} onDayClick={(items) => setSummary({ title: 'Récap du jour', hunts: items })} />
                <div className="flex flex-wrap gap-2">
                  <button onClick={startHunt} className="px-3.5 py-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 text-sm font-medium">Démarrer un Hunt</button>
                  <button onClick={() => setPage('ia')} className="px-3.5 py-2 rounded-lg bg-zinc-800 border border-white/10 text-zinc-100 hover:bg-zinc-700 text-sm font-medium">Playlist IA</button>
                </div>
              </div>
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                  <div>
                    <h1 style={{fontFamily:'Instrument Serif, serif'}} className="text-3xl">Machines</h1>
                    <p className="text-sm text-zinc-500 mt-1">{filteredMachines.length} sur {machines.filter((m) => !m.archived).length} {showArchived && '· archive'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectMode ? (
                      <>
                        <span className="text-xs text-zinc-400 font-mono">{selectedMachines.size} sél.</span>
                        <button onClick={addMachinesToHunt} disabled={selectedMachines.size === 0} className="px-3 py-2 rounded-lg bg-amber-400 text-zinc-950 hover:bg-amber-300 text-xs font-semibold disabled:opacity-50">→ Hunt</button>
                        <button onClick={() => { setSelectMode(false); setSelectedMachines(new Set()); }} className="px-3 py-2 rounded-lg bg-zinc-800 border border-white/10 text-zinc-100 hover:bg-zinc-700 text-xs">Annuler</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setSelectMode(true)} className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-800 border border-white/10 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100" title="Multi-sélection">
                          <Check size={14} />
                        </button>
                        <button onClick={() => setViewMode((v) => v === 'grid' ? 'list' : 'grid')} className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-800 border border-white/10 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100" title="Changer vue">
                          {viewMode === 'grid' ? <List size={14} /> : <Grid3x3 size={14} />}
                        </button>
                        <button onClick={() => setShowArchived((a) => !a)} className={`grid h-9 w-9 place-items-center rounded-lg border text-zinc-300 hover:text-zinc-100 ${showArchived ? 'bg-amber-400 text-zinc-950 border-amber-400' : 'bg-zinc-800 border-white/10 hover:bg-zinc-700'}`} title="Archive">
                          <Archive size={14} />
                        </button>
                        <button onClick={() => setModal('addMachine')} className="px-3.5 py-2 rounded-lg bg-amber-400 text-zinc-950 hover:bg-amber-300 text-sm font-semibold flex items-center gap-1"><Plus size={16} /> Nouveau</button>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher (nom, provider, tag)…" className="w-full bg-zinc-900 border border-white/10 rounded-lg pl-10 pr-3 py-2.5 text-sm outline-none focus:border-amber-500/40" />
                  </div>
                  <select value={sort} onChange={(e) => setSort(e.target.value)} className="bg-zinc-900 border border-white/10 rounded-lg pl-3 pr-8 py-2.5 text-sm outline-none focus:border-amber-500/40 cursor-pointer">
                    <option value="name_asc">A→Z</option>
                    <option value="name_desc">Z→A</option>
                    <option value="favorites">★ Favoris</option>
                    <option value="gain_desc">Gains ↓</option>
                    <option value="tent_desc">Tentatives ↓</option>
                    <option value="ia_desc">Score IA ↓</option>
                  </select>
                </div>
                {allTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase text-zinc-500 mr-1">Tags :</span>
                    {allTags.map((t) => {
                      const active = filterTags.includes(t);
                      return (
                        <button key={t} onClick={() => setFilterTags(active ? filterTags.filter((x) => x !== t) : [...filterTags, t])} className={`px-2 py-1 rounded-md text-xs border transition ${active ? 'bg-sky-500/20 text-sky-300 border-sky-500/50' : 'bg-zinc-900 border-white/5 text-zinc-400 hover:border-white/15'}`}>
                          #{t}
                        </button>
                      );
                    })}
                    {filterTags.length > 0 && <button onClick={() => setFilterTags([])} className="text-[10px] text-zinc-500 hover:text-zinc-300 ml-1">×&nbsp;tout</button>}
                  </div>
                )}
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                    {filteredMachines.map((m) => (
                      <MachineCard key={m.id} m={m}
                        onClick={() => { setDetailId(m.id); setModal('detail'); }}
                        onToggleFav={() => toggleFav(m.id)}
                        streamerMode={streamerMode}
                        selected={selectedMachines.has(m.id)}
                        selectMode={selectMode}
                        onSelect={() => {
                          const next = new Set(selectedMachines);
                          if (next.has(m.id)) next.delete(m.id); else next.add(m.id);
                          setSelectedMachines(next);
                        }} />
                    ))}
                  </div>
                ) : (
                  <div className="bg-zinc-900/80 border border-white/5 rounded-2xl overflow-hidden">
                    {filteredMachines.map((m, i) => {
                      const color = getProviderColor(m.provider);
                      const iaScore = getIAScore(m).toFixed(0);
                      const isSelected = selectedMachines.has(m.id);
                      return (
                        <div key={m.id} onClick={() => {
                          if (selectMode) {
                            const next = new Set(selectedMachines);
                            if (next.has(m.id)) next.delete(m.id); else next.add(m.id);
                            setSelectedMachines(next);
                          } else { setDetailId(m.id); setModal('detail'); }
                        }} className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition border-b border-white/5 last:border-0 ${isSelected ? 'bg-amber-500/10' : 'hover:bg-zinc-800/50'} ${m.archived ? 'opacity-60' : ''}`}>
                          {selectMode && (
                            <div className={`grid h-6 w-6 place-items-center rounded-md ${isSelected ? 'bg-amber-400 text-zinc-950' : 'border border-white/15'}`}>
                              {isSelected && <Check size={12} />}
                            </div>
                          )}
                          {m.image ? <img src={m.image} alt="" className="h-10 w-10 rounded-md object-cover shrink-0" /> : <div style={{color, fontFamily:'Instrument Serif, serif'}} className="h-10 w-10 rounded-md bg-zinc-800 grid place-items-center text-lg shrink-0">{m.nom.charAt(0)}</div>}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate flex items-center gap-2">
                              {m.fav && <Star size={10} fill="currentColor" className="text-amber-400 shrink-0" />}
                              {m.nom}
                            </div>
                            <div style={{color, fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase mt-0.5">{m.provider}</div>
                          </div>
                          {(m.tags || []).slice(0, 2).map((t) => (
                            <span key={t} className="hidden sm:inline px-1.5 py-0.5 rounded text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20">{t}</span>
                          ))}
                          <span style={{fontFamily:'JetBrains Mono, monospace'}} className="hidden md:inline text-[10px] text-zinc-500">{m.tentatives}t</span>
                          <span style={{fontFamily:'JetBrains Mono, monospace'}} className="hidden md:inline px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 text-[10px]">IA {iaScore}</span>
                          <span style={{fontFamily:'JetBrains Mono, monospace', filter: streamerMode ? 'blur(8px)' : 'none'}} className="text-sm text-emerald-400 shrink-0 w-20 text-right">{formatEURCompact(Math.max(0, m.totalGain))}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {page === 'hunt' && !currentHunt && (
            <div className="space-y-5">
              <div>
                <h1 style={{fontFamily:'Instrument Serif, serif'}} className="text-3xl">Bonus Hunt</h1>
                <p className="text-sm text-zinc-500 mt-1">Démarrez une session de chasse aux bonus</p>
              </div>
              <div className="bg-zinc-900/80 backdrop-blur-xl border border-white/5 rounded-2xl p-12 text-center">
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-amber-500/15 text-amber-400"><Target size={28} /></div>
                <h2 style={{fontFamily:'Instrument Serif, serif'}} className="text-2xl mb-2">Prêt pour la chasse ?</h2>
                <p className="text-sm text-zinc-500 max-w-md mx-auto mb-6">Lancez un hunt pour suivre vos tentatives et vos bonus.</p>
                <button onClick={startHunt} className="px-6 py-3 rounded-lg bg-amber-400 text-zinc-950 hover:bg-amber-300 text-base font-semibold flex items-center gap-1 mx-auto"><Target size={16} /> Démarrer</button>
              </div>
            </div>
          )}

          {page === 'hunt' && currentHunt && (
            <div className="space-y-5">
              <h1 style={{fontFamily:'Instrument Serif, serif'}} className="text-3xl">Hunt actif</h1>
              <p className="text-sm text-zinc-500">{currentHunt.items.length} machines · démarré {currentHunt.date}</p>
              <button onClick={() => setShowHuntPanel(true)} className="px-3.5 py-2 rounded-lg bg-amber-400 text-zinc-950 hover:bg-amber-300 text-sm font-semibold">Ouvrir le panneau</button>
            </div>
          )}

          {page === 'ia' && (
            <div className="space-y-5 max-w-3xl">
              <div>
                <h1 style={{fontFamily:'Instrument Serif, serif'}} className="text-3xl flex items-center gap-3"><Brain className="text-sky-400" /> Playlist IA</h1>
                <p className="text-sm text-zinc-500 mt-1">Génération automatique d'un hunt</p>
              </div>
              <div className="bg-zinc-900/80 backdrop-blur-xl border border-white/5 rounded-2xl p-6">
                <label style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-3">Budget</label>
                <div className="flex items-baseline gap-2">
                  <input type="number" value={iaBudget} onChange={(e) => setIaBudget(parseFloat(e.target.value) || 0)} style={{fontFamily:'Instrument Serif, serif', fontSize:'3rem'}} className="flex-1 bg-transparent border-b-2 border-white/10 py-2 outline-none focus:border-amber-400" />
                  <span className="text-2xl text-zinc-500">€</span>
                </div>
              </div>
              <div className="bg-zinc-900/80 backdrop-blur-xl border border-white/5 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <label style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500">Studios</label>
                  <div className="flex gap-1">
                    <button onClick={() => setIaProviders(providers)} className="text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700">Tout</button>
                    <button onClick={() => setIaProviders([])} className="text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700">Aucun</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {providers.map((p) => {
                    const checked = iaProviders.includes(p);
                    return (
                      <button key={p} onClick={() => setIaProviders(checked ? iaProviders.filter((x) => x !== p) : [...iaProviders, p])} className={`text-left px-3 py-2 rounded-lg text-xs border transition ${checked ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' : 'bg-zinc-950 border-white/5 text-zinc-400 hover:border-white/15'}`}>{p}</button>
                    );
                  })}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="bg-zinc-900/80 backdrop-blur-xl border border-white/5 rounded-2xl p-5">
                  <h3 style={{fontFamily:'Instrument Serif, serif'}} className="text-xl mb-1">Manuel</h3>
                  <p className="text-xs text-zinc-500 mb-4">Vous choisissez le nombre</p>
                  <input type="number" value={iaCount} min={1} onChange={(e) => setIaCount(parseInt(e.target.value) || 1)} className="w-full bg-zinc-950 border border-white/10 rounded-lg py-2 px-3 text-center mb-4 outline-none focus:border-amber-500/40" />
                  <button onClick={() => generateIA(false)} className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/10 text-zinc-100 hover:bg-zinc-700 text-sm font-medium flex items-center justify-center gap-1"><Plus size={14} /> Appliquer</button>
                </div>
                <div className="rounded-2xl p-5 bg-gradient-to-br from-sky-500/10 to-sky-500/[0.02] border border-sky-500/30">
                  <h3 style={{fontFamily:'Instrument Serif, serif'}} className="text-xl mb-1">IA Auto</h3>
                  <p className="text-xs text-zinc-500 mb-4">L'IA détermine le nombre idéal</p>
                  <button onClick={() => generateIA(true)} className="w-full px-3 py-2 rounded-lg bg-sky-400 text-zinc-950 hover:bg-sky-300 text-sm font-semibold flex items-center justify-center gap-1"><Wand2 size={14} /> Générer</button>
                </div>
              </div>
            </div>
          )}

          {page === 'savedHunts' && (
            <div className="space-y-5 max-w-3xl">
              <h1 style={{fontFamily:'Instrument Serif, serif'}} className="text-3xl">Hunts en attente</h1>
              {savedHuntQueue.length === 0 ? (
                <div className="bg-zinc-900/80 backdrop-blur-xl border border-white/5 rounded-2xl py-16 text-center text-sm text-zinc-500">Aucun hunt en attente.</div>
              ) : (
                <div className="space-y-2">
                  {savedHuntQueue.map((h) => {
                    const bonusCount = h.items.filter((it) => it.status === 'bonus').length;
                    return (
                      <div key={h.savedId} className="bg-zinc-900/80 backdrop-blur-xl border border-white/5 rounded-2xl p-5 flex items-center justify-between">
                        <div>
                          <div style={{fontFamily:'Instrument Serif, serif'}} className="text-lg">Hunt du {h.date}</div>
                          <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-xs text-zinc-500 mt-1 flex gap-4">
                            <span>{bonusCount} bonus</span><span>{h.cost}€ budget</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => loadSavedHunt(h.savedId)} className="px-3 py-1.5 rounded-lg bg-amber-400 text-zinc-950 hover:bg-amber-300 text-xs font-semibold">Relancer</button>
                          <button onClick={() => deleteSavedHunt(h.savedId)} className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500 hover:text-white text-xs"><Trash2 size={12} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {page === 'history' && (
            <div className="space-y-5 max-w-4xl">
              <h1 style={{fontFamily:'Instrument Serif, serif'}} className="text-3xl">Historique</h1>
              {hunts.length === 0 ? (
                <div className="bg-zinc-900/80 backdrop-blur-xl border border-white/5 rounded-2xl py-16 text-center text-sm text-zinc-500">Aucune session.</div>
              ) : (
                <div className="space-y-3">
                  {[...hunts].reverse().map((h) => {
                    const isWin = h.net >= 0;
                    return (
                      <div key={h.id} className={`bg-zinc-900/80 backdrop-blur-xl border border-white/5 rounded-2xl p-5 border-l-4 ${isWin ? 'border-l-emerald-400' : 'border-l-rose-400'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <div style={{fontFamily:'Instrument Serif, serif', filter: streamerMode ? 'blur(8px)' : 'none'}} className={`text-2xl ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>{h.net >= 0 ? '+' : ''}{formatEUR(h.net)}</div>
                            <div style={{fontFamily:'JetBrains Mono, monospace'}} className="text-xs text-zinc-500 mt-1">{h.date}</div>
                          </div>
                          <button onClick={() => deleteHunt(h.id)} className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500 hover:text-white text-xs flex items-center gap-1"><Trash2 size={12} /> Supprimer</button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {h.items.filter((it) => it.status === 'bonus').map((it, idx) => {
                            const m = machines.find((x) => x.id === it.machineId);
                            const mult = (it.finalGain || 0) / (it.bet || 1);
                            const tagCls = mult >= 100 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : mult < 50 ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'bg-zinc-800 text-zinc-400 border-white/5';
                            return <span key={idx} className={`px-2 py-0.5 rounded-md text-[10px] border ${tagCls}`}>{m?.nom || '?'} · {mult.toFixed(1)}x</span>;
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {page === 'top5' && (
            <div className="space-y-5 max-w-2xl">
              <h1 style={{fontFamily:'Instrument Serif, serif'}} className="text-3xl">Top 5 Gains</h1>
              {top5.length === 0 ? (
                <div className="bg-zinc-900/80 backdrop-blur-xl border border-white/5 rounded-2xl py-16 text-center text-sm text-zinc-500"><Trophy className="mx-auto mb-3 text-zinc-600" size={32} />Aucun gain.</div>
              ) : (
                <div className="space-y-2">
                  {top5.map((m, i) => {
                    const color = getProviderColor(m.provider);
                    return (
                      <div key={m.id} className={`bg-zinc-900/80 backdrop-blur-xl border rounded-2xl p-4 flex items-center gap-4 ${i === 0 ? 'border-amber-500/30 bg-gradient-to-r from-amber-500/[0.03] to-transparent' : 'border-white/5'}`}>
                        <div className="text-2xl w-10 text-center">{medals[i] || <span style={{fontFamily:'JetBrains Mono, monospace'}} className="text-zinc-500 text-sm">#{i + 1}</span>}</div>
                        {m.image ? <img src={m.image} alt="" className="h-14 w-14 rounded-xl object-cover" /> : <div style={{color, fontFamily:'Instrument Serif, serif'}} className="h-14 w-14 rounded-xl bg-zinc-800 grid place-items-center text-xl">{m.nom.charAt(0)}</div>}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{m.nom}</div>
                          <div style={{color, fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase mt-0.5">{m.provider}</div>
                        </div>
                        <div className="text-right">
                          <div style={{fontFamily:'Instrument Serif, serif', filter: streamerMode ? 'blur(8px)' : 'none'}} className="text-xl text-emerald-400">{formatEUR(m.totalGain)}</div>
                          <div className="text-[10px] text-zinc-500 mt-0.5">{m.history?.length || 0} bonus</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {page === 'records' && <RecordsPage machines={machines} hunts={hunts} streamerMode={streamerMode} />}
          {page === 'stats' && <StatsPage machines={machines} hunts={hunts} config={config} streamerMode={streamerMode} />}

          {page === 'monthly' && (
            <div className="space-y-5">
              <h1 style={{fontFamily:'Instrument Serif, serif'}} className="text-3xl">Statistiques mensuelles</h1>
              <p className="text-sm text-zinc-500 -mt-3">13 derniers mois</p>
              <div className="bg-zinc-900/80 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        {['Mois','Profit','Sessions','Plus gros','Plus petit','Top Provider','Machines','Top Slot','Flop'].map((h) => (
                          <th key={h} style={{fontFamily:'JetBrains Mono, monospace'}} className="text-[10px] uppercase tracking-widest text-zinc-500 text-left px-4 py-3 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.map((d) => {
                        const profitCls = d.profit > 0 ? 'text-emerald-400' : d.profit < 0 ? 'text-rose-400' : 'text-zinc-500';
                        return (
                          <tr key={d.key} className="border-b border-white/5 hover:bg-zinc-800/30">
                            <td className="px-4 py-3 capitalize whitespace-nowrap">{d.label}</td>
                            <td style={{fontFamily:'JetBrains Mono, monospace', filter: streamerMode ? 'blur(8px)' : 'none'}} className={`px-4 py-3 font-bold ${profitCls}`}>{d.profit >= 0 ? '+' : ''}{formatEUR(d.profit)}</td>
                            <td className="px-4 py-3 text-zinc-400">{d.sessions}</td>
                            <td style={{fontFamily:'JetBrains Mono, monospace', filter: streamerMode ? 'blur(8px)' : 'none'}} className="px-4 py-3 text-emerald-400/80">{formatEURCompact(d.maxG)}</td>
                            <td style={{fontFamily:'JetBrains Mono, monospace', filter: streamerMode ? 'blur(8px)' : 'none'}} className="px-4 py-3 text-zinc-400">{formatEURCompact(d.minG)}</td>
                            <td className="px-4 py-3 text-zinc-300 whitespace-nowrap">{d.topProv}</td>
                            <td className="px-4 py-3 text-zinc-300">{d.playedCount}</td>
                            <td className="px-4 py-3 text-zinc-300 max-w-[160px] truncate">{d.topMachine}</td>
                            <td className="px-4 py-3 text-zinc-500 max-w-[160px] truncate">{d.flopMachine}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <MobileNav active={page} onNav={setPage} savedHuntsCount={savedHuntQueue.length} hasActiveHunt={!!currentHunt} />

      {currentHunt && !showHuntPanel && !bonusOpener && (
        <button onClick={() => setShowHuntPanel(true)} className="fixed bottom-20 lg:bottom-6 right-6 z-30 flex items-center gap-2 bg-amber-400 text-zinc-950 px-5 py-3 rounded-full shadow-2xl hover:bg-amber-300">
          <span className="font-medium">Hunt actif</span>
          <span style={{fontFamily:'JetBrains Mono, monospace'}} className="text-xs bg-zinc-950/20 px-2 py-0.5 rounded">{currentHunt.items.length}</span>
        </button>
      )}

      {showHuntPanel && currentHunt && (
        <HuntPanel hunt={currentHunt} machines={machines} onClose={() => setShowHuntPanel(false)} onUpdateCost={(v) => setCurrentHunt((h) => ({ ...h, cost: v }))} onUpdateItem={updateHuntItem} onRemoveItem={removeHuntItem} onAddMachine={() => setModal('addToHunt')} onAddRandomIA={addRandomIA} onClear={clearHunt} onClearEmpty={clearEmptyHuntLines} onSave={saveCurrentHunt} onProcess={processHunt} onReorder={reorderHuntItems}
          duration={huntStartTime ? formatDuration(huntDuration) : null}
          strictMode={strictMode} onToggleStrict={() => setStrictMode((s) => !s)}
          practiceMode={practiceMode} onTogglePractice={() => setPracticeMode((p) => !p)}
          onShare={() => {
            const txt = `🎰 Bonus Hunt en cours\n💰 Budget : ${currentHunt.cost}€\n🎁 ${currentHunt.items.filter(i => i.status === 'bonus').length} bonus à ouvrir\n⏱ ${formatDuration(huntDuration)}`;
            if (navigator.share) navigator.share({ text: txt }).catch(()=>{});
            else { navigator.clipboard.writeText(txt); toast('Copié !', 'success'); }
          }} />
      )}
      {modal === 'addMachine' && <AddMachineModal onClose={() => setModal(null)} onAdd={addMachine} />}
      {modal === 'detail' && detailId && (
        <MachineDetailModal machine={machines.find((m) => m.id === detailId)} allTags={allTags} streamerMode={streamerMode} onClose={() => { setModal(null); setDetailId(null); }} onUpdate={(patch) => updateMachine(detailId, patch)} onDelete={() => deleteMachine(detailId)} onDeleteGain={(idx) => deleteGain(detailId, idx)} onArchive={() => { toggleArchive(detailId); setModal(null); setDetailId(null); toast(machines.find((m) => m.id === detailId)?.archived ? 'Désarchivée' : 'Archivée', 'success'); }} />
      )}
      {modal === 'addToHunt' && (
        <AddToHuntModal machines={machines} excludeIds={new Set(currentHunt?.items.map((it) => it.machineId) || [])} onClose={() => setModal(null)} onSelect={(id) => { addToHunt(id, 0); setModal(null); }} />
      )}
      {modal === 'settings' && (
        <SettingsModal providerBetScales={providerBetScales} onSaveBets={(scales) => setProviderBetScales(scales)} theme={theme} onSetTheme={setTheme} accentColor={accentColor} onSetAccent={setAccentColor} onExport={exportData} onImport={importData} onClose={() => setModal(null)} />
      )}
      {modal === 'sync' && (
        <SyncModal syncKey={syncKey} syncStatus={syncStatus} onEnable={enableSync} onDisable={disableSync} onClose={() => setModal(null)} toast={toast} />
      )}
      {openerData && (
        <BonusOpener data={openerData} totalCount={bonusOpener.queue.length} currentIdx={bonusOpener.idx}
          gainValue={openerGain} onGainChange={setOpenerGain}
          casinoValue={openerCasino} onCasinoChange={setOpenerCasino}
          noteValue={openerNote} onNoteChange={setOpenerNote}
          onPrev={prevBonus} onNext={nextBonus} />
      )}
      {summary && <SummaryModal summary={summary} machines={machines} streamerMode={streamerMode} onClose={() => setSummary(null)} />}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <SlotTrackerApp />
    </ToastProvider>
  );
}
