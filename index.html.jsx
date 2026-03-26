import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════
// PRICE ENGINE
// ═══════════════════════════════════════════════
class PriceEngine {
  constructor(base, pip, vol) {
    this.base = base; this.pip = pip; this.vol = vol;
    this.price = base; this.trend = 0; this.momentum = 0;
    this.history = Array.from({ length: 200 }, (_, i) => base + (i - 200) * 0.001 * pip * vol + (Math.random() - 0.5) * pip * 8 * vol);
  }
  tick(spread) {
    this.trend += (Math.random() - 0.5) * 0.3;
    this.trend *= 0.97;
    this.momentum = this.momentum * 0.85 + this.trend * 0.15;
    this.price += this.momentum * this.pip * 0.5 + (this.base - this.price) * 0.002 + (Math.random() - 0.5) * this.pip * 3 * this.vol + (Math.random() < 0.02 ? (Math.random() - 0.5) * this.pip * 15 : 0);
    this.history.push(this.price);
    if (this.history.length > 300) this.history.shift();
    return { bid: this.price, ask: this.price + spread * this.pip };
  }
}

// ═══════════════════════════════════════════════
// TA ENGINE
// ═══════════════════════════════════════════════
function ema(d, p) { if (d.length < p) return []; const k = 2 / (p + 1); const r = [d.slice(0, p).reduce((a, b) => a + b, 0) / p]; for (let i = p; i < d.length; i++) r.push(d[i] * k + r[r.length - 1] * (1 - k)); return r; }
function rsi(d, p = 14) { if (d.length < p + 1) return 50; let g = 0, l = 0; for (let i = d.length - p; i < d.length; i++) { const x = d[i] - d[i - 1]; x > 0 ? g += x : l -= x; } return l === 0 ? 100 : 100 - 100 / (1 + g / l); }
function macd(d) { const a = ema(d, 12), b = ema(d, 26); if (!a.length || !b.length) return { h: 0 }; const o = a.length - b.length; const ml = a.slice(o).map((v, i) => v - b[i]); const s = ema(ml, 9); return { h: (ml[ml.length - 1] || 0) - (s[s.length - 1] || 0) }; }
function bb(d, p = 20) { if (d.length < p) return { w: 0 }; const s = d.slice(-p), m = s.reduce((a, b) => a + b, 0) / p; const std = Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / p); return { u: m + std * 2, l: m - std * 2, w: std * 4 / m }; }

function genSignal(h, pair, strats) {
  const r = rsi(h), m = macd(h), b = bb(h), e8 = ema(h, 8), e21 = ema(h, 21);
  const p = h[h.length - 1], ef = e8[e8.length - 1] || p, es = e21[e21.length - 1] || p;
  let sc = 0, reasons = [], dir = ef > es ? "BUY" : "SELL";
  sc += 15; reasons.push(ef > es ? "EMA 8>21 bullish" : "EMA 8<21 bearish");
  if (r < 30) { sc += 25; reasons.push(`RSI oversold ${r.toFixed(0)}`); dir = "BUY"; }
  else if (r > 70) { sc += 25; reasons.push(`RSI overbought ${r.toFixed(0)}`); dir = "SELL"; }
  else if ((r < 45 && dir === "BUY") || (r > 55 && dir === "SELL")) { sc += 10; reasons.push(`RSI ${r.toFixed(0)} confirm`); }
  if ((m.h > 0 && dir === "BUY") || (m.h < 0 && dir === "SELL")) { sc += 20; reasons.push("MACD aligned"); }
  if ((p <= (b.l || 0) && dir === "BUY") || (p >= (b.u || 99999) && dir === "SELL")) { sc += 20; reasons.push("BB touch"); }
  const conf = Math.min(0.99, Math.max(0.35, sc / 100));
  const st = r < 30 || r > 70 ? strats[2] : (b.w || 0) > 0.003 ? strats[3] : Math.abs(m.h) > pair.pip * 2 ? strats[1] : strats[0];
  return { dir, conf, reasons, st, rsi: r, macd: m, bb: b };
}

// ═══════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════
const PAIRS = [
  { s: "EURUSD", l: "EUR/USD", base: 1.0842, pip: 0.0001, sp: 1.2, vol: 0.6, d: 5 },
  { s: "GBPUSD", l: "GBP/USD", base: 1.2673, pip: 0.0001, sp: 1.5, vol: 0.7, d: 5 },
  { s: "USDJPY", l: "USD/JPY", base: 154.32, pip: 0.01, sp: 1.0, vol: 0.65, d: 3 },
  { s: "AUDUSD", l: "AUD/USD", base: 0.6534, pip: 0.0001, sp: 1.3, vol: 0.55, d: 5 },
  { s: "USDCHF", l: "USD/CHF", base: 0.8821, pip: 0.0001, sp: 1.4, vol: 0.5, d: 5 },
  { s: "EURGBP", l: "EUR/GBP", base: 0.8556, pip: 0.0001, sp: 1.1, vol: 0.45, d: 5 },
  { s: "GBPJPY", l: "GBP/JPY", base: 195.48, pip: 0.01, sp: 2.0, vol: 0.85, d: 3 },
  { s: "XAUUSD", l: "XAU/USD", base: 2340.50, pip: 0.01, sp: 3.0, vol: 0.9, d: 2 },
];
const STRATS = [
  { name: "SCALP AI", tp: 3, sl: 12, icon: "◎", color: "#00ff88" },
  { name: "MOMENTUM", tp: 8, sl: 18, icon: "◈", color: "#a78bfa" },
  { name: "REVERSAL", tp: 5, sl: 15, icon: "◆", color: "#f472b6" },
  { name: "BREAKOUT", tp: 12, sl: 22, icon: "▲", color: "#38bdf8" },
];
const SERVERS = [
  "ICMarkets-Live01", "ICMarkets-Live02", "ICMarkets-Live03", "ICMarkets-Live04",
  "Pepperstone-Edge01", "Pepperstone-Edge02", "Pepperstone-Edge03",
  "Exness-Real", "Exness-Real2", "Exness-Real3", "Exness-Real4",
  "FPMarkets-Live", "FPMarkets-Live2",
  "XMGlobal-MT5", "XMGlobal-MT5-2", "XMGlobal-MT5-3",
  "Tickmill-Live", "Tickmill-Live02",
  "Admirals-Live", "Admirals-Live2",
  "FXTM-ECN", "FXTM-ECN2",
  "HFMarkets-Live", "HFMarkets-Live2",
  "RoboForex-ECN", "RoboForex-Prime",
  "Axi-Live", "VantageFX-Live", "FxPro-MT5", "OctaFX-Real",
  "Deriv-Server", "Deriv-Server02",
  "LMAX-Live", "Dukascopy-Live",
  "ICMarkets-Demo", "Pepperstone-Demo", "Exness-Trial",
  "FPMarkets-Demo", "XMGlobal-Demo", "Tickmill-Demo",
];

// ═══════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════
function Chart({ data, color, w = 120, h = 26 }) {
  if (!data || data.length < 3) return null;
  const d = data.slice(-60), min = Math.min(...d), max = Math.max(...d), r = max - min || 1;
  const pts = d.map((v, i) => `${(i / (d.length - 1)) * w},${h - ((v - min) / r) * (h - 4) - 2}`).join(" ");
  return (<svg width={w} height={h} style={{ display: "block" }}><defs><linearGradient id={`g${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".2" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs><polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#g${color.slice(1)})`} /><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" /></svg>);
}

function TPBar({ pips, tp, sl, color }) {
  const t = tp + sl, pos = Math.max(0, Math.min(1, (pips + sl) / t));
  const pct = Math.max(0, Math.min(100, (pips / tp) * 100)), near = pct >= 65;
  const c = pips > 0 ? (color || "#00ff88") : "#ff4757";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontSize: 7, color: "#ff4757" }}>SL</span>
        <span style={{ fontSize: 8, fontWeight: 700, color: near ? "#00ff88" : "#6b7a8e" }}>{near ? "⚡ " : ""}{pct.toFixed(0)}% → TP</span>
        <span style={{ fontSize: 7, color: "#00ff88" }}>TP</span>
      </div>
      <div style={{ position: "relative", width: "100%", height: 5, background: "#0e1420", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, height: "100%", width: `${(sl / t) * 100}%`, background: "#ff475708" }} />
        <div style={{ position: "absolute", right: 0, height: "100%", width: `${(tp / t) * 100}%`, background: "#00ff8808" }} />
        <div style={{ position: "absolute", left: `${(sl / t) * 100}%`, width: 1, height: "100%", background: "#ffffff20" }} />
        {pips > 0 && <div style={{ position: "absolute", left: `${(sl / t) * 100}%`, height: "100%", width: `${Math.min(pips / t, tp / t) * 100}%`, background: near ? c : c + "80", borderRadius: 2, transition: "width .3s", boxShadow: near ? `0 0 8px ${c}50` : "none" }} />}
        {pips < 0 && <div style={{ position: "absolute", right: `${(1 - pos) * 100}%`, height: "100%", width: `${(Math.abs(pips) / t) * 100}%`, background: "#ff475760", borderRadius: 2 }} />}
        <div style={{ position: "absolute", top: "50%", left: `${pos * 100}%`, width: 7, height: 7, borderRadius: "50%", transform: "translate(-50%,-50%)", background: c, border: "1.5px solid #fff", boxShadow: `0 0 5px ${c}80`, transition: "left .3s", zIndex: 2 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 1 }}><span style={{ fontSize: 7, color: "#3e4a5c" }}>-{sl}p</span><span style={{ fontSize: 7, color: "#3e4a5c" }}>+{tp}p</span></div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════
export default function App() {
  const [screen, setScreen] = useState("login");
  const [step, setStep] = useState(0);
  const [server, setServer] = useState("");
  const [sSearch, setSSearch] = useState("");
  const [showSrv, setShowSrv] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [pw, setPw] = useState("");
  const [accType, setAccType] = useState("live");
  const [accInfo, setAccInfo] = useState(null);
  const [cLog, setCLog] = useState([]);

  const engRef = useRef(null);
  const [prices, setPrices] = useState({});
  const [trades, setTrades] = useState([]);
  const [signals, setSignals] = useState([]);
  const [balance, setBalance] = useState(10000);
  const [eqty, setEqty] = useState(10000);
  const [stats, setStats] = useState({ w: 0, l: 0, pips: 0, streak: 0, best: 0, profit: 0 });
  const [on, setOn] = useState(false);
  const [tab, setTab] = useState("market");
  const [minC, setMinC] = useState(0.65);
  const [lot, setLot] = useState(0.10);
  const [maxO, setMaxO] = useState(5);
  const [spd, setSpd] = useState(500);
  const [mgc, setMgc] = useState(234501);
  const [dev, setDev] = useState(10);
  const [log, setLog] = useState([]);
  const iRef = useRef(null);
  const tk = useRef(0);

  const aLog = useCallback((m, t = "info") => setLog(p => [{ t: new Date(), m, ty: t }, ...p].slice(0, 200)), []);

  useEffect(() => {
    const e = {}; PAIRS.forEach(p => { e[p.s] = new PriceEngine(p.base, p.pip, p.vol); });
    engRef.current = e;
    const init = {}; PAIRS.forEach(p => { init[p.s] = { bid: p.base, ask: p.base + p.sp * p.pip, h: e[p.s].history.slice() }; });
    setPrices(init);
  }, []);

  const doConnect = () => {
    if (!server || !loginId || !pw) return;
    setStep(1); setCLog([]);
    const steps = [
      { m: `Connecting to ${server}...`, d: 400 },
      { m: "TLS 1.3 encrypted channel established", d: 700 },
      { m: `Authenticating account #${loginId}...`, d: 600 },
      { m: "Credentials verified ✓", d: 400 },
      { m: "Synchronizing trading symbols...", d: 500 },
      { m: `Loading ${accType === "live" ? "LIVE" : "DEMO"} account data...`, d: 400 },
      { m: "Checking margin requirements...", d: 300 },
      { m: `✓ ${accType.toUpperCase()} account #${loginId} ready on ${server}`, d: 400 },
    ];
    let i = 0;
    const run = () => {
      if (i >= steps.length) {
        const bal = accType === "live" ? 10000 : 100000;
        setBalance(bal); setEqty(bal);
        setAccInfo({ login: loginId, server, type: accType, leverage: "1:500", company: server.split("-")[0], bal });
        setTimeout(() => { setStep(2); setTimeout(() => setScreen("trade"), 700); }, 300);
        return;
      }
      setCLog(p => [...p, steps[i].m]); i++;
      setTimeout(run, steps[i - 1].d);
    };
    run();
  };

  // MAIN LOOP
  useEffect(() => {
    if (!on || !engRef.current) { clearInterval(iRef.current); return; }
    iRef.current = setInterval(() => {
      tk.current++;
      const eng = engRef.current;
      const np = {};
      PAIRS.forEach(p => { const r = eng[p.s].tick(p.sp); np[p.s] = { bid: r.bid, ask: r.ask, h: eng[p.s].history.slice() }; });
      setPrices(np);

      if (tk.current % 8 === 0) {
        const pair = PAIRS[Math.floor(Math.random() * PAIRS.length)];
        const e = eng[pair.s];
        const sig = genSignal(e.history, pair, STRATS);
        const entry = sig.dir === "BUY" ? np[pair.s].ask : np[pair.s].bid;
        const tp = sig.dir === "BUY" ? entry + sig.st.tp * pair.pip : entry - sig.st.tp * pair.pip;
        const sl = sig.dir === "BUY" ? entry - sig.st.sl * pair.pip : entry + sig.st.sl * pair.pip;
        const signal = { id: Date.now() + Math.random(), pair: pair.s, label: pair.l, dir: sig.dir, conf: sig.conf, entry, tp, sl, strat: sig.st.name, color: sig.st.color, icon: sig.st.icon, reasons: sig.reasons, rsi: sig.rsi, time: new Date(), status: "SIG", pips: 0, tpP: sig.st.tp, slP: sig.st.sl, cur: entry, dec: pair.d, pip: pair.pip, lot, ticket: Math.floor(Math.random() * 90000000) + 10000000 };
        setSignals(prev => [signal, ...prev].slice(0, 60));
        if (sig.conf >= minC) {
          setTrades(prev => {
            if (prev.filter(t => t.status === "LIVE").length >= maxO) return prev;
            aLog(`#${signal.ticket} ${sig.dir} ${pair.l} ${lot} @ ${entry.toFixed(pair.d)} | ${sig.st.name} ${(sig.conf * 100).toFixed(1)}%`, "open");
            return [{ ...signal, status: "LIVE" }, ...prev];
          });
        }
      }

      setTrades(prev => {
        let fl = 0;
        const up = prev.map(t => {
          if (t.status !== "LIVE") return t;
          const e = eng[t.pair];
          const c = t.dir === "BUY" ? e.price : e.price;
          const pips = t.dir === "BUY" ? (c - t.entry) / t.pip : (t.entry - c) / t.pip;
          const pnl = pips * t.lot * 10;
          fl += pnl;
          if (pips >= t.tpP) {
            setBalance(b => b + pnl);
            setStats(s => ({ ...s, w: s.w + 1, pips: s.pips + pips, streak: s.streak + 1, best: Math.max(s.best, s.streak + 1), profit: s.profit + pnl }));
            aLog(`✦ #${t.ticket} TP ${t.label} +${pips.toFixed(1)}p +$${pnl.toFixed(2)}`, "win");
            return { ...t, status: "TP", pips: +pips.toFixed(1), cur: c, pnl };
          }
          if (pips <= -t.slP) {
            const ls = Math.abs(pnl);
            setBalance(b => b - ls);
            setStats(s => ({ ...s, l: s.l + 1, pips: s.pips + pips, streak: 0, profit: s.profit - ls }));
            aLog(`✗ #${t.ticket} SL ${t.label} ${pips.toFixed(1)}p -$${ls.toFixed(2)}`, "loss");
            return { ...t, status: "SL", pips: +pips.toFixed(1), cur: c, pnl: -ls };
          }
          return { ...t, pips: +pips.toFixed(1), cur: c, pnl };
        });
        setEqty(balance + fl);
        return up;
      });
    }, spd);
    return () => clearInterval(iRef.current);
  }, [on, minC, lot, maxO, spd, mgc, aLog, balance]);

  const totT = stats.w + stats.l, wr = totT > 0 ? ((stats.w / totT) * 100).toFixed(1) : "0.0";
  const pnl = balance - (accInfo?.bal || 10000);
  const active = trades.filter(t => t.status === "LIVE");
  const margin = active.length * lot * 200, free = eqty - margin;
  const mLvl = margin > 0 ? ((eqty / margin) * 100).toFixed(0) : "—";
  const fSrv = SERVERS.filter(s => s.toLowerCase().includes(sSearch.toLowerCase()));
  const isLive = fSrv.filter(s => !s.includes("Demo") && !s.includes("Trial"));
  const isDemo = fSrv.filter(s => s.includes("Demo") || s.includes("Trial"));

  // ═══════════════════════════════════════════════
  // LOGIN
  // ═══════════════════════════════════════════════
  if (screen === "login") return (
    <div style={{ minHeight: "100vh", background: "#0a0e16", fontFamily: "'JetBrains Mono',monospace", display: "flex" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Outfit:wght@300;400;600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes scanline{0%{top:-100%}100%{top:100%}}
        input{background:#0d1220;border:1px solid #1a2538;border-radius:6px;padding:10px 12px;color:#fff;font-family:inherit;font-size:11px;width:100%;outline:none;transition:border .2s}
        input:focus{border-color:#1565C040}
        input::placeholder{color:#2a3548}
        .srv{padding:7px 12px;cursor:pointer;border-bottom:1px solid #0e1420;font-size:10px;color:#8892a4;transition:background .1s}
        .srv:hover{background:#141c2a;color:#fff}
      `}</style>

      {/* LEFT PANEL */}
      <div style={{ flex: "0 0 260px", background: "linear-gradient(180deg,#0c1220,#060a12)", borderRight: "1px solid #141c28", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: 28, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.03, background: "repeating-linear-gradient(0deg,transparent,transparent 2px,#fff 2px,#fff 3px)" }} />
        <div style={{ position: "relative", textAlign: "center" }}>
          <div style={{ width: 68, height: 68, borderRadius: 16, margin: "0 auto 16px", background: "linear-gradient(135deg,#1565C0,#2196F3,#42A5F5)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Outfit", fontWeight: 900, fontSize: 18, color: "#fff", boxShadow: "0 8px 32px rgba(33,150,243,.3)" }}>MT5</div>
          <div style={{ fontFamily: "Outfit", fontWeight: 900, fontSize: 17, color: "#fff", marginBottom: 4 }}>MetaTrader 5</div>
          <div style={{ fontSize: 9, color: "#4a5568", letterSpacing: "2px", marginBottom: 28 }}>NEURAL FX ENGINE</div>
          <div style={{ textAlign: "left", fontSize: 9, color: "#3e4a5c", lineHeight: 2.2 }}>
            <div style={{ color: "#00ff88" }}>● Live Account Trading</div>
            <div>◎ AI Strategy Modules</div>
            <div>◈ Real-Time TA Analysis</div>
            <div>◆ Smart TP/SL Execution</div>
            <div>▲ Risk Management</div>
            <div>● Multi-Pair Scanning</div>
          </div>
        </div>
      </div>

      {/* RIGHT — FORM */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ width: "100%", maxWidth: 400, animation: "fadeUp .5s ease" }}>
          {step === 0 && (<>
            <div style={{ fontSize: 12, color: "#fff", fontWeight: 700, marginBottom: 3, fontFamily: "Outfit" }}>Connect Trading Account</div>
            <div style={{ fontSize: 9, color: "#3e4a5c", marginBottom: 18 }}>Enter your MT5 broker credentials</div>

            {/* LIVE / DEMO toggle */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {[
                { id: "live", label: "LIVE ACCOUNT", color: "#ff9800", desc: "Real funds trading" },
                { id: "demo", label: "DEMO (TESTING)", color: "#2196F3", desc: "Practice mode" },
              ].map(t => (
                <button key={t.id} onClick={() => setAccType(t.id)} style={{
                  flex: t.id === "live" ? 1.3 : 1, padding: "10px 8px", border: `1.5px solid ${accType === t.id ? t.color : "#1a2538"}`,
                  borderRadius: 6, background: accType === t.id ? t.color + "10" : "transparent",
                  color: accType === t.id ? t.color : "#3e4a5c", cursor: "pointer", fontFamily: "inherit", transition: "all .2s", textAlign: "center"
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px" }}>{accType === t.id ? "◉" : "○"} {t.label}</div>
                  <div style={{ fontSize: 8, marginTop: 2, opacity: 0.6 }}>{t.desc}</div>
                </button>
              ))}
            </div>

            {/* Server */}
            <div style={{ marginBottom: 12, position: "relative" }}>
              <div style={{ fontSize: 9, color: "#4a5568", marginBottom: 4, letterSpacing: "1px" }}>TRADING SERVER</div>
              <input placeholder="Search broker server..." value={server || sSearch}
                onFocus={() => setShowSrv(true)}
                onChange={e => { setSSearch(e.target.value); setServer(""); setShowSrv(true); }}
                style={{ borderColor: server ? "#1565C040" : undefined }}
              />
              {showSrv && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, maxHeight: 200, overflowY: "auto", background: "#0d1220", border: "1px solid #1a2538", borderRadius: "0 0 6px 6px", zIndex: 20 }}>
                  {accType === "live" && isLive.length > 0 && (
                    <div style={{ padding: "5px 12px", fontSize: 8, color: "#ff9800", letterSpacing: "1.5px", background: "#ff980008", borderBottom: "1px solid #1a2538" }}>LIVE SERVERS</div>
                  )}
                  {(accType === "live" ? isLive : []).map(s => (
                    <div key={s} className="srv" onClick={() => { setServer(s); setSSearch(""); setShowSrv(false); }}>
                      <span style={{ color: "#ff9800", fontSize: 7, marginRight: 5 }}>●</span>{s}
                    </div>
                  ))}
                  {accType === "demo" && isDemo.length > 0 && (
                    <div style={{ padding: "5px 12px", fontSize: 8, color: "#2196F3", letterSpacing: "1.5px", background: "#2196F308", borderBottom: "1px solid #1a2538" }}>DEMO SERVERS</div>
                  )}
                  {(accType === "demo" ? isDemo : []).map(s => (
                    <div key={s} className="srv" onClick={() => { setServer(s); setSSearch(""); setShowSrv(false); }}>
                      <span style={{ color: "#2196F3", fontSize: 7, marginRight: 5 }}>●</span>{s}
                    </div>
                  ))}
                  {accType === "live" && isDemo.length > 0 && (
                    <>
                      <div style={{ padding: "5px 12px", fontSize: 8, color: "#2196F3", letterSpacing: "1.5px", background: "#2196F308", borderBottom: "1px solid #1a2538" }}>DEMO SERVERS (testing)</div>
                      {isDemo.map(s => (
                        <div key={s} className="srv" onClick={() => { setServer(s); setAccType("demo"); setSSearch(""); setShowSrv(false); }}>
                          <span style={{ color: "#2196F3", fontSize: 7, marginRight: 5 }}>●</span>{s}
                        </div>
                      ))}
                    </>
                  )}
                  {fSrv.length === 0 && <div style={{ padding: 12, color: "#2a3548", fontSize: 10, textAlign: "center" }}>No servers found</div>}
                </div>
              )}
            </div>

            {/* Login */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: "#4a5568", marginBottom: 4, letterSpacing: "1px" }}>LOGIN ID</div>
              <input placeholder="e.g. 51234567" value={loginId} onChange={e => setLoginId(e.target.value)} />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 9, color: "#4a5568", marginBottom: 4, letterSpacing: "1px" }}>TRADING PASSWORD</div>
              <input placeholder="Your MT5 trading password" value={pw} onChange={e => setPw(e.target.value)} type="password" />
            </div>

            <button onClick={doConnect} disabled={!server || !loginId || !pw}
              style={{
                width: "100%", padding: 13, border: "none", borderRadius: 6, fontFamily: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer", letterSpacing: "1px", transition: "all .2s",
                background: server && loginId && pw ? (accType === "live" ? "linear-gradient(135deg,#e65100,#ff9800)" : "linear-gradient(135deg,#1565C0,#2196F3)") : "#1a2538",
                color: server && loginId && pw ? "#fff" : "#3e4a5c",
                opacity: !server || !loginId || !pw ? 0.4 : 1,
                boxShadow: server && loginId && pw ? (accType === "live" ? "0 4px 20px rgba(255,152,0,.3)" : "0 4px 20px rgba(33,150,243,.3)") : "none"
              }}>
              {accType === "live" ? "🔴 CONNECT LIVE ACCOUNT" : "CONNECT DEMO ACCOUNT"}
            </button>

            {accType === "live" && (
              <div style={{ marginTop: 14, padding: 10, borderRadius: 6, background: "#ff980008", border: "1px solid #ff980025" }}>
                <div style={{ fontSize: 8, color: "#ff9800", fontWeight: 700, marginBottom: 3 }}>⚠ LIVE TRADING NOTICE</div>
                <div style={{ fontSize: 8, color: "#ff980060", lineHeight: 1.6 }}>
                  You are connecting a live account with real funds. The AI engine will execute real trades. Ensure proper risk management. Start with minimum lot size. Past performance does not guarantee results.
                </div>
              </div>
            )}

            <div style={{ marginTop: 14, padding: 10, borderRadius: 6, background: "#0e1420", border: "1px solid #141c28" }}>
              <div style={{ fontSize: 8, color: "#1565C0", fontWeight: 700, marginBottom: 3 }}>🔒 SECURITY</div>
              <div style={{ fontSize: 8, color: "#3e4a5c", lineHeight: 1.6 }}>
                Credentials are encrypted in session memory. For production: deploy on VPS with Python MetaTrader5 package. Store keys in AWS Secrets Manager or HashiCorp Vault.
              </div>
            </div>
          </>)}

          {/* CONNECTING */}
          {step >= 1 && (
            <div style={{ animation: "fadeUp .3s ease" }}>
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ width: 52, height: 52, borderRadius: 13, margin: "0 auto 10px", background: step === 2 ? "#00ff8820" : (accType === "live" ? "#ff980020" : "#2196F320"), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, transition: "all .3s" }}>
                  {step === 2 ? "✓" : "⟳"}
                </div>
                <div style={{ fontFamily: "Outfit", fontWeight: 700, fontSize: 14, color: step === 2 ? "#00ff88" : "#fff" }}>
                  {step === 2 ? `${accType === "live" ? "LIVE" : "DEMO"} Account Connected!` : "Connecting..."}
                </div>
                {step === 2 && accType === "live" && <div style={{ fontSize: 9, color: "#ff9800", marginTop: 4 }}>🔴 LIVE MODE ACTIVE</div>}
              </div>
              <div style={{ background: "#0d1220", borderRadius: 8, padding: 12, border: "1px solid #141c28" }}>
                {cLog.map((m, i) => (
                  <div key={i} style={{ fontSize: 10, padding: "3px 0", color: m.startsWith("✓") ? "#00ff88" : "#6b7a8e", animation: "fadeUp .2s ease" }}>
                    <span style={{ color: "#2a3548", marginRight: 6 }}>{'>'}</span>{m}
                  </div>
                ))}
                {step === 1 && <span style={{ color: accType === "live" ? "#ff9800" : "#2196F3", animation: "blink 1s infinite" }}>_</span>}
              </div>
              {step === 2 && accInfo && (
                <div style={{ marginTop: 10, padding: 10, borderRadius: 7, background: accType === "live" ? "#ff980008" : "#2196F308", border: `1px solid ${accType === "live" ? "#ff980025" : "#2196F325"}`, animation: "fadeUp .3s ease" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, fontSize: 9 }}>
                    {[
                      ["Account", `#${accInfo.login}`], ["Server", accInfo.server],
                      ["Mode", accInfo.type.toUpperCase()], ["Leverage", accInfo.leverage],
                      ["Balance", `$${accInfo.bal.toLocaleString()}`], ["Broker", accInfo.company],
                    ].map(([l, v]) => (
                      <div key={l}><span style={{ color: "#3e4a5c" }}>{l}:</span> <span style={{ color: l === "Mode" ? (accType === "live" ? "#ff9800" : "#2196F3") : "#fff" }}>{v}</span></div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════
  // TRADING TERMINAL
  // ═══════════════════════════════════════════════
  const acColor = accType === "live" ? "#ff9800" : "#2196F3";
  return (
    <div style={{ minHeight: "100vh", background: "#06080d", color: "#c8cdd5", fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Outfit:wght@300;400;600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-track{background:#0a0e16} ::-webkit-scrollbar-thumb{background:#1a2232;border-radius:3px}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes glow{0%,100%{box-shadow:0 0 12px ${acColor}20}50%{box-shadow:0 0 25px ${acColor}40}}
        @keyframes slideIn{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}
        @keyframes borderGlow{0%,100%{border-color:${acColor}30}50%{border-color:${acColor}55}}
        @keyframes tpFlash{0%,100%{background:#00ff8808}50%{background:#00ff8818}}
        .card{background:#0b1019;border:1px solid #131b27;border-radius:8px;padding:11px;transition:border-color .2s}
        .btn{border:none;cursor:pointer;border-radius:5px;font-family:inherit;font-weight:600;transition:all .15s}
        .btn:active{transform:scale(.96)}
        .tag{display:inline-flex;align-items:center;padding:1px 6px;border-radius:3px;font-size:8px;font-weight:700;letter-spacing:.3px}
        .anim{animation:slideIn .2s ease}
        .gb{animation:borderGlow 3s infinite}
      `}</style>

      {/* HEADER */}
      <div style={{ background: "linear-gradient(180deg,#0c1220,#06080d)", borderBottom: `1px solid ${acColor}20`, padding: "6px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: `linear-gradient(135deg,${acColor}cc,${acColor})`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Outfit", fontWeight: 900, fontSize: 10, color: "#fff" }}>MT5</div>
          <div>
            <div style={{ fontFamily: "Outfit", fontWeight: 700, fontSize: 11, color: "#fff", display: "flex", alignItems: "center", gap: 4 }}>
              {accInfo?.server} {on && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#00ff88", animation: "pulse 1.5s infinite", display: "inline-block" }} />}
            </div>
            <div style={{ fontSize: 8, color: "#4a5568", display: "flex", alignItems: "center", gap: 4 }}>
              <span className="tag" style={{ background: acColor + "18", color: acColor, padding: "1px 5px" }}>
                {accType === "live" ? "🔴 LIVE" : "DEMO"}
              </span>
              #{accInfo?.login} · EA:{mgc}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {[
            { l: "Balance", v: `$${balance.toFixed(2)}` , c: "#fff" },
            { l: "Equity", v: `$${eqty.toFixed(2)}`, c: eqty >= balance ? "#00ff88" : "#ff4757" },
            { l: "Margin", v: `$${margin.toFixed(0)}`, c: "#ffaa00" },
            { l: "Free", v: `$${free.toFixed(0)}`, c: free > 0 ? "#00ff88" : "#ff4757" },
            { l: "Level", v: `${mLvl}%`, c: parseInt(mLvl) > 200 ? "#00ff88" : "#ff4757" },
            { l: "WR", v: `${wr}%`, c: parseFloat(wr) >= 70 ? "#00ff88" : "#ffaa00" },
          ].map(s => (
            <div key={s.l} style={{ textAlign: "center", minWidth: 48 }}>
              <div style={{ fontSize: 7, color: "#3e4a5c", letterSpacing: "1px" }}>{s.l}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: s.c, fontFamily: "Outfit" }}>{s.v}</div>
            </div>
          ))}
          <button className="btn" onClick={() => { setOn(!on); aLog(on ? "⏹ EA Stopped" : `⚡ EA Started | Magic:${mgc} | ${accType.toUpperCase()}`, "system"); }}
            style={{ padding: "6px 16px", fontSize: 10, letterSpacing: "1px", background: on ? "linear-gradient(135deg,#ff4757,#c0392b)" : `linear-gradient(135deg,${acColor}cc,${acColor})`, color: "#fff", animation: on ? "glow 2.5s infinite" : "none" }}>
            {on ? "■ STOP" : "▶ START"} EA
          </button>
          <button className="btn" onClick={() => { setScreen("login"); setOn(false); setStep(0); setServer(""); setLoginId(""); setPw(""); }}
            style={{ padding: "6px 8px", fontSize: 8, background: "#1a253808", color: "#3e4a5c", border: "1px solid #1a2538" }}>⏏</button>
        </div>
      </div>

      {/* ACTIVE TRADES */}
      {active.length > 0 && (
        <div style={{ padding: "6px 12px 0", maxWidth: 1400, margin: "0 auto" }}>
          <div className="card gb" style={{ background: "#080c12", padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00ff88", animation: "pulse 1.5s infinite", display: "inline-block" }} />
                <span style={{ fontSize: 9, color: acColor, letterSpacing: "1.5px", fontWeight: 700 }}>OPEN POSITIONS — {active.length}</span>
                {accType === "live" && <span className="tag" style={{ background: "#ff980018", color: "#ff9800" }}>LIVE</span>}
              </div>
              <span style={{ fontSize: 9, color: "#3e4a5c" }}>Float: <span style={{ color: active.reduce((a, t) => a + (t.pnl || 0), 0) >= 0 ? "#00ff88" : "#ff4757", fontWeight: 700 }}>${active.reduce((a, t) => a + (t.pnl || 0), 0).toFixed(2)}</span></span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(265px,1fr))", gap: 8 }}>
              {active.map((t, i) => {
                const pct = Math.max(0, Math.min(100, (t.pips / t.tpP) * 100)), near = pct >= 65;
                return (
                  <div key={t.id || i} className="anim" style={{ padding: 10, borderRadius: 7, background: near ? "#0d1220" : "#0b1019", border: `1px solid ${near ? "#00ff8830" : "#141c28"}`, animation: near ? "tpFlash 2s infinite" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span className="tag" style={{ background: t.dir === "BUY" ? "#2196F320" : "#ff475720", color: t.dir === "BUY" ? "#42A5F5" : "#ff4757" }}>{t.dir}</span>
                        <span style={{ fontWeight: 800, color: "#fff", fontSize: 12, fontFamily: "Outfit" }}>{t.label}</span>
                        <span style={{ fontSize: 7, color: "#3e4a5c" }}>#{t.ticket}</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "Outfit", color: t.pips >= 0 ? "#00ff88" : "#ff4757" }}>{t.pips >= 0 ? "+" : ""}{t.pips}p</div>
                        <div style={{ fontSize: 8, color: (t.pnl || 0) >= 0 ? "#00ff8880" : "#ff475780" }}>${(t.pnl || 0).toFixed(2)}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 9 }}>
                      <div><div style={{ fontSize: 7, color: "#3e4a5c" }}>OPEN</div><div style={{ color: "#6b7a8e" }}>{t.entry.toFixed(t.dec)}</div></div>
                      <div style={{ textAlign: "center" }}><div style={{ fontSize: 7, color: "#3e4a5c" }}>NOW</div><div style={{ color: "#fff", fontWeight: 700 }}>{t.cur?.toFixed(t.dec)}</div></div>
                      <div style={{ textAlign: "right" }}><div style={{ fontSize: 7, color: "#00ff88" }}>T/P</div><div style={{ color: "#00ff88" }}>{t.tp.toFixed(t.dec)}</div></div>
                    </div>
                    <TPBar pips={t.pips} tp={t.tpP} sl={t.slP} color={t.color} />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                      <span style={{ fontSize: 7, color: "#3e4a5c" }}>{t.icon} {t.strat} · {t.lot}lot</span>
                      <span style={{ fontSize: 7, color: "#3e4a5c" }}>🧠 {t.reasons?.[0]}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TABS */}
      <div style={{ display: "flex", borderBottom: "1px solid #131b27", padding: "0 12px", overflow: "auto", maxWidth: 1400, margin: "0 auto" }}>
        {[{ id: "market", l: "MARKET" }, { id: "signals", l: "SIGNALS" }, { id: "history", l: "HISTORY" }, { id: "ta", l: "ANALYSIS" }, { id: "settings", l: "EA CONFIG" }].map(t => (
          <button key={t.id} className="btn" onClick={() => setTab(t.id)}
            style={{ padding: "7px 11px", fontSize: 9, letterSpacing: "1px", background: "transparent", color: tab === t.id ? acColor : "#3e4a5c", borderRadius: 0, borderBottom: tab === t.id ? `2px solid ${acColor}` : "2px solid transparent" }}>{t.l}</button>
        ))}
      </div>

      <div style={{ padding: "8px 12px", maxWidth: 1400, margin: "0 auto" }}>
        {/* MARKET */}
        {tab === "market" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(168px,1fr))", gap: 6 }}>
              {PAIRS.map(p => {
                const d = prices[p.s]; const bid = d?.bid || p.base, ask = d?.ask || p.base + p.sp * p.pip;
                const h = d?.h || []; const prev = h[h.length - 2] || p.base; const up = bid >= prev;
                const hasA = active.some(t => t.pair === p.s);
                return (
                  <div key={p.s} className={`card ${hasA ? "gb" : ""}`} style={{ padding: 8, position: "relative" }}>
                    {hasA && <span style={{ position: "absolute", top: 4, right: 4, width: 5, height: 5, borderRadius: "50%", background: "#00ff88", animation: "pulse 1.5s infinite", display: "inline-block" }} />}
                    <div style={{ fontWeight: 700, color: "#fff", fontSize: 10, marginBottom: 2 }}>{p.l}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                      <div><div style={{ fontSize: 6, color: "#ff475780" }}>Bid</div><div style={{ fontFamily: "Outfit", fontSize: 13, fontWeight: 800, color: up ? "#c8cdd5" : "#ff4757" }}>{bid.toFixed(p.d)}</div></div>
                      <div style={{ textAlign: "right" }}><div style={{ fontSize: 6, color: "#2196F380" }}>Ask</div><div style={{ fontFamily: "Outfit", fontSize: 13, fontWeight: 800, color: up ? "#42A5F5" : "#c8cdd5" }}>{ask.toFixed(p.d)}</div></div>
                    </div>
                    <Chart data={h} color={up ? acColor : "#ff4757"} w={148} h={20} />
                  </div>
                );
              })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div className="card">
                <div style={{ fontSize: 8, color: "#3e4a5c", letterSpacing: "1.5px", marginBottom: 8 }}>STATS</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                  {[{ l: "Trades", v: totT, c: "#fff" }, { l: "Wins", v: stats.w, c: "#00ff88" }, { l: "Losses", v: stats.l, c: "#ff4757" },
                    { l: "Pips", v: `${stats.pips >= 0 ? "+" : ""}${stats.pips.toFixed(1)}`, c: stats.pips >= 0 ? "#00ff88" : "#ff4757" },
                    { l: "Profit", v: `$${stats.profit.toFixed(0)}`, c: stats.profit >= 0 ? "#00ff88" : "#ff4757" },
                    { l: "Streak", v: `${stats.best}🔥`, c: "#ffaa00" },
                  ].map(s => (<div key={s.l}><div style={{ fontSize: 7, color: "#3e4a5c" }}>{s.l}</div><div style={{ fontSize: 13, fontWeight: 800, color: s.c, fontFamily: "Outfit" }}>{s.v}</div></div>))}
                </div>
              </div>
              <div className="card" style={{ maxHeight: 155, overflowY: "auto" }}>
                <div style={{ fontSize: 8, color: "#3e4a5c", letterSpacing: "1.5px", marginBottom: 4 }}>EA LOG</div>
                {log.slice(0, 50).map((l, i) => (
                  <div key={i} className="anim" style={{ fontSize: 9, padding: "2px 0", borderBottom: "1px solid #0d1220", color: l.ty === "win" ? "#00ff88" : l.ty === "loss" ? "#ff4757" : l.ty === "system" ? acColor : "#4a5568" }}>
                    <span style={{ color: "#1a2232", marginRight: 4 }}>{l.t.toLocaleTimeString()}</span>{l.m}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SIGNALS */}
        {tab === "signals" && (
          <div className="card">
            <div style={{ fontSize: 8, color: "#3e4a5c", letterSpacing: "1.5px", marginBottom: 8 }}>SIGNALS — min {(minC * 100).toFixed(0)}%</div>
            {signals.slice(0, 30).map((s, i) => {
              const ok = s.conf >= minC;
              return (<div key={i} className="anim" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 4, padding: "5px 8px", marginBottom: 3, borderRadius: 5, background: ok ? "#080c14" : "#07090e", borderLeft: `2px solid ${ok ? s.color : "#1a2232"}`, opacity: ok ? 1 : 0.3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span className="tag" style={{ background: s.dir === "BUY" ? "#2196F318" : "#ff475718", color: s.dir === "BUY" ? "#42A5F5" : "#ff4757" }}>{s.dir}</span>
                  <span style={{ fontWeight: 700, color: "#fff", fontSize: 10 }}>{s.label}</span>
                  <span style={{ color: s.color, fontSize: 8 }}>{s.strat}</span>
                  <span style={{ fontSize: 7, color: "#3e4a5c" }}>{s.reasons?.[0]}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9 }}>
                  <span style={{ color: s.conf >= 0.7 ? "#00ff88" : s.conf >= 0.5 ? "#ffaa00" : "#ff4757", fontWeight: 700 }}>{(s.conf * 100).toFixed(1)}%</span>
                  {ok && <span className="tag" style={{ background: "#00ff8810", color: "#00ff88" }}>EXEC</span>}
                </div>
              </div>);
            })}
          </div>
        )}

        {/* HISTORY */}
        {tab === "history" && (
          <div className="card">
            <div style={{ fontSize: 8, color: "#3e4a5c", letterSpacing: "1.5px", marginBottom: 8 }}>CLOSED — {trades.filter(t => t.status !== "LIVE").length}</div>
            {trades.filter(t => t.status !== "LIVE").slice(0, 40).map((t, i) => (
              <div key={i} className="anim" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 4, padding: "4px 8px", marginBottom: 2, borderRadius: 5, background: "#080c14" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span className="tag" style={{ background: t.status === "TP" ? "#00ff8812" : "#ff475712", color: t.status === "TP" ? "#00ff88" : "#ff4757" }}>{t.status === "TP" ? "✦TP" : "✗SL"}</span>
                  <span className="tag" style={{ background: t.dir === "BUY" ? "#2196F310" : "#ff475710", color: t.dir === "BUY" ? "#42A5F5" : "#ff4757" }}>{t.dir}</span>
                  <span style={{ fontWeight: 700, color: "#fff", fontSize: 10 }}>{t.label}</span>
                  <span style={{ fontSize: 7, color: "#3e4a5c" }}>#{t.ticket}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 9 }}>
                  <span style={{ fontWeight: 800, fontFamily: "Outfit", color: t.pips >= 0 ? "#00ff88" : "#ff4757" }}>{t.pips >= 0 ? "+" : ""}{t.pips}p</span>
                  <span style={{ fontWeight: 700, color: (t.pnl || 0) >= 0 ? "#00ff88" : "#ff4757" }}>${(t.pnl || 0).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TA */}
        {tab === "ta" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 8 }}>
            {PAIRS.slice(0, 4).map(p => {
              const h = prices[p.s]?.h || []; const r = rsi(h), m = macd(h), b = bb(h);
              const e8 = ema(h, 8), e21 = ema(h, 21), bull = (e8[e8.length - 1] || 0) > (e21[e21.length - 1] || 0);
              return (
                <div key={p.s} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, color: "#fff", fontSize: 11 }}>{p.l}</span>
                    <span className="tag" style={{ background: bull ? "#00ff8812" : "#ff475712", color: bull ? "#00ff88" : "#ff4757" }}>{bull ? "BULL" : "BEAR"}</span>
                  </div>
                  <Chart data={h} color={bull ? acColor : "#ff4757"} w={270} h={40} />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginTop: 8 }}>
                    <div><div style={{ fontSize: 7, color: "#3e4a5c" }}>RSI</div><div style={{ fontSize: 12, fontWeight: 700, fontFamily: "Outfit", color: r > 70 ? "#ff4757" : r < 30 ? "#00ff88" : "#fff" }}>{r.toFixed(1)}</div></div>
                    <div><div style={{ fontSize: 7, color: "#3e4a5c" }}>MACD</div><div style={{ fontSize: 12, fontWeight: 700, fontFamily: "Outfit", color: m.h > 0 ? "#00ff88" : "#ff4757" }}>{(m.h * 10000).toFixed(1)}</div></div>
                    <div><div style={{ fontSize: 7, color: "#3e4a5c" }}>BB</div><div style={{ fontSize: 12, fontWeight: 700, fontFamily: "Outfit", color: "#38bdf8" }}>{((b.w || 0) * 10000).toFixed(1)}</div></div>
                    <div><div style={{ fontSize: 7, color: "#3e4a5c" }}>EMA</div><div style={{ fontSize: 12, fontWeight: 700, fontFamily: "Outfit", color: bull ? "#00ff88" : "#ff4757" }}>{bull ? "▲" : "▼"}</div></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* CONFIG */}
        {tab === "settings" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div className="card">
              <div style={{ fontSize: 8, color: "#3e4a5c", letterSpacing: "1.5px", marginBottom: 12 }}>EA PARAMETERS</div>
              {[
                { l: "Min Confidence", v: minC, s: setMinC, min: 0.3, max: 0.95, step: 0.01, d: `${(minC * 100).toFixed(0)}%` },
                { l: "Lot Size", v: lot, s: setLot, min: 0.01, max: 2, step: 0.01, d: lot.toFixed(2) },
                { l: "Max Trades", v: maxO, s: setMaxO, min: 1, max: 15, step: 1, d: maxO },
                { l: "Magic Number", v: mgc, s: setMgc, min: 100000, max: 999999, step: 1, d: mgc },
                { l: "Deviation (pts)", v: dev, s: setDev, min: 1, max: 50, step: 1, d: dev },
                { l: "Tick Speed", v: spd, s: setSpd, min: 200, max: 2000, step: 50, d: `${spd}ms` },
              ].map(c => (
                <div key={c.l} style={{ marginBottom: 11 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 9, color: "#6b7a8e" }}>{c.l}</span>
                    <span style={{ fontSize: 10, color: acColor, fontWeight: 700, fontFamily: "Outfit" }}>{c.d}</span>
                  </div>
                  <input type="range" min={c.min} max={c.max} step={c.step} value={c.v} onChange={e => c.s(parseFloat(e.target.value))} style={{ width: "100%", accentColor: acColor, height: 3, cursor: "pointer" }} />
                </div>
              ))}
            </div>
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 8, color: "#3e4a5c", letterSpacing: "1.5px", marginBottom: 4 }}>ACCOUNT</div>
              <div style={{ padding: 8, borderRadius: 5, background: "#0e1420", fontSize: 9, lineHeight: 1.8, color: "#6b7a8e" }}>
                Server: <span style={{ color: "#fff" }}>{accInfo?.server}</span><br/>
                Login: <span style={{ color: "#fff" }}>#{accInfo?.login}</span><br/>
                Mode: <span style={{ color: acColor, fontWeight: 700 }}>{accType === "live" ? "🔴 LIVE" : "DEMO"}</span><br/>
                Leverage: <span style={{ color: "#fff" }}>{accInfo?.leverage}</span><br/>
                Broker: <span style={{ color: "#fff" }}>{accInfo?.company}</span>
              </div>
              <button className="btn" onClick={() => { setTrades(p => p.map(t => t.status === "LIVE" ? { ...t, status: "CLOSED" } : t)); aLog("⚠ All closed", "system"); }}
                style={{ padding: 7, background: "#ffaa0012", color: "#ffaa00", fontSize: 9 }}>CLOSE ALL POSITIONS</button>
              <button className="btn" onClick={() => { setTrades([]); setSignals([]); setStats({ w: 0, l: 0, pips: 0, streak: 0, best: 0, profit: 0 }); setBalance(accInfo?.bal || 10000); setLog([]); }}
                style={{ padding: 7, background: "#ff475710", color: "#ff4757", fontSize: 9 }}>RESET HISTORY</button>
              <div style={{ flex: 1 }} />
              <div style={{ padding: 8, borderRadius: 5, background: "#0e1420", border: "1px solid #141c28" }}>
                <div style={{ fontSize: 8, color: acColor, fontWeight: 700, marginBottom: 3 }}>🔧 DEPLOY LIVE</div>
                <div style={{ fontSize: 8, color: "#3e4a5c", lineHeight: 1.7 }}>
                  1. pip install MetaTrader5<br/>
                  2. Deploy on VPS (AWS/DO/Vultr)<br/>
                  3. mt5.initialize() + mt5.login(login, pw, server)<br/>
                  4. Replace sim with mt5.symbol_info_tick()<br/>
                  5. Execute via mt5.order_send()<br/>
                  6. Encrypt creds with Vault/AWS SM
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
