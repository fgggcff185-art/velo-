import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Radar,
  Printer,
  Globe,
  Send,
  User,
  Swords,
  Video,
  Grid3X3,
  Target,
  Mic,
  Volume2,
  Maximize2,
  Minimize2,
  Eraser,
  Save,
  FolderOpen,
  Trash2,
  Timer,
  Copy,
} from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';
import { markdownToHtml } from '../../services/markdownLite';

/**
 * DAFB — Data Analyst Football (ScoutAI Ultimate Pro)
 * Tabs: Player profiling · Video telestration · Set-piece designer · xG lab
 * Plus: voice assistant (STT), AI voice briefing (TTS), BigBallSports live data,
 * bilingual scouting reports and PDF export.
 */

const BBS_KEY = 'bbs_live_00000KI1fUhhElfhwG6An5NkQ7cPb63kssyChosysdRKKCDP';
const BBS_BASE = 'https://api.bigballsdata.com/v1';

const POSITIONS = ['ST', 'RW', 'LW', 'CAM', 'CM', 'CDM', 'CB', 'LB', 'RB', 'GK'] as const;
const FORMATIONS = ['4-3-3', '4-2-3-1', '3-5-2', '4-4-2'] as const;
const PLAYSTYLES = ['Gegenpressing', 'Tiki-Taka', 'Counter Attack', 'Low Block'] as const;

interface PlayerData {
  name: string;
  club: string;
  age: number;
  position: string;
  foot: 'Right' | 'Left' | 'Both';
  shooting: number;
  passing: number;
  dribbling: number;
  defense: number;
  physical: number;
}

const DEFAULT_PLAYER: PlayerData = {
  name: 'New Player',
  club: '',
  age: 24,
  position: 'ST',
  foot: 'Right',
  shooting: 80,
  passing: 70,
  dribbling: 75,
  defense: 50,
  physical: 72,
};

const AXES = [
  { key: 'shooting' as const, en: 'Shooting', ar: 'التسديد' },
  { key: 'passing' as const, en: 'Passing', ar: 'التمرير' },
  { key: 'dribbling' as const, en: 'Dribbling', ar: 'المراوغة' },
  { key: 'defense' as const, en: 'Defense', ar: 'الدفاع' },
  { key: 'physical' as const, en: 'Physical', ar: 'البدني' },
];

const WEIGHTS: Record<string, [number, number, number, number, number]> = {
  ST: [0.45, 0.15, 0.2, 0.05, 0.15],
  RW: [0.3, 0.25, 0.3, 0.05, 0.1],
  LW: [0.3, 0.25, 0.3, 0.05, 0.1],
  CAM: [0.2, 0.4, 0.25, 0.05, 0.1],
  CM: [0.15, 0.35, 0.2, 0.15, 0.15],
  CDM: [0.05, 0.25, 0.1, 0.4, 0.2],
  CB: [0.03, 0.1, 0.05, 0.52, 0.3],
  LB: [0.05, 0.2, 0.2, 0.3, 0.25],
  RB: [0.05, 0.2, 0.2, 0.3, 0.25],
  GK: [0.05, 0.15, 0.1, 0.4, 0.3],
};

function overall(p: PlayerData): number {
  const w = WEIGHTS[p.position] || [0.2, 0.2, 0.2, 0.2, 0.2];
  return Math.round(
    p.shooting * w[0] + p.passing * w[1] + p.dribbling * w[2] + p.defense * w[3] + p.physical * w[4]
  );
}

function marketValue(p: PlayerData): number {
  const ovr = overall(p);
  const base = Math.pow(Math.max(0, ovr - 45) / 54, 2.2) * 140;
  const ageFactor =
    p.age <= 21 ? 1.25 : p.age <= 24 ? 1.35 : p.age <= 27 ? 1.15 : p.age <= 30 ? 0.8 : p.age <= 33 ? 0.4 : 0.15;
  const posBonus = ['ST', 'RW', 'LW', 'CAM'].includes(p.position) ? 1.12 : 1;
  return Math.max(0.05, +(base * ageFactor * posBonus).toFixed(1));
}

function weeklyWage(valueM: number, ovr: number): number {
  return Math.round((valueM * 1000_000 * 0.00042 + ovr * 380) / 100) * 100;
}

const FIT_MATRIX: Record<string, Record<string, number>> = {
  '4-3-3': { ST: 95, RW: 92, LW: 92, CAM: 82, CM: 85, CDM: 84, CB: 88, LB: 86, RB: 86, GK: 90 },
  '4-2-3-1': { ST: 90, RW: 88, LW: 88, CAM: 95, CM: 86, CDM: 88, CB: 87, LB: 85, RB: 85, GK: 90 },
  '3-5-2': { ST: 88, RW: 78, LW: 78, CAM: 84, CM: 93, CDM: 88, CB: 90, LB: 80, RB: 80, GK: 88 },
  '4-4-2': { ST: 92, RW: 84, LW: 84, CAM: 78, CM: 90, CDM: 82, CB: 89, LB: 88, RB: 88, GK: 89 },
};

const STYLE_BONUS: Record<string, Record<string, number>> = {
  Gegenpressing: { defense: 1.4, physical: 1.2, dribbling: 0.8, passing: 1.0, shooting: 0.9 },
  'Tiki-Taka': { passing: 1.5, dribbling: 1.1, defense: 0.6, physical: 0.7, shooting: 0.9 },
  'Counter Attack': { dribbling: 1.3, shooting: 1.2, physical: 1.0, passing: 0.9, defense: 0.8 },
  'Low Block': { defense: 1.5, physical: 1.3, passing: 0.8, dribbling: 0.6, shooting: 0.7 },
};

function tacticalFit(p: PlayerData, formation: string, style: string): number {
  const base = FIT_MATRIX[formation]?.[p.position] ?? 75;
  const bonus = STYLE_BONUS[style] || {};
  const weighted =
    (p.shooting * (bonus.shooting || 1) +
      p.passing * (bonus.passing || 1) +
      p.dribbling * (bonus.dribbling || 1) +
      p.defense * (bonus.defense || 1) +
      p.physical * (bonus.physical || 1)) /
    5;
  const styleScore = 50 + (weighted - 70) * 1.4;
  return Math.max(35, Math.min(99, Math.round(base * 0.6 + styleScore * 0.4)));
}

type Pt = { x: number; y: number };
type Shape =
  | { kind: 'block'; pts: Pt[] }
  | { kind: 'lane'; open: boolean; a: Pt; b: Pt }
  | { kind: 'offside'; y: number };

function drawRadar(
  canvas: HTMLCanvasElement,
  players: Array<{ data: PlayerData; color: string; fill: string }>,
  lang: 'en' | 'ar'
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 300;
  const H = canvas.clientHeight || 250;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H / 2 + 4;
  const radius = Math.min(W, H) / 2 - 30;
  const n = AXES.length;
  for (let ring = 1; ring <= 4; ring++) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const r = (radius * ring) / 4;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(124,138,160,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
    ctx.strokeStyle = 'rgba(124,138,160,0.25)';
    ctx.stroke();
    ctx.fillStyle = '#9aa6ba';
    ctx.font = '10px Segoe UI';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lang === 'ar' ? AXES[i].ar : AXES[i].en, cx + (radius + 17) * Math.cos(angle), cy + (radius + 14) * Math.sin(angle));
  }
  for (const p of players) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const axis = AXES[i % n];
      const v = p.data[axis.key] / 99;
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const x = cx + radius * v * Math.cos(angle);
      const y = cy + radius * v * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = p.fill;
    ctx.fill();
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function pitchCoords(position: string, style: string): { x: number; y: number } {
  const attacking = style === 'Counter Attack' ? 8 : 0;
  const base: Record<string, [number, number]> = {
    GK: [6, 50], CB: [20, 50], LB: [22, 15], RB: [22, 85],
    CDM: [35, 50], CM: [48, 50], CAM: [65, 50],
    LW: [68, 15], RW: [68, 85], ST: [82 + attacking, 50],
  };
  const [x, y] = base[position] || [50, 50];
  return { x, y };
}

/** Simple xG heuristic from shot position (pitch coords 0-100, goal at x=100,y=50) */
function shotXG(x: number, y: number): number {
  const dx = 100 - x;
  const dy = 50 - y;
  let dist = Math.sqrt(dx * dx + dy * dy * 1.6);
  if (x > 92 && Math.abs(dy) < 20) dist *= 0.6;
  const xg = 1.05 * Math.exp(-dist / 14);
  return Math.max(0.01, Math.min(0.95, +xg.toFixed(2)));
}

type DafbTab = 'player' | 'video' | 'setpieces' | 'xg' | 'sim' | 'saved';

export function DAFBPanel() {
  const showToast = useUIStore((s) => s.showToast);
  const { aiPanelMax, toggleAIPanelMax } = useUIStore();
  const [lang, setLang] = useState<'en' | 'ar'>('en');
  const [tab, setTab] = useState<DafbTab>('player');
  const [h2h, setH2h] = useState(false);
  const [playerA, setPlayerA] = useState<PlayerData>({ ...DEFAULT_PLAYER, name: 'Player A' });
  const [playerB, setPlayerB] = useState<PlayerData>({ ...DEFAULT_PLAYER, name: 'Player B', position: 'CM' });
  const [formation, setFormation] = useState<string>('4-3-3');
  const [style, setStyle] = useState<string>('Gegenpressing');
  const [apiStatus, setApiStatus] = useState<string>('');
  const [liveMatches, setLiveMatches] = useState<string>('');
  const [listening, setListening] = useState(false);
  const radarRef = useRef<HTMLCanvasElement>(null);

  const players = h2h
    ? [
        { data: playerA, color: '#2dd4bf', fill: 'rgba(45,212,191,0.18)' },
        { data: playerB, color: '#38bdf8', fill: 'rgba(56,189,248,0.16)' },
      ]
    : [{ data: playerA, color: '#8b5cf6', fill: 'rgba(139,92,246,0.22)' }];

  useEffect(() => {
    if (radarRef.current && tab === 'player') drawRadar(radarRef.current, players, lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerA, playerB, h2h, lang, tab]);

  const ovrA = overall(playerA);
  const valueA = marketValue(playerA);
  const fitA = tacticalFit(playerA, formation, style);

  // ===== Voice assistant =====
  const recognitionRef = useRef<any>(null);
  const voiceToggle = () => {
    const W = window as any;
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!SR) {
      showToast('Speech recognition is not available in this environment', 'error');
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = lang === 'ar' ? 'ar-SA' : 'en-US';
    rec.interimResults = false;
    rec.onresult = (ev: any) => {
      const transcript = Array.from(ev.results as ArrayLike<any>)
        .map((r: any) => r[0].transcript)
        .join(' ');
      if (transcript.trim()) {
        void import('../../store/useAIStore').then(({ useAIStore }) =>
          useAIStore.getState().askAI(`[Voice tactical query] ${transcript}`)
        );
        showToast(`🎙 "${transcript.slice(0, 60)}"`, 'success');
      }
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

  const speakReport = () => {
    const synth = window.speechSynthesis;
    if (!synth) {
      showToast('TTS not available', 'error');
      return;
    }
    synth.cancel();
    const plain = reportText.replace(/[#*`>-]/g, '');
    const utter = new SpeechSynthesisUtterance(plain);
    utter.lang = lang === 'ar' ? 'ar-SA' : 'en-US';
    utter.rate = 1;
    synth.speak(utter);
    showToast('🔊 AI voice briefing started', 'success');
  };

  // ===== BigBallSports =====
  const checkApi = async () => {
    setApiStatus('Checking BigBallSports account…');
    try {
      const res = await window.velo.netFetch(`${BBS_BASE}/user/me`, { Authorization: `Bearer ${BBS_KEY}` });
      if (res.error) setApiStatus(`✗ ${res.error.slice(0, 140)}`);
      else setApiStatus(`✓ API OK — ${(res.body || '').slice(0, 120)}`);
    } catch (e) {
      setApiStatus(`✗ ${String(e).slice(0, 140)}`);
    }
  };

  const fetchMatches = async (league: string) => {
    setApiStatus(`Fetching ${league} matches…`);
    try {
      const res = await window.velo.netFetch(`${BBS_BASE}/matches?league=${league}&limit=10`, {
        Authorization: `Bearer ${BBS_KEY}`,
      });
      if (res.error) {
        setApiStatus(`✗ ${res.error.slice(0, 160)}`);
        return;
      }
      const body = res.body || '';
      setLiveMatches(body.slice(0, 4000));
      setApiStatus(`✓ ${league} data loaded (${Math.round(body.length / 100)} KB)`);
    } catch (e) {
      setApiStatus(`✗ ${String(e).slice(0, 140)}`);
    }
  };

  const sendToAI = (extra?: string) => {
    void import('../../store/useAIStore').then(async ({ useAIStore }) => {
      const data = h2h
        ? `Player A: ${JSON.stringify(playerA)} (overall ${overall(playerA)})\nPlayer B: ${JSON.stringify(
            playerB
          )} (overall ${overall(playerB)})`
        : `Player: ${JSON.stringify(playerA)} (overall ${overall(playerA)})`;
      const matches = liveMatches ? `\n\nLive match data:\n${liveMatches}` : '';
      await useAIStore
        .getState()
        .askAI(
          `Act as an elite football data analyst & scout. ${extra || 'Analyze this data and give a professional verdict (strengths, weaknesses, best role, negotiation advice):'}\n\n${data}${matches}\n\nFormation: ${formation} · Style: ${style} · Market value: €${valueA}M · Tactical fit: ${fitA}%`
        );
      showToast('Sent to AI — open the Chat tab', 'success');
    });
  };

  const reportText = useMemo(() => {
    const p = playerA;
    if (lang === 'ar') {
      return [
        `# تقرير كشافة — ${p.name}`,
        `النادي: ${p.club || '—'} · العمر: ${p.age} · المركز: ${p.position} · القدم: ${p.foot === 'Right' ? 'اليمنى' : p.foot === 'Left' ? 'اليسرى' : 'كلتاهما'}`,
        ``,
        `**التقييم العام:** ${ovrA} · **القيمة السوقية التقديرية:** €${valueA} مليون`,
        `**الراتب الأسبوعي المقترح:** €${weeklyWage(valueA, ovrA).toLocaleString()}`,
        `**الانسجام التكتيكي:** ${fitA}% مع خطة ${formation} وأسلوب ${style}`,
        ``,
        `## المؤشرات`,
        ...AXES.map((a) => `- ${a.ar}: ${p[a.key]}`),
        ``,
        `## التوصية`,
        fitA >= 80
          ? `اللاعب مناسب جدًا للخطة المطلوبة — يُنصح بالمتابعة والتفاوض الفوري مع وكيل أعماله.`
          : fitA >= 65
          ? `اللاعب مناسب مع تحفظات — يُنصح بتجربة تكتيكية في مراكز بديلة قبل التعاقد.`
          : `الانسجام ضعيف مع الخطة الحالية — يُنصح بمراجعة بدائل أخرى أو تعديل الأسلوب.`,
      ].join('\n');
    }
    return [
      `# Scouting Report — ${p.name}`,
      `Club: ${p.club || '—'} · Age: ${p.age} · Position: ${p.position} · Foot: ${p.foot}`,
      ``,
      `**Overall:** ${ovrA} · **Estimated market value:** €${valueA}M`,
      `**Suggested weekly wage:** €${weeklyWage(valueA, ovrA).toLocaleString()}`,
      `**Tactical fit:** ${fitA}% with ${formation} / ${style}`,
      ``,
      `## Attributes`,
      ...AXES.map((a) => `- ${a.en}: ${p[a.key]}`),
      ``,
      `## Verdict`,
      fitA >= 80
        ? `Excellent fit for the target system — proceed to immediate negotiation with the player's agent.`
        : fitA >= 65
        ? `Good fit with reservations — trial in alternative roles before committing.`
        : `Poor tactical fit — consider alternative targets or a different playing style.`,
    ].join('\n');
  }, [playerA, ovrA, valueA, fitA, formation, style, lang]);

  const exportPdf = () => {
    document.body.classList.add('printing-dafb');
    setTimeout(() => {
      window.print();
      setTimeout(() => document.body.classList.remove('printing-dafb'), 400);
    }, 60);
  };

  const PlayerForm = ({ p, set }: { p: PlayerData; set: (np: PlayerData) => void }) => (
    <div className="dafb-form">
      <div className="dafb-row">
        <input value={p.name} onChange={(e) => set({ ...p, name: e.target.value })} placeholder="Name" />
        <input value={p.club} onChange={(e) => set({ ...p, club: e.target.value })} placeholder="Club" />
      </div>
      <div className="dafb-row">
        <input type="number" min={15} max={45} value={p.age} onChange={(e) => set({ ...p, age: Number(e.target.value) })} title="Age" />
        <select value={p.position} onChange={(e) => set({ ...p, position: e.target.value })}>
          {POSITIONS.map((pos) => (
            <option key={pos}>{pos}</option>
          ))}
        </select>
        <select value={p.foot} onChange={(e) => set({ ...p, foot: e.target.value as PlayerData['foot'] })}>
          <option value="Right">Right foot</option>
          <option value="Left">Left foot</option>
          <option value="Both">Both feet</option>
        </select>
      </div>
      {AXES.map((a) => (
        <div className="dafb-slider" key={a.key}>
          <span>{lang === 'ar' ? a.ar : a.en}</span>
          <input
            type="range"
            min={40}
            max={99}
            value={p[a.key]}
            onChange={(e) => set({ ...p, [a.key]: Number(e.target.value) })}
          />
          <b>{p[a.key]}</b>
        </div>
      ))}
    </div>
  );

  const pitch = pitchCoords(playerA.position, style);
  const tabs: Array<{ id: DafbTab; label: string }> = [
    { id: 'player', label: '👤 Player' },
    { id: 'video', label: '🎥 Video' },
    { id: 'setpieces', label: '🎯 Set-Pieces' },
    { id: 'xg', label: '📊 xG Lab' },
    { id: 'sim', label: '⚔ Formations' },
    { id: 'saved', label: '💾 Saved' },
  ];

  return (
    <div className="dafb">
      <div className="dafb-toolbar">
        <button className="chip" onClick={toggleAIPanelMax} title="Fullscreen panel">
          {aiPanelMax ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
        <button className={h2h ? 'chip on' : 'chip'} onClick={() => setH2h(!h2h)}>
          <Swords size={12} /> {h2h ? 'H2H' : 'Single'}
        </button>
        <button className="chip" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>
          <Globe size={12} /> {lang === 'en' ? 'ع' : 'EN'}
        </button>
        <button className={`chip ${listening ? 'on' : ''}`} onClick={voiceToggle} title="Voice tactical assistant">
          <Mic size={12} /> {listening ? 'Listening…' : 'Voice'}
        </button>
        <button className="chip" onClick={speakReport} title="AI voice briefing (TTS)">
          <Volume2 size={12} /> Brief
        </button>
        <div style={{ flex: 1 }} />
        <span className="dafb-ovr">OVR {ovrA}</span>
        <span className="dafb-value">€{valueA}M</span>
        <span className="dafb-fit">{fitA}%</span>
      </div>

      <div className="dafb-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`dafb-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== PLAYER TAB ===== */}
      {tab === 'player' && (
        <>
          <div className="dafb-grid">
            <div>
              <div className="dafb-card">
                <h4>
                  <User size={13} /> Player A
                </h4>
                <PlayerForm p={playerA} set={setPlayerA} />
              </div>
              {h2h && (
                <div className="dafb-card">
                  <h4>
                    <User size={13} /> Player B
                  </h4>
                  <PlayerForm p={playerB} set={setPlayerB} />
                </div>
              )}
              <div className="dafb-card">
                <h4>Tactical setup</h4>
                <div className="dafb-row">
                  <select value={formation} onChange={(e) => setFormation(e.target.value)}>
                    {FORMATIONS.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                  <select value={style} onChange={(e) => setStyle(e.target.value)}>
                    {PLAYSTYLES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div>
              <div className="dafb-card">
                <h4>
                  <Radar size={13} /> Radar {h2h ? '(A vs B)' : ''}
                </h4>
                <canvas ref={radarRef} className="dafb-radar" />
              </div>
              <div className="dafb-card">
                <h4>Pitch map — {playerA.position}</h4>
                <svg viewBox="0 0 100 64" className="dafb-pitch">
                  <rect x="0" y="0" width="100" height="64" fill="rgba(103,232,165,0.06)" stroke="rgba(103,232,165,0.35)" />
                  <line x1="50" y1="0" x2="50" y2="64" stroke="rgba(103,232,165,0.35)" />
                  <circle cx="50" cy="32" r="8" fill="none" stroke="rgba(103,232,165,0.35)" />
                  <rect x="0" y="18" width="12" height="28" fill="none" stroke="rgba(103,232,165,0.35)" />
                  <rect x="88" y="18" width="12" height="28" fill="none" stroke="rgba(103,232,165,0.35)" />
                  <circle cx={pitch.x} cy={pitch.y * 0.64} r="2.6" fill="#8b5cf6">
                    <animate attributeName="r" values="2.2;3;2.2" dur="2s" repeatCount="indefinite" />
                  </circle>
                  <text x={pitch.x} y={pitch.y * 0.64 - 4} fill="#e9eef7" fontSize="3.4" textAnchor="middle">
                    {playerA.name.slice(0, 14)}
                  </text>
                </svg>
                <p className="settings-hint">
                  Wage: €{weeklyWage(valueA, ovrA).toLocaleString()}/week · Contract: {playerA.age < 26 ? 5 : 3} years
                </p>
              </div>
            </div>
          </div>

          <div className="dafb-card">
            <h4>BigBallSports live data</h4>
            <div className="dafb-row">
              <button className="btn-ghost small" onClick={checkApi}>
                Check account
              </button>
              {['EPL', 'UCL', 'La Liga', 'Serie A'].map((lg) => (
                <button key={lg} className="btn-ghost small" onClick={() => fetchMatches(lg)}>
                  {lg}
                </button>
              ))}
              <button className="btn-primary small" onClick={() => sendToAI()}>
                <Send size={12} /> Analyze with AI
              </button>
            </div>
            {apiStatus && <p className="settings-hint">{apiStatus}</p>}
            {liveMatches && <pre className="dafb-live">{liveMatches}</pre>}
          </div>

          <div className="dafb-card">
            <div className="dafb-row" style={{ alignItems: 'center' }}>
              <h4 style={{ flex: 1, margin: 0 }}>Scouting report ({lang === 'ar' ? 'بالعربية' : 'English'})</h4>
              <button className="btn-ghost small" onClick={speakReport} title="AI voice briefing">
                <Volume2 size={12} /> Voice brief
              </button>
              <button className="btn-primary small" onClick={exportPdf}>
                <Printer size={12} /> Export PDF
              </button>
            </div>
            <div className="md-preview dafb-report" dangerouslySetInnerHTML={{ __html: markdownToHtml(reportText) }} />
          </div>
        </>
      )}

      {/* ===== VIDEO TAB ===== */}
      {tab === 'video' && <VideoAnalysis lang={lang} onAnalyze={(notes) => sendToAI(`VIDEO ANALYSIS NOTES:\n${notes}\n\nGenerate: defensive block assessment, passing-lane map, repeated patterns, killer gaps, and an AI counter-tactics plan against this opponent.`)} />}

      {/* ===== SET PIECES TAB ===== */}
      {tab === 'setpieces' && <SetPieceDesigner lang={lang} />}

      {/* ===== XG TAB ===== */}
      {tab === 'xg' && <XgLab lang={lang} onSend={(text) => sendToAI(text)} />}

      {/* ===== FORMATION CLASH TAB ===== */}
      {tab === 'sim' && <FormationClash lang={lang} />}

      {/* ===== SAVED TAB ===== */}
      {tab === 'saved' && (
        <SavedAnalyses
          reportText={reportText}
          lang={lang}
          playerA={playerA}
          ovrA={ovrA}
          valueA={valueA}
          fitA={fitA}
          formation={formation}
          style={style}
        />
      )}
    </div>
  );
}

// ================= VIDEO ANALYSIS =================
interface Marker {
  t: number;
  kind: 'attack' | 'gap' | 'pattern' | 'setpiece';
  label: string;
}

const MARKER_COLORS: Record<Marker['kind'], string> = {
  attack: '#67e8a5',
  gap: '#f76e6e',
  pattern: '#38bdf8',
  setpiece: '#f5d76e',
};

function VideoAnalysis({ lang, onAnalyze }: { lang: 'en' | 'ar'; onAnalyze: (notes: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [src, setSrc] = useState<string>('');
  const [isYouTube, setIsYouTube] = useState(false);
  const [tool, setTool] = useState<'block' | 'lane-g' | 'lane-r' | 'offside' | 'erase'>('block');
  const [notes, setNotes] = useState('');
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [videoTime, setVideoTime] = useState(0);
  const [videoDur, setVideoDur] = useState(0);
  const shapesRef = useRef<Shape[]>([]);
  const currentRef = useRef<Shape | null>(null);
  const redrawRef = useRef<() => void>(() => undefined);

  const redraw = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || isYouTube) return;
    const dpr = window.devicePixelRatio || 1;
    const W = video.clientWidth;
    const H = video.clientHeight;
    if (!W || !H) return;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const all: Shape[] = currentRef.current ? [...shapesRef.current, currentRef.current] : shapesRef.current;
    for (const s of all) {
      if (s.kind === 'block' && s.pts.length > 1) {
        ctx.beginPath();
        s.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * W, p.y * H) : ctx.lineTo(p.x * W, p.y * H)));
        if (s.pts.length > 2) ctx.closePath();
        ctx.fillStyle = 'rgba(247,110,110,0.18)';
        ctx.fill();
        ctx.strokeStyle = '#f76e6e';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (s.kind === 'lane') {
        ctx.beginPath();
        ctx.moveTo(s.a.x * W, s.a.y * H);
        ctx.lineTo(s.b.x * W, s.b.y * H);
        ctx.strokeStyle = s.open ? '#67e8a5' : '#f76e6e';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else if (s.kind === 'offside') {
        ctx.beginPath();
        ctx.moveTo(0, s.y * H);
        ctx.lineTo(W, s.y * H);
        ctx.strokeStyle = '#f5d76e';
        ctx.setLineDash([8, 5]);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  };
  redrawRef.current = redraw;

  const toRel = (e: React.MouseEvent): Pt => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };

  const onDown = (e: React.MouseEvent) => {
    const p = toRel(e);
    if (tool === 'block') {
      currentRef.current = { kind: 'block', pts: [p, p] };
    } else if (tool === 'offside') {
      shapesRef.current = [...shapesRef.current, { kind: 'offside', y: p.y }];
    } else if (tool === 'erase') {
      shapesRef.current = shapesRef.current.slice(0, -1);
    } else {
      currentRef.current = { kind: 'lane', open: tool === 'lane-g', a: p, b: p };
    }
    redrawRef.current();
  };

  const onMove = (e: React.MouseEvent) => {
    const cur = currentRef.current;
    if (!cur) return;
    const p = toRel(e);
    if (cur.kind === 'block') cur.pts[cur.pts.length - 1] = p;
    else if (cur.kind === 'lane') cur.b = p;
    redrawRef.current();
  };

  const onUp = () => {
    const cur = currentRef.current;
    if (cur) {
      if (cur.kind === 'block' && cur.pts.length >= 2) shapesRef.current = [...shapesRef.current, cur];
      else if (cur.kind === 'lane') shapesRef.current = [...shapesRef.current, cur];
      currentRef.current = null;
      redrawRef.current();
    }
  };

  const setSource = (raw: string) => {
    const url = raw.trim();
    if (!url) return;
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/);
    if (yt) {
      setIsYouTube(true);
      setSrc(`https://www.youtube.com/embed/${yt[1]}`);
    } else if (url.endsWith('.m3u8')) {
      showToastSafe('HLS streams need a player that supports .m3u8 — trying direct playback');
      setIsYouTube(false);
      setSrc(url);
    } else {
      setIsYouTube(false);
      setSrc(url);
    }
  };

  const addMarker = (kind: Marker['kind']) => {
    const t = isYouTube ? 0 : videoRef.current?.currentTime || 0;
    setMarkers((m) => [...m, { t, kind, label: `${kind} @ ${fmtTime(t)}` }]);
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || isYouTube) {
      showToastSafe('Frame capture works with local files / direct URLs');
      return;
    }
    const c = document.createElement('canvas');
    c.width = video.videoWidth || 1280;
    c.height = video.videoHeight || 720;
    c.getContext('2d')?.drawImage(video, 0, 0, c.width, c.height);
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = `velo-frame-${Math.round(video.currentTime * 10) / 10}s.png`;
    a.click();
    showToastSafe('Frame captured (PNG downloaded)');
  };

  const tools: Array<{ id: typeof tool; label: string }> = [
    { id: 'block', label: lang === 'ar' ? 'الكتلة الدفاعية' : 'Def. block' },
    { id: 'lane-g', label: lang === 'ar' ? 'تمريرة متاحة' : 'Lane ✓' },
    { id: 'lane-r', label: lang === 'ar' ? 'تمريرة مراقبة' : 'Lane ✗' },
    { id: 'offside', label: lang === 'ar' ? 'خط التسلل' : 'Offside' },
    { id: 'erase', label: lang === 'ar' ? 'تراجع' : 'Undo' },
  ];

  const fmtTime = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className="dafb-card">
      <h4>
        <Video size={13} /> Match video — telestration & timeline
      </h4>
      <div className="dafb-row">
        <input
          type="file"
          accept=".mp4,.mkv,.mov,.webm"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setIsYouTube(false);
              setSrc(URL.createObjectURL(f));
            }
          }}
        />
        <input
          style={{ flex: 1 }}
          placeholder="…or paste a YouTube / direct stream URL"
          onKeyDown={(e) => {
            if (e.key === 'Enter') setSource((e.target as HTMLInputElement).value);
          }}
        />
      </div>
      {src ? (
        isYouTube ? (
          <div className="dafb-video-wrap" style={{ aspectRatio: '16/9' }}>
            <iframe src={src} title="match" allow="autoplay; encrypted-media" style={{ width: '100%', height: '100%', border: 'none' }} />
          </div>
        ) : (
          <div className="dafb-video-wrap">
            <video
              ref={videoRef}
              src={src}
              controls
              crossOrigin="anonymous"
              onLoadedData={() => redrawRef.current()}
              onTimeUpdate={(e) => setVideoTime((e.target as HTMLVideoElement).currentTime)}
              onLoadedMetadata={(e) => setVideoDur((e.target as HTMLVideoElement).duration)}
            />
            <canvas
              ref={canvasRef}
              className="dafb-overlay"
              onMouseDown={onDown}
              onMouseMove={onMove}
              onMouseUp={onUp}
              onMouseLeave={onUp}
              onDoubleClick={onUp}
            />
          </div>
        )
      ) : (
        <div className="split-empty">Load a local match clip or a YouTube / stream URL to start</div>
      )}

      {/* Timeline */}
      {src && !isYouTube && (
        <div className="dafb-timeline">
          <div className="dafb-timeline-bar">
            <div className="dafb-timeline-track" onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const t = ((e.clientX - rect.left) / rect.width) * (videoDur || 0);
              if (videoRef.current) videoRef.current.currentTime = t;
            }}>
              {markers.map((m, i) => (
                <span
                  key={i}
                  className="dafb-marker"
                  style={{ left: `${videoDur ? (m.t / videoDur) * 100 : 0}%`, background: MARKER_COLORS[m.kind] }}
                  title={`${m.label} — click to jump`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (videoRef.current) videoRef.current.currentTime = m.t;
                  }}
                />
              ))}
            </div>
          </div>
          <div className="dafb-row" style={{ marginTop: 6 }}>
            <span className="settings-hint" style={{ margin: 0 }}>
              <Timer size={11} style={{ verticalAlign: -2 }} /> {fmtTime(videoTime)} / {fmtTime(videoDur)}
            </span>
            {(['attack', 'gap', 'pattern', 'setpiece'] as const).map((k) => (
              <button key={k} className="chip" onClick={() => addMarker(k)}>
                <span style={{ color: MARKER_COLORS[k] }}>●</span> {k}
              </button>
            ))}
            <button className="chip" onClick={captureFrame}>
              📸 Frame
            </button>
          </div>
          {markers.length > 0 && (
            <div className="dafb-marker-list">
              {markers.map((m, i) => (
                <div key={i} className="dafb-marker-row">
                  <button
                    className="chip"
                    style={{ borderColor: MARKER_COLORS[m.kind] }}
                    onClick={() => {
                      if (videoRef.current) videoRef.current.currentTime = m.t;
                    }}
                  >
                    {fmtTime(m.t)}
                  </button>
                  <span style={{ color: MARKER_COLORS[m.kind] }}>● {m.kind}</span>
                  <button
                    className="icon-btn"
                    style={{ marginLeft: 'auto' }}
                    title="Remove marker"
                    onClick={() => setMarkers((s) => s.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="dafb-row" style={{ marginTop: 8 }}>
        {tools.map((t) => (
          <button key={t.id} className={`chip ${tool === t.id ? 'on' : ''}`} onClick={() => setTool(t.id)}>
            {t.label}
          </button>
        ))}
        <button
          className="chip"
          onClick={() => {
            shapesRef.current = [];
            redrawRef.current();
          }}
        >
          <Eraser size={11} /> Clear all
        </button>
        <button
          className="icon-btn"
          title="Copy tactical notes"
          onClick={() => {
            if (notes.trim()) {
              void window.velo.clipboardWrite(notes);
              showToastSafe('Notes copied');
            }
          }}
        >
          <Copy size={13} />
        </button>
      </div>
      <textarea
        className="snippets-editor"
        rows={3}
        placeholder={
          lang === 'ar'
            ? 'ملاحظاتك التكتيكية: نمط الضغط، الجمل المتكررة، الثغرات…'
            : 'Tactical notes: press style, repeated patterns, killer gaps…'
        }
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <button
        className="btn-primary small"
        disabled={!notes.trim()}
        onClick={() =>
          onAnalyze(
            `${notes}\n\nTelestration shapes drawn: ${shapesRef.current.map((s) => s.kind).join(', ') || 'none'}\nMarkers: ${markers.map((m) => `${m.kind}@${fmtTime(m.t)}`).join(', ') || 'none'}`
          )
        }
      >
        <Send size={12} /> Generate AI counter-tactics plan
      </button>
    </div>
  );
}

function showToastSafe(text: string) {
  void import('../../store/useUIStore').then((m) => m.useUIStore.getState().showToast(text, 'info'));
}

// ================= FORMATION CLASH SIMULATOR =================
const THIRD_MATRIX: Record<string, number> = {
  '4-3-3': 0.9, '4-2-3-1': 0.85, '3-5-2': 0.8, '4-4-2': 0.75,
};

function FormationClash({ lang }: { lang: 'en' | 'ar' }) {
  const [ours, setOurs] = useState('4-3-3');
  const [oursStyle, setOursStyle] = useState('Gegenpressing');
  const [theirs, setTheirs] = useState('3-5-2');
  const [theirStyle, setTheirStyle] = useState('Low Block');

  // heuristic thirds dominance
  const atk = (f: string, s: string) =>
    (THIRD_MATRIX[f] || 0.8) * 60 + (STYLE_BONUS[s]?.shooting || 1) * 18 + (STYLE_BONUS[s]?.dribbling || 1) * 10;
  const mid = (f: string, s: string) =>
    (f === '3-5-2' ? 1.15 : f === '4-3-3' ? 1.05 : f === '4-2-3-1' ? 1.0 : 0.9) * 45 +
    (STYLE_BONUS[s]?.passing || 1) * 22;
  const def = (f: string, s: string) =>
    (f === '4-4-2' ? 1.1 : f === '4-2-3-1' ? 1.0 : 0.95) * 45 + (STYLE_BONUS[s]?.defense || 1) * 26;

  const oursAtk = atk(ours, oursStyle);
  const theirAtk = atk(theirs, theirStyle);
  const oursMid = mid(ours, oursStyle);
  const theirMid = mid(theirs, theirStyle);
  const oursDef = def(ours, oursStyle);
  const theirDef = def(theirs, theirStyle);

  const pct = (a: number, b: number) => Math.round((a / (a + b)) * 100);

  const Bar = ({ label, oursPct }: { label: string; oursPct: number }) => (
    <div className="dafb-slider">
      <span style={{ width: 70 }}>{label}</span>
      <div className="clash-bar">
        <div className="clash-ours" style={{ width: `${oursPct}%` }} />
        <div className="clash-theirs" style={{ width: `${100 - oursPct}%` }} />
      </div>
      <b style={{ width: 64, textAlign: 'center' }}>
        {oursPct}% / {100 - oursPct}%
      </b>
    </div>
  );

  const overallOurs = pct(oursAtk + oursMid + oursDef, theirAtk + theirMid + theirDef);

  return (
    <div className="dafb-card">
      <h4>
        <Swords size={13} /> Formation clash simulator
      </h4>
      <div className="dafb-row">
        <div style={{ flex: 1 }}>
          <label className="settings-hint">Our team</label>
          <select value={ours} onChange={(e) => setOurs(e.target.value)}>
            {FORMATIONS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <select style={{ marginTop: 4 }} value={oursStyle} onChange={(e) => setOursStyle(e.target.value)}>
            {PLAYSTYLES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', fontWeight: 800, fontSize: 18, color: 'var(--accent)' }}>
          VS
        </div>
        <div style={{ flex: 1 }}>
          <label className="settings-hint">Opponent</label>
          <select value={theirs} onChange={(e) => setTheirs(e.target.value)}>
            {FORMATIONS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <select style={{ marginTop: 4 }} value={theirStyle} onChange={(e) => setTheirStyle(e.target.value)}>
            {PLAYSTYLES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <Bar label="Attack" oursPct={pct(oursAtk, theirAtk)} />
      <Bar label="Midfield" oursPct={pct(oursMid, theirMid)} />
      <Bar label="Defense" oursPct={pct(oursDef, theirDef)} />
      <div className="dafb-row" style={{ alignItems: 'center', marginTop: 6 }}>
        <span className="dafb-ovr" style={{ fontSize: 14 }}>
          Predicted dominance: {overallOurs}% / {100 - overallOurs}%
        </span>
        <button
          className="btn-primary small"
          style={{ marginLeft: 'auto' }}
          onClick={() =>
            void import('../../store/useAIStore').then(({ useAIStore }) =>
              useAIStore
                .getState()
                .askAI(
                  `Formation clash: our ${ours} (${oursStyle}) vs opponent ${theirs} (${theirStyle}). Computed dominance: attack ${pct(
                    oursAtk,
                    theirAtk
                  )}%, midfield ${pct(oursMid, theirMid)}%, defense ${pct(oursDef, theirDef)}%. Give a tactical gameplan: where we win the match, where we suffer, key player roles, and in-game adjustments.`
                )
            )
          }
        >
          <Send size={12} /> AI gameplan
        </button>
      </div>
    </div>
  );
}

// ================= SAVED ANALYSES (MatchDB) =================
function SavedAnalyses({
  reportText,
  lang,
  playerA,
  ovrA,
  valueA,
  fitA,
  formation,
  style,
}: {
  reportText: string;
  lang: 'en' | 'ar';
  playerA: PlayerData;
  ovrA: number;
  valueA: number;
  fitA: number;
  formation: string;
  style: string;
}) {
  const showToast = useUIStore((s) => s.showToast);
  const [saved, setSaved] = useState<Array<{ key: string; ts: number }>>([]);
  const [loaded, setLoaded] = useState<string | null>(null);

  const refresh = () => {
    void window.velo.dbList().then(setSaved);
  };
  useEffect(refresh, []);

  const save = async () => {
    const key = `${playerA.name} (${playerA.position}, OVR ${ovrA}) — ${new Date().toLocaleString()}`;
    await window.velo.dbSave(`report:${key}`, {
      report: reportText,
      player: playerA,
      ovr: ovrA,
      value: valueA,
      fit: fitA,
      formation,
      style,
    });
    showToast('Saved offline to MatchDB ✓', 'success');
    refresh();
  };

  const load = async (key: string) => {
    const data = (await window.velo.dbLoad(key)) as
      | { report?: string; player?: PlayerData; ovr?: number; value?: number; fit?: number; formation?: string; style?: string }
      | null;
    if (data?.report) {
      setLoaded(data.report);
      showToast('Loaded from MatchDB', 'success');
    }
  };

  return (
    <div className="dafb-card">
      <h4>💾 Saved analyses — offline MatchDB</h4>
      <div className="dafb-row">
        <button className="btn-primary small" onClick={save}>
          <Save size={12} /> Save current report
        </button>
        <button className="btn-ghost small" onClick={refresh}>
          <FolderOpen size={12} /> Refresh
        </button>
      </div>
      {saved.length === 0 && <p className="settings-hint">Nothing saved yet — reports persist offline here.</p>}
      {saved.map((s) => (
        <div className="dafb-marker-row" key={s.key}>
          <span className="settings-hint" style={{ margin: 0, flex: 1, userSelect: 'text' }}>
            {s.key}
          </span>
          <button className="btn-ghost small" onClick={() => load(s.key)}>
            Open
          </button>
          <button
            className="icon-btn"
            title="Delete"
            onClick={async () => {
              await window.velo.dbDelete(s.key);
              refresh();
            }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      {loaded && <div className="md-preview dafb-report" dangerouslySetInnerHTML={{ __html: markdownToHtml(loaded) }} />}
      {saved.length >= 2 && (
        <button
          className="btn-primary small"
          onClick={() => {
            void (async () => {
              const parts: string[] = [];
              for (const s of saved.slice(0, 5)) {
                const data = (await window.velo.dbLoad(s.key)) as { report?: string } | null;
                if (data?.report) parts.push(data.report.slice(0, 800));
              }
              await import('../../store/useAIStore').then(({ useAIStore }) =>
                useAIStore
                  .getState()
                  .askAI(
                    `Multi-match aggregated profiling: combine these ${parts.length} saved scouting reports into one stable tactical identity profile — constant patterns across matches, consistency rating, and transfer recommendation:\n\n${parts.join('\n\n---\n\n')}`
                  )
              );
            })();
          }}
        >
          <Send size={12} /> Aggregate {Math.min(saved.length, 5)} reports with AI
        </button>
      )}
    </div>
  );
}

interface SPItem {
  id: number;
  x: number;
  y: number;
  type: 'attacker' | 'defender' | 'ball' | 'wall';
}

function SetPieceDesigner({ lang }: { lang: 'en' | 'ar' }) {
  const [items, setItems] = useState<SPItem[]>(() => {
    const initial: SPItem[] = [{ id: 1, x: 92, y: 50, type: 'ball' }];
    for (let i = 0; i < 4; i++) initial.push({ id: 10 + i, x: 84, y: 42 + i * 6, type: 'wall' });
    for (let i = 0; i < 5; i++) initial.push({ id: 20 + i, x: 70 + (i % 3) * 6, y: 30 + i * 8, type: 'attacker' });
    for (let i = 0; i < 4; i++) initial.push({ id: 40 + i, x: 78, y: 36 + i * 9, type: 'defender' });
    return initial;
  });
  const [adding, setAdding] = useState<SPItem['type'] | null>('attacker');
  const dragId = useRef<number | null>(null);
  const movedRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const danger = useMemo(() => {
    const ball = items.find((i) => i.type === 'ball');
    if (!ball) return 0;
    const dx = 100 - ball.x;
    const dy = 50 - ball.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const attackersInBox = items.filter((i) => i.type === 'attacker' && i.x > 80 && i.y > 25 && i.y < 75).length;
    const wallCount = items.filter((i) => i.type === 'wall').length;
    return Math.max(
      5,
      Math.min(95, Math.round(90 - dist * 1.6 + attackersInBox * 7 - wallCount * 4))
    );
  }, [items]);

  const toRel = (e: React.MouseEvent): Pt => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 64,
    };
  };

  const colors: Record<SPItem['type'], string> = {
    attacker: '#8b5cf6',
    defender: '#f76e6e',
    ball: '#ffffff',
    wall: '#f5d76e',
  };

  return (
    <div className="dafb-card">
      <h4>Interactive set-piece designer — corner / free kick</h4>
      <div className="dafb-row">
        {(['attacker', 'defender', 'wall', 'ball'] as const).map((t) => (
          <button key={t} className={`chip ${adding === t ? 'on' : ''}`} onClick={() => setAdding(t)}>
            {t}
          </button>
        ))}
        <span className="dafb-value" style={{ marginLeft: 'auto' }}>
          Danger: {danger}%
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox="0 0 100 64"
        className="dafb-pitch"
        style={{ background: 'rgba(103,232,165,0.05)', cursor: adding ? 'crosshair' : 'default' }}
        onClick={(e) => {
          // ignore the click that ends a token drag
          if (movedRef.current) {
            movedRef.current = false;
            return;
          }
          if (!adding) return;
          const p = toRel(e);
          setItems((s) => [...s, { id: Date.now(), x: p.x, y: p.y, type: adding }]);
        }}
        onMouseMove={(e) => {
          if (dragId.current === null) return;
          movedRef.current = true;
          const p = toRel(e);
          setItems((s) => s.map((i) => (i.id === dragId.current ? { ...i, x: p.x, y: p.y } : i)));
        }}
        onMouseUp={() => {
          setTimeout(() => (movedRef.current = false), 50);
          dragId.current = null;
        }}
        onMouseLeave={() => (dragId.current = null)}
      >
        <rect x="0" y="0" width="100" height="64" fill="none" stroke="rgba(103,232,165,0.4)" />
        <rect x="88" y="18" width="12" height="28" fill="none" stroke="rgba(103,232,165,0.4)" />
        <rect x="94" y="28" width="6" height="8" fill="none" stroke="rgba(103,232,165,0.4)" />
        {items.map((i) => (
          <g key={i.id} onMouseDown={(e) => { e.stopPropagation(); dragId.current = i.id; }} style={{ cursor: 'grab' }}>
            <circle cx={i.x} cy={i.y} r="2.4" fill={colors[i.type]} stroke="#0b0e14" strokeWidth="0.5" />
            {i.type === 'ball' && <circle cx={i.x} cy={i.y} r="4" fill="none" stroke="#ffffff" strokeDasharray="1 1" />}
          </g>
        ))}
      </svg>
      <p className="settings-hint">
        {lang === 'ar'
          ? 'اختر نوع العنصر ثم اضغط على الملعب للإضافة — اسحب أي عنصر لتحريكه.'
          : 'Pick an element type then click the pitch to add — drag any token to move it.'}
      </p>
      <button className="btn-ghost small" onClick={() => setItems((s) => s.slice(0, 1))}>
        Reset players
      </button>
    </div>
  );
}

// ================= XG LAB =================
function XgLab({ lang, onSend }: { lang: 'en' | 'ar'; onSend: (text: string) => void }) {
  const [shot, setShot] = useState<Pt | null>(null);
  const xg = shot ? shotXG(shot.x, shot.y) : null;

  return (
    <div className="dafb-card">
      <h4>Expected Goals (xG) lab — click the pitch to place a shot</h4>
      <svg
        viewBox="0 0 100 64"
        className="dafb-pitch"
        style={{ cursor: 'crosshair' }}
        onClick={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          setShot({
            x: ((e.clientX - rect.left) / rect.width) * 100,
            y: ((e.clientY - rect.top) / rect.height) * 64,
          });
        }}
      >
        <rect x="0" y="0" width="100" height="64" fill="rgba(56,189,248,0.05)" stroke="rgba(56,189,248,0.4)" />
        <rect x="86" y="20" width="14" height="24" fill="none" stroke="rgba(56,189,248,0.4)" />
        <rect x="94" y="28" width="6" height="8" fill="none" stroke="rgba(56,189,248,0.4)" />
        {shot && (
          <>
            <line x1={shot.x} y1={shot.y} x2="100" y2="50" stroke="rgba(56,189,248,0.5)" strokeDasharray="2 1.5" />
            <circle cx={shot.x} cy={shot.y} r="2.6" fill="#38bdf8" />
          </>
        )}
      </svg>
      {shot && xg !== null && (
        <p className="settings-hint">
          Shot at ({shot.x.toFixed(0)}, {shot.y.toFixed(0)}) → <strong style={{ color: 'var(--accent)' }}>xG = {(xg * 100).toFixed(1)}%</strong>
        </p>
      )}
      <button
        className="btn-primary small"
        disabled={!shot}
        onClick={() =>
          onSend(
            `xG analysis: a shot from (${shot!.x.toFixed(0)}, ${shot!.y.toFixed(0)}) on the pitch has an estimated xG of ${xg}. Explain whether this was a good chance, what shot locations yield higher xG, and how teams create high-xG chances.`
          )
        }
      >
        <Send size={12} /> Explain with AI
      </button>
    </div>
  );
}
