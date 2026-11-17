import { useMemo, useState } from "react";
import { Activity, ArrowUpRight, Check, ChevronDown, Clock3, Code2, FileCode2, Github, LoaderCircle, LockKeyhole, Search, ShieldCheck, Sparkles, Terminal, TriangleAlert, UploadCloud, Zap } from "lucide-react";

type Finding = { category: "bug" | "style" | "security"; severity: "Low" | "Medium" | "High"; title: string; description: string; line: number | null; suggestedFix: string; confidence: number };
type Report = { summary: string; overallRisk: "Low" | "Medium" | "High"; findings: Finding[]; positives: string[]; model?: string; usage?: { inputTokens: number; outputTokens: number; totalTokens: number } | null };
const API = import.meta.env.VITE_API_BASE_URL || "http://localhost:4001";
const sample = `function getUser(userId) {
  const query = "SELECT * FROM users WHERE id = " + userId;
  return db.query(query);
}

function divide(a, b) {
  return a / b;
}`;

export default function App() {
  const [mode, setMode] = useState<"code" | "github">("code");
  const [code, setCode] = useState(sample);
  const [githubUrl, setGithubUrl] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("All findings");
  const [history, setHistory] = useState<{ title: string; time: string }[]>([]);
  const counts = useMemo(() => ({
    high: report?.findings.filter(f => f.severity === "High").length ?? 0,
    medium: report?.findings.filter(f => f.severity === "Medium").length ?? 0,
    low: report?.findings.filter(f => f.severity === "Low").length ?? 0
  }), [report]);
  const visibleFindings = report?.findings.filter(f => activeFilter === "All findings" || f.category === activeFilter.toLowerCase()) ?? [];

  async function analyze() {
    setError(""); setReport(null); setLoading(true);
    try {
      const payload = mode === "code" ? { code, language } : { githubUrl };
      const response = await fetch(`${API}/api/reviews/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Review request failed");
      setReport(data.report ?? data);
      setHistory(items => [{ title: mode === "code" ? "Pasted code review" : githubUrl.split("/").pop() || "GitHub review", time: "Just now" }, ...items].slice(0, 6));
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setLoading(false); }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Code2 size={20}/></div><div><b>ALTA</b><span>DEVELOPER TOOLS</span></div></div>
      <div className="workspace-label">WORKSPACE</div>
      <button className="nav-item active"><Activity size={17}/> Code Reviewer <span className="nav-dot"/></button>
      <button className="nav-item" onClick={() => { setReport(null); setCode(""); setMode("code"); }}><FileCode2 size={17}/> New review <span className="shortcut">⌘ K</span></button>
      <div className="side-divider"/>
      <div className="workspace-label history-label">RECENT REVIEWS</div>
      {history.length ? history.map((item, i) => <button className="history-item" key={i}><Clock3 size={14}/><span>{item.title}</span></button>) : <p className="empty-history">Your recent reviews will appear here.</p>}
      <div className="sidebar-bottom"><div className="secure-card"><div className="secure-icon"><LockKeyhole size={15}/></div><div><b>Private by design</b><span>Your code stays yours.</span></div><ShieldCheck size={16} className="secure-check"/></div><div className="profile"><div className="avatar">A</div><div><b>ALTA Workspace</b><span>Free workspace</span></div><ChevronDown size={15}/></div></div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="crumb">Workspace <span>/</span> <b>Code Reviewer</b></div><div className="top-actions"><span className="api-status"><i/> API ready to connect</span><button className="icon-button" title="Search"><Search size={17}/></button><div className="avatar small">A</div></div></header>
      <div className="content">
        <section className="hero"><div><div className="eyebrow"><Sparkles size={13}/> AI-POWERED CODE INTELLIGENCE</div><h1>Ship better code.<br/><span>Catch issues earlier.</span></h1><p>Your senior AI reviewer is ready. Find bugs, uncover security risks, and improve code quality in seconds.</p></div><div className="hero-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="hero-core"><ShieldCheck size={36}/></div><div className="float-chip chip-a"><Check size={13}/> Quality checked</div><div className="float-chip chip-b"><Zap size={13}/> AI analysis</div></div></section>

        <div className="section-heading"><div><span className="section-kicker">START A REVIEW</span><h2>What should we inspect?</h2></div><span className="secure-note"><LockKeyhole size={13}/> Secure processing</span></div>
        <section className="review-card">
          <div className="input-tabs"><button className={mode === "code" ? "tab selected" : "tab"} onClick={() => setMode("code")}><Code2 size={15}/> Paste code</button><button className={mode === "github" ? "tab selected" : "tab"} onClick={() => setMode("github")}><Github size={15}/> GitHub URL</button><span className="tab-spacer"/><span className="supported"><i/> Supports 20+ languages</span></div>
          {mode === "code" ? <><div className="editor-toolbar"><div className="file-label"><span className="file-icon"><Terminal size={13}/></span> main.{language === "typescript" ? "ts" : language === "python" ? "py" : "js"} <span className="unsaved">•</span></div><select value={language} onChange={e => setLanguage(e.target.value)}><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="python">Python</option><option value="java">Java</option><option value="go">Go</option><option value="sql">SQL</option></select></div><div className="code-wrap"><div className="line-numbers">{code.split("\n").map((_, i) => <span key={i}>{i + 1}</span>)}</div><textarea spellCheck={false} value={code} onChange={e => setCode(e.target.value)} placeholder="Paste your code here..." aria-label="Source code input"/></div><div className="editor-footer"><span>{code.length.toLocaleString()} characters</span><button onClick={() => setCode("")}>Clear code</button></div></> : <div className="github-input"><div className="github-big"><Github size={25}/></div><label>Public GitHub file URL</label><input value={githubUrl} onChange={e => setGithubUrl(e.target.value)} placeholder="https://github.com/owner/repo/blob/main/src/index.ts"/><span>Paste a link to a single public source file. Private repositories aren't supported yet.</span></div>}
          {error && <div className="error-message"><TriangleAlert size={15}/>{error}</div>}
          <div className="submit-row"><div className="review-promise"><ShieldCheck size={15}/> Bugs <span>·</span> Security <span>·</span> Code quality</div><button className="analyze-button" onClick={analyze} disabled={loading || (mode === "code" ? !code.trim() : !githubUrl.trim())}>{loading ? <><LoaderCircle className="spin" size={16}/> Analyzing...</> : <><Sparkles size={16}/> Analyze code <ArrowUpRight size={16}/></>}</button></div>
        </section>

        {loading && <div className="loading-card"><div className="loading-icon"><LoaderCircle className="spin" size={23}/></div><div><b>Your review is in progress</b><span>Scanning for bugs, security risks and quality improvements...</span></div></div>}
        {report && <section className="results"><div className="section-heading"><div><span className="section-kicker">ANALYSIS COMPLETE</span><h2>Review report</h2></div><span className={`risk-pill ${report.overallRisk.toLowerCase()}`}>{report.overallRisk} overall risk</span></div><div className="summary-card"><div className="summary-top"><div className="summary-icon"><ShieldCheck size={20}/></div><div><b>Review summary</b><span>AI-generated analysis · Verify before merging</span></div></div><p>{report.summary}</p><div className="stats-row"><div><b className="high-text">{counts.high}</b><span>High</span></div><div><b className="medium-text">{counts.medium}</b><span>Medium</span></div><div><b className="low-text">{counts.low}</b><span>Low</span></div><div><b>{report.findings.length}</b><span>Total findings</span></div></div></div><div className="filter-row">{["All findings", "Bug", "Security", "Style"].map(f => <button key={f} className={activeFilter === f ? "filter active-filter" : "filter"} onClick={() => setActiveFilter(f)}>{f}</button>)}</div><div className="finding-list">{visibleFindings.map((f, i) => <article className="finding" key={i}><div className="finding-head"><span className={`severity ${f.severity.toLowerCase()}`}>{f.severity}</span><span className="category">{f.category}</span>{f.line && <span className="line-ref">Line {f.line}</span>}</div><h3>{f.title}</h3><p>{f.description}</p><div className="fix"><b>Suggested fix</b><p>{f.suggestedFix}</p></div></article>)}{!visibleFindings.length && <div className="no-findings"><Check size={18}/> No findings in this category.</div>}</div>{report.positives.length > 0 && <div className="positives"><b><Check size={15}/> What looks good</b>{report.positives.map((p, i) => <span key={i}>{p}</span>)}</div>}</section>}
        <footer className="footer"><span>© 2026 ALTA AI Code Reviewer</span><span><span className="footer-dot"/> Built for developers, by developers</span></footer>
      </div>
    </main>
  </div>;
}