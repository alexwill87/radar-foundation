import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { useAuth } from "./context/AuthContext";
import AuthScreen from "./components/AuthScreen";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix Leaflet icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const STATUSES = ["to send", "sent", "response received", "interview", "rejected", "accepted"];
const STATUS_COLORS = {
  "to send": "#64748b", "sent": "#3b82f6", "response received": "#f59e0b",
  "interview": "#8b5cf6", "rejected": "#ef4444", "accepted": "#10b981",
};
const SOURCE_COLORS = {
  "APEC": "#0052cc", "LinkedIn": "#0077b5",
  "Welcome to the Jungle": "#3ddc97", "Indeed": "#003a9b",
  "JobTeaser ENSG": "#e85d04", "JobTeaser IFP": "#7b2d8b", "Other": "#64748b",
};
const CONTRACT_COLORS = {
  "CDI": "#10b981", "CDD": "#f59e0b", "CDD 18 mois": "#f59e0b",
  "Stage": "#8b5cf6", "Internship": "#8b5cf6",
  "Alternance": "#ec4899", "Apprenticeship": "#ec4899",
};

const LATEX_TEMPLATE = `%-------------------------
% CV LaTeX
%------------------------
\\documentclass[letterpaper,11pt]{article}
\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage[top=0.6in,bottom=0.6in,left=0.7in,right=0.7in]{geometry}
\\usepackage{titlesec}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\usepackage{tabularx}
\\usepackage{fontawesome5}
\\usepackage[top=0.5in,bottom=0.5in,left=0.6in,right=0.6in]{geometry}
\\definecolor{light-grey}{gray}{0.83}
\\definecolor{dark-grey}{gray}{0.3}
\\definecolor{text-grey}{gray}{.08}
\\usepackage{tgheros}
\\renewcommand*{\\familydefault}{\\sfdefault}
\\usepackage[T1]{fontenc}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyfoot{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}

\\urlstyle{same}
\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}
\\titleformat{\\section}{\\bfseries \\vspace{2pt} \\raggedright \\large}{}{0em}{}[\\color{light-grey} {\\titlerule[2pt]} \\vspace{-4pt}]
\\newcommand{\\resumeItem}[1]{\\item\\small{{#1 \\vspace{-1pt}}}}
\\newcommand{\\resumeSubheading}[4]{
  \\vspace{-1pt}\\item
    \\begin{tabular*}{\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
      \\textbf{#1} & {\\color{dark-grey}\\small #2}\\vspace{1pt}\\\\
      \\textit{#3} & {\\color{dark-grey} \\small #4}\\\\
    \\end{tabular*}\\vspace{-4pt}}
\\newcommand{\\resumeProjectHeading}[2]{
    \\item
    \\begin{tabular*}{\\textwidth}{l@{\\extracolsep{\\fill}}r}
      #1 & {\\color{dark-grey} #2} \\\\
    \\end{tabular*}\\vspace{-4pt}}
\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0in, label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{0pt}}
\\color{text-grey}
\\begin{document}
[CONTENT]
\\end{document}`;


// ─── API CALLS ────────────────────────────────────────────────────────────────
async function callClaude(prompt) {
  const response = await fetch("http://localhost:3001/api/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json();
  return data.content?.[0]?.text || "";
}

async function fetchFranceTravailOffres() {
  const response = await fetch("http://localhost:3001/api/ft/offres");
  const data = await response.json();
  return data.offres || [];
}

async function fetchWTTJOffres() {
  const response = await fetch("http://localhost:3001/api/wttj/offres");
  const data = await response.json();
  return data.offres || [];
}

async function fetchIndeedOffres() {
  const response = await fetch("http://localhost:3001/api/indeed/offres");
  const data = await response.json();
  return data.offres || [];
}

async function fetchApecOffres() {
  const response = await fetch("http://localhost:3001/api/apec/offres");
  const data = await response.json();
  return data.offres || [];
}

async function fetchJobTeaserOffres(email, password, school) {
  const response = await fetch(
    `http://localhost:3001/api/jobteaser/offres?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&school=${encodeURIComponent(school)}`
  );
  const data = await response.json();
  return data.offres || [];
}

async function geocodeAddress(address) {
  try {
    const res = await fetch(
      `http://localhost:3001/api/geocode?address=${encodeURIComponent(address)}`
    );
    const data = await res.json();
    if (data.lat) return { lat: data.lat, lng: data.lng };
    return null;
  } catch { return null; }
}

async function analyzeJob(job, profileContent) {
  const prompt = `You are an experienced and honest headhunter helping a candidate find the best positions for them.

CANDIDATE PROFILE:
${profileContent}

JOB POSTING:
Title: ${job.title}
Company: ${job.company}
Contract: ${job.contract}
Description: ${job.description}

SCORING RULES:
- JUNIOR / ENTRY-LEVEL position (0-2 years) → score 75-95 if skills are present
- MID-LEVEL position (2-5 years) → score 55-70 max
- SENIOR / EXPERT position (5+ years) → score 40-55 max
- If years of experience explicitly required and not met → penalise heavily
- If key skills for the role are absent from the profile → penalise
- If the domain matches (data, geomatics, ML, Python) even partially → reward

INSTRUCTIONS:
- Find genuine matches between the profile and the posting
- Value transferable skills
- Be honest about the required level vs the candidate's level
- Advice: how to pitch the application realistically
- Never criticise the employer

Reply ONLY with valid JSON, no markdown:
{
  "score": 78,
  "points_forts": ["concrete match between profile and posting"],
  "points_faibles": ["real gap to anticipate in interview"],
  "lacunes": ["missing skill that is essential"],
  "conseil": "how to present the application to maximise chances"
}`;

  const text = await callClaude(prompt);
  try {
    const clean = text.replace(/\`\`\`json|\`\`\`/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return { score: 70, points_forts: ["Compatible profile"], points_faibles: [], lacunes: [], conseil: "Application recommended" };
  }
}

async function generateLatexFromProfile(job, analysis, profileContent) {
  const analysisContext = analysis ? `
AI ANALYSIS RESULTS (use to prioritise content):
- Compatibility score: ${analysis.score}/100
- Strengths to highlight: ${(analysis.points_forts || []).join("; ")}
- Gaps to minimise: ${(analysis.lacunes || []).join("; ")}
` : "";

  const prompt = `You are a LaTeX CV expert. Generate LaTeX CONTENT tailored to this job posting.

CANDIDATE PROFILE (use ONLY this information):
${profileContent}
${analysisContext}
TARGET JOB:
Title: ${job.title}
Company: ${job.company}
Description: ${job.description}

STRICT CONTENT RULES — COUNT EVERY LINE:
1. PROFILE: 2 sentences maximum, 2 lines max
2. WORK EXPERIENCE: 3 positions max
   - Each position: exactly 2 bullets max describing missions, skills, results with metrics
   - Keywords must appear in bullets (e.g. Python, Machine Learning, AWS) if in the profile and relevant to the posting
   - Show how completed missions match the job's requirements
   - Bullets must be concrete and precise, with numbers and results where possible
3. PROJECTS: exactly 2 projects, 1 bullet each, max 10 words per bullet
4. EDUCATION: 3 lines, one line per degree in compact format
5. SKILLS: 4 categories, inline format, no line break between categories
6. Include a clickable LinkedIn link if found in the profile: \\href{LINKEDIN_URL}{LinkedIn}
7. Start with \\begin{center}, NOT \\documentclass
8. Do NOT invent any skill absent from the profile
9. Close all LaTeX environments correctly
10. If profile information matches a job requirement very well, highlight it prominently
11. If a key skill for the job is absent from the profile, minimise that gap tactfully
12. Margins must be respected — CV must fit on one page, no empty sections, no overflow

EXACT STRUCTURE:
\\begin{center}
FULL NAME \\\\ contact info | \\href{...}{LinkedIn} | city \\\\ adapted job title
\\end{center}
\\section*{PROFILE}
2 sentences max.
\\section*{WORK EXPERIENCE}
3 positions, 2 bullets each.
\\section*{PROJECTS}
2 projects, 1 bullet each.
\\section*{EDUCATION}
3 compact lines.
\\section*{SKILLS}
4 inline lines.`;

  const result = await callClaude(prompt);
  return result.replace(/```latex|```/g, "").trim();
}

async function compileLatexToPdf(latex) {
  const response = await fetch("http://localhost:3001/api/latex/compile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ latex })
  });
  if (!response.ok) throw new Error("PDF compilation failed");
  const blob = await response.blob();
  return blob;
}

// ─── SUPABASE OPS ─────────────────────────────────────────────────────────────
async function saveCandidature(job, analysis, latex, userId) {
  const geo = await geocodeAddress(job.location);
  const { data, error } = await supabase.from("candidatures").insert({
    user_id: userId,
    date_candidature: new Date().toISOString().split("T")[0],
    titre_poste: job.title,
    entreprise: job.company,
    source: job.source,
    secteur: job.secteur || "Other",
    contrat: job.contract,
    localisation: job.location,
    adresse_complete: geo?.display || job.location,
    latitude: geo?.lat || null,
    longitude: geo?.lng || null,
    statut: "to send",
    score_compatibilite: analysis?.score || null,
    points_forts: analysis?.points_forts || [],
    points_faibles: analysis?.points_faibles || [],
    lacunes: analysis?.lacunes || [],
    conseil: analysis?.conseil || "",
    cv_latex: latex || "",
    notes: "",
    url_offre: job.url || "",
    description_offre: job.description || "",
  }).select();
  return { data, error };
}

async function loadCandidatures(userId) {
  const { data } = await supabase
    .from("candidatures")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data || [];
}

async function updateStatut(id, statut) {
  await supabase.from("candidatures").update({ statut }).eq("id", id);
}

async function updateNotes(id, notes) {
  await supabase.from("candidatures").update({ notes }).eq("id", id);
}

async function loadProfil(userId) {
  const { data } = await supabase
    .from("profil")
    .select("*")
    .eq("user_id", userId)
    .eq("actif", true)
    .order("created_at", { ascending: false });
  return data || [];
}

async function saveProfil(type, titre, contenu, userId) {
  const { data } = await supabase
    .from("profil")
    .insert({ user_id: userId, type, titre, contenu, actif: true })
    .select();
  return data;
}

// ─── COMPONENTS ──────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 56 }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth={6} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 700, color, fontFamily: "'Space Mono', monospace" }}>{score}</div>
    </div>
  );
}

function Tag({ label, color = "#334155" }) {
  return (
    <span style={{ background: color+"22", color, border: `1px solid ${color}44`,
      borderRadius: 4, padding: "2px 8px", fontSize: 11,
      fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap" }}>{label}</span>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 2000,
      background: toast.type === "error" ? "#1a0a0a" : "#0a1a14",
      border: `1px solid ${toast.type === "error" ? "#ef4444" : "#10b981"}`,
      color: toast.type === "error" ? "#ef4444" : "#6ee7b7",
      padding: "10px 16px", borderRadius: 8,
      fontFamily: "'Space Mono', monospace", fontSize: 12,
      boxShadow: "0 4px 20px #0008" }}>{toast.msg}</div>
  );
}

// ─── PROFILE PANEL ────────────────────────────────────────────────────────────
function ProfilePanel({ profilItems, userId, onRefresh, showToast }) {
  const [tab, setTab] = useState("list");
  const [titre, setTitre] = useState("");
  const [contenu, setContenu] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const handleSaveManual = async () => {
    if (!titre.trim()) return showToast("Title is required", "error");
    if (!contenu.trim()) return showToast("Content is required", "error");
    setSaving(true);
    await saveProfil("experience_manuelle", titre.trim(), contenu.trim(), userId);
    setSaving(false);
    setTitre("");
    setContenu("");
    onRefresh();
    showToast("Experience added!");
    setTab("list");
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);

    try {
      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.mjs",
          import.meta.url
        ).toString();
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          fullText += textContent.items.map(item => item.str).join(" ") + "\n";
        }
        await saveProfil("cv_upload", file.name, fullText.trim(), userId);
        showToast(`PDF "${file.name}" extracted and saved!`);
      } else {
        const text = await file.text();
        await saveProfil("cv_upload", file.name, text.trim(), userId);
        showToast(`File "${file.name}" saved!`);
      }

      onRefresh();
      setTab("list");
    } catch (err) {
      showToast("File read error: " + err.message, "error");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (id) => {
    await supabase.from("profil").update({ actif: false }).eq("id", id).eq("user_id", userId);
    onRefresh();
    showToast("Item deleted");
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[
          { id: "list", label: "My profile", count: profilItems.length },
          { id: "upload", label: "Upload file" },
          { id: "manual", label: "Manual entry" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
            background: tab === t.id ? "#1e3a5f" : "#0d1117",
            color: tab === t.id ? "#93c5fd" : "#475569",
            fontSize: 12, fontFamily: "'Space Mono', monospace",
            border: `1px solid ${tab === t.id ? "#3b82f644" : "#1e293b"}`
          }}>
            {t.label}
            {t.count > 0 && (
              <span style={{ marginLeft: 6, background: "#1e293b", borderRadius: 10,
                padding: "1px 6px", fontSize: 10 }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* LIST TAB */}
      {tab === "list" && (
        <div>
          {profilItems.length === 0 ? (
            <div style={{ background: "#0d1117", border: "1px solid #1e293b",
              borderRadius: 12, padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
              <div style={{ color: "#475569", fontSize: 13,
                fontFamily: "'Space Mono', monospace", marginBottom: 16 }}>
                Your profile is empty — add your CV or work experience!
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button onClick={() => setTab("upload")} style={{
                  padding: "8px 16px", borderRadius: 8, border: "none",
                  background: "#1e3a5f", color: "#93c5fd", cursor: "pointer",
                  fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
                  Upload a CV
                </button>
                <button onClick={() => setTab("manual")} style={{
                  padding: "8px 16px", borderRadius: 8, border: "none",
                  background: "#1a3a2a", color: "#6ee7b7", cursor: "pointer",
                  fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
                  Manual entry
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {profilItems.map(item => (
                <div key={item.id} style={{ background: "#0d1117",
                  border: "1px solid #1e293b", borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center",
                    justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        fontSize: 10,
                        color: item.type === "cv_upload" ? "#8b5cf6" : "#3b82f6",
                        background: item.type === "cv_upload" ? "#2d1b6922" : "#1e3a5f22",
                        border: `1px solid ${item.type === "cv_upload" ? "#8b5cf644" : "#3b82f644"}`,
                        borderRadius: 4, padding: "2px 8px",
                        fontFamily: "'Space Mono', monospace" }}>
                        {item.type === "cv_upload" ? "File" : "Manual"}
                      </span>
                      <span style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 600,
                        fontFamily: "'Sora', sans-serif" }}>{item.titre}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                        style={{ padding: "3px 8px", borderRadius: 6,
                          border: "1px solid #1e293b", background: "transparent",
                          color: "#64748b", cursor: "pointer", fontSize: 11 }}>
                        {expandedId === item.id ? "▲ Collapse" : "▼ View"}
                      </button>
                      <button onClick={() => handleDelete(item.id)}
                        style={{ padding: "3px 8px", borderRadius: 6,
                          border: "1px solid #ef444444", background: "transparent",
                          color: "#ef4444", cursor: "pointer", fontSize: 11 }}>
                        🗑
                      </button>
                    </div>
                  </div>

                  {expandedId === item.id ? (
                    <pre style={{ color: "#94a3b8", fontSize: 11, lineHeight: 1.6,
                      fontFamily: "'Space Mono', monospace", whiteSpace: "pre-wrap",
                      background: "#0a0f1a", borderRadius: 8, padding: 12,
                      maxHeight: 300, overflow: "auto", margin: 0 }}>
                      {item.contenu}
                    </pre>
                  ) : (
                    <div style={{ color: "#475569", fontSize: 11,
                      fontFamily: "'Space Mono', monospace" }}>
                      {item.contenu.slice(0, 120)}...
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* UPLOAD TAB */}
      {tab === "upload" && (
        <div style={{ background: "#0d1117", border: "1px solid #1e293b",
          borderRadius: 12, padding: 30 }}>
          <h3 style={{ color: "#f1f5f9", fontSize: 14, fontWeight: 700,
            fontFamily: "'Sora', sans-serif", marginBottom: 8 }}>
            Upload a CV file
          </h3>
          <p style={{ color: "#64748b", fontSize: 12,
            fontFamily: "'Space Mono', monospace", marginBottom: 20 }}>
            Accepted formats: <strong style={{ color: "#93c5fd" }}>PDF, TXT, TEX, MD</strong>
          </p>

          <label style={{ display: "block", border: "2px dashed #1e293b",
            borderRadius: 12, padding: 30, textAlign: "center", cursor: "pointer",
            transition: "border-color 0.2s" }}
            onMouseOver={e => e.currentTarget.style.borderColor = "#3b82f6"}
            onMouseOut={e => e.currentTarget.style.borderColor = "#1e293b"}>
            <input type="file" accept=".pdf,.txt,.tex,.md"
              onChange={handleFileUpload} style={{ display: "none" }} />
            {loading ? (
              <div>
                <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
                <div style={{ color: "#f59e0b", fontSize: 13,
                  fontFamily: "'Space Mono', monospace" }}>
                  Reading file...
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 40, marginBottom: 10 }}>📂</div>
                <div style={{ color: "#f1f5f9", fontSize: 13,
                  fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>
                  Click to choose a file
                </div>
                <div style={{ color: "#475569", fontSize: 11,
                  fontFamily: "'Space Mono', monospace" }}>
                  PDF · TXT · TEX · MD
                </div>
              </div>
            )}
          </label>

          <div style={{ marginTop: 16, background: "#0a0f1a", borderRadius: 8,
            padding: "10px 14px", color: "#475569", fontSize: 11,
            fontFamily: "'Space Mono', monospace" }}>
            💡 <strong style={{ color: "#f59e0b" }}>Tip:</strong> The richer your profile,
            the more accurate and faithful the generated CVs will be. Add all your CVs!
          </div>
        </div>
      )}

      {/* MANUAL TAB */}
      {tab === "manual" && (
        <div style={{ background: "#0d1117", border: "1px solid #1e293b",
          borderRadius: 12, padding: 24 }}>
          <h3 style={{ color: "#f1f5f9", fontSize: 14, fontWeight: 700,
            fontFamily: "'Sora', sans-serif", marginBottom: 16 }}>
            Manual experience entry
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ color: "#64748b", fontSize: 11,
                fontFamily: "'Space Mono', monospace", display: "block", marginBottom: 4 }}>
                Title *
              </label>
              <input value={titre} onChange={e => setTitre(e.target.value)}
                placeholder="E.g. TotalEnergies Internship 2025, Python Skills, ENSG Degree..."
                style={{ width: "100%", padding: "10px 14px", borderRadius: 8,
                  border: "1px solid #1e293b", background: "#0a0f1a",
                  color: "#f1f5f9", fontSize: 12,
                  fontFamily: "'Space Mono', monospace", outline: "none",
                  boxSizing: "border-box" }} />
            </div>

            <div>
              <label style={{ color: "#64748b", fontSize: 11,
                fontFamily: "'Space Mono', monospace", display: "block", marginBottom: 4 }}>
                Content *
              </label>
              <textarea value={contenu} onChange={e => setContenu(e.target.value)}
                placeholder={`Describe in detail:
- Your missions and responsibilities
- Technologies used
- Your results and achievements
- Key skills

Example:
Data Scientist Intern - Institut Curie (2024-2025)
• Built ETL pipelines in Python/SQL for 44,000 clinical records
• Predictive ML model with 82% recall and AUC 0.85
• Geocoding and spatial analysis with GeoPandas`}
                rows={12}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 8,
                  border: "1px solid #1e293b", background: "#0a0f1a",
                  color: "#f1f5f9", fontSize: 12, lineHeight: 1.6,
                  fontFamily: "'Space Mono', monospace", outline: "none",
                  resize: "vertical", boxSizing: "border-box" }} />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => { setTitre(""); setContenu(""); }}
                style={{ padding: "9px 18px", borderRadius: 8,
                  border: "1px solid #1e293b", background: "transparent",
                  color: "#64748b", cursor: "pointer",
                  fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
                Clear
              </button>
              <button onClick={handleSaveManual} disabled={saving}
                style={{ padding: "9px 24px", borderRadius: 8, border: "none",
                  cursor: saving ? "wait" : "pointer",
                  background: saving ? "#1e293b" : "#1a3a2a",
                  color: saving ? "#475569" : "#6ee7b7",
                  fontSize: 12, fontFamily: "'Space Mono', monospace",
                  fontWeight: 700 }}>
                {saving ? "⏳ Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── APPLICATIONS TRACKER ──────────────────────────────────────────────────────
function ApplicationsTracker({ candidatures, onRefresh, showToast }) {
  const [editNotes, setEditNotes] = useState({});
  const [expandedId, setExpandedId] = useState(null);

  const handleStatus = async (id, statut) => {
    await updateStatut(id, statut);
    onRefresh();
    showToast("Status updated!");
  };

  const handleNotes = async (id) => {
    await updateNotes(id, editNotes[id] || "");
    onRefresh();
    showToast("Notes saved!");
  };

  if (candidatures.length === 0) {
    return (
      <div style={{ background: "#0d1117", border: "1px solid #1e293b", borderRadius: 12, padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
        <div style={{ color: "#475569", fontSize: 13, fontFamily: "'Space Mono', monospace" }}>
          No applications yet. Analyse a job, generate a CV, and save your first application!
        </div>
      </div>
    );
  }

  const statsByStatus = STATUSES.reduce((acc, s) => {
    acc[s] = candidatures.filter(c => c.statut === s).length;
    return acc;
  }, {});
  const avgScore = candidatures.filter(c => c.score_compatibilite).length
    ? Math.round(candidatures.filter(c => c.score_compatibilite).reduce((s, c) => s + c.score_compatibilite, 0) / candidatures.filter(c => c.score_compatibilite).length)
    : null;

  return (
    <div>
      {/* Stats bar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {Object.entries(statsByStatus).filter(([,v]) => v > 0).map(([statut, count]) => (
          <div key={statut} style={{ background: (STATUS_COLORS[statut]||"#64748b")+"22",
            border: `1px solid ${(STATUS_COLORS[statut]||"#64748b")}44`,
            borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: STATUS_COLORS[statut]||"#64748b", fontSize: 18, fontWeight: 800,
              fontFamily: "'Space Mono', monospace" }}>{count}</span>
            <span style={{ color: "#64748b", fontSize: 11, fontFamily: "'Space Mono', monospace" }}>{statut}</span>
          </div>
        ))}
        {avgScore && (
          <div style={{ background: "#10b98122", border: "1px solid #10b98144",
            borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#10b981", fontSize: 18, fontWeight: 800, fontFamily: "'Space Mono', monospace" }}>{avgScore}%</span>
            <span style={{ color: "#64748b", fontSize: 11, fontFamily: "'Space Mono', monospace" }}>avg score</span>
          </div>
        )}
      </div>

      {/* List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {candidatures.map(c => (
          <div key={c.id} style={{ background: "#0d1117", border: "1px solid #1e293b",
            borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <Tag label={c.source} color={SOURCE_COLORS[c.source]||"#64748b"} />
                  <Tag label={c.contrat} color={CONTRACT_COLORS[c.contrat]||"#64748b"} />
                  <Tag label={c.secteur} color="#8b5cf6" />
                </div>
                <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 13, marginBottom: 2,
                  fontFamily: "'Sora', sans-serif" }}>{c.titre_poste}</div>
                <div style={{ color: "#64748b", fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
                  {c.entreprise} · {c.localisation} · {c.date_candidature}
                  {c.latitude && <span style={{ color: "#3b82f6" }}> 📍 {c.latitude?.toFixed(2)}, {c.longitude?.toFixed(2)}</span>}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {c.score_compatibilite && <ScoreRing score={c.score_compatibilite} size={44} />}
                <select value={c.statut} onChange={e => handleStatus(c.id, e.target.value)}
                  style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${(STATUS_COLORS[c.statut]||"#64748b")}44`,
                    background: (STATUS_COLORS[c.statut]||"#64748b")+"22",
                    color: STATUS_COLORS[c.statut]||"#64748b",
                    fontSize: 11, fontFamily: "'Space Mono', monospace", cursor: "pointer" }}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #1e293b",
                    background: "transparent", color: "#64748b", cursor: "pointer", fontSize: 12 }}>
                  {expandedId === c.id ? "▲" : "▼"}
                </button>
              </div>
            </div>

            {expandedId === c.id && (
              <div style={{ marginTop: 12, borderTop: "1px solid #1e293b", paddingTop: 12 }}>
                {c.lacunes?.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ color: "#f59e0b", fontSize: 11, fontFamily: "'Space Mono', monospace",
                      marginBottom: 4, fontWeight: 700 }}>⚠️ Identified gaps:</div>
                    {c.lacunes.map((l, i) => (
                      <div key={i} style={{ color: "#94a3b8", fontSize: 11,
                        fontFamily: "'Space Mono', monospace" }}>• {l}</div>
                    ))}
                  </div>
                )}
                {c.conseil && (
                  <div style={{ background: "#1e293b", borderRadius: 6, padding: "6px 10px",
                    color: "#cbd5e1", fontSize: 11, fontStyle: "italic",
                    fontFamily: "'Space Mono', monospace", marginBottom: 10 }}>
                    💡 {c.conseil}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <textarea
                    value={editNotes[c.id] !== undefined ? editNotes[c.id] : (c.notes || "")}
                    onChange={e => setEditNotes(p => ({ ...p, [c.id]: e.target.value }))}
                    placeholder="Personal notes..."
                    rows={2}
                    style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid #1e293b",
                      background: "#0a0f1a", color: "#94a3b8", fontSize: 11,
                      fontFamily: "'Space Mono', monospace", resize: "none", outline: "none" }} />
                  <button onClick={() => handleNotes(c.id)}
                    style={{ padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                      background: "#1a3a2a", color: "#6ee7b7", fontSize: 11,
                      fontFamily: "'Space Mono', monospace", alignSelf: "flex-end" }}>
                    💾
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── LATEX MODAL ──────────────────────────────────────────────────────────────
function LatexModal({ latex, job, user, onClose, onSave, saving }) {
  const [copied, setCopied] = useState(false);
  const [compilingPdf, setCompilingPdf] = useState(false);
  const fullLatex = LATEX_TEMPLATE.replace("[CONTENT]", latex);

  const userName = user?.user_metadata?.full_name?.replace(/\s+/g, "_")
    || user?.email?.split("@")[0]
    || "CV";

  const downloadPdf = async () => {
    setCompilingPdf(true);
    try {
      const blob = await compileLatexToPdf(fullLatex);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${userName}_${job.company.replace(/\s+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("PDF error: " + err.message);
    } finally {
      setCompilingPdf(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(fullLatex);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    const blob = new Blob([fullLatex], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${userName}_${job.company.replace(/\s+/g, "_")}.tex`;
    a.click();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#00000099",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, backdropFilter: "blur(4px)", padding: 20 }}>
      <div style={{ background: "#0d1117", border: "1px solid #1e293b",
        borderRadius: 16, width: "100%", maxWidth: 820,
        maxHeight: "90vh", display: "flex", flexDirection: "column",
        boxShadow: "0 25px 60px #000a" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid #1e293b" }}>
          <div>
            <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15,
              fontFamily: "'Sora', sans-serif" }}>CV LaTeX — {job.company}</div>
            <div style={{ color: "#64748b", fontSize: 12,
              fontFamily: "'Space Mono', monospace" }}>{job.title}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={copy} style={{ padding: "7px 14px", borderRadius: 8,
              border: "1px solid #1e293b", background: copied ? "#1a3a2a" : "#1e293b",
              color: copied ? "#6ee7b7" : "#94a3b8", cursor: "pointer",
              fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
              {copied ? "✓ Copied!" : "Copy"}
            </button>
            <button onClick={download} style={{ padding: "7px 14px", borderRadius: 8,
              border: "none", background: "#1e3a5f", color: "#93c5fd",
              cursor: "pointer", fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
              ⬇ .tex
            </button>
            <button onClick={downloadPdf} disabled={compilingPdf} style={{
              padding: "7px 14px", borderRadius: 8, border: "none",
              background: compilingPdf ? "#1e293b" : "#1a0a2a",
              color: compilingPdf ? "#475569" : "#c084fc",
              cursor: compilingPdf ? "wait" : "pointer",
              fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
              {compilingPdf ? "⏳ Compiling..." : "PDF"}
            </button>
            <button onClick={onSave} disabled={saving} style={{ padding: "7px 14px", borderRadius: 8,
              border: "none", background: saving ? "#1e293b" : "#1a3a2a",
              color: saving ? "#475569" : "#6ee7b7",
              cursor: saving ? "wait" : "pointer",
              fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
              {saving ? "⏳..." : "💾 Save application"}
            </button>
            <button onClick={onClose} style={{ padding: "7px 12px", borderRadius: 8,
              border: "1px solid #1e293b", background: "transparent",
              color: "#ef4444", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>
        </div>
        <div style={{ padding: "8px 20px", background: "#1a3a2a44",
          borderBottom: "1px solid #1e293b", color: "#6ee7b7",
          fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
          💡 Compile on overleaf.com (free) · Upload the .tex file
        </div>
        <pre style={{ flex: 1, overflow: "auto", margin: 0, padding: "16px 20px",
          color: "#94a3b8", fontSize: 11, lineHeight: 1.6,
          fontFamily: "'Space Mono', monospace", background: "transparent" }}>
          {fullLatex}
        </pre>
      </div>
    </div>
  );
}

// ─── JOB CARD ─────────────────────────────────────────────────────────────────
function JobCard({ job, analysis, onAnalyze, onGenerate, onApply, candidatures, isAnalyzing, isGenerating }) {
  const alreadyApplied = candidatures?.some(c =>
    c.titre_poste?.toLowerCase() === job.title?.toLowerCase() ||
    (c.entreprise?.toLowerCase() === job.company?.toLowerCase() &&
     c.titre_poste?.toLowerCase().includes(job.title?.toLowerCase().slice(0, 15)))
  );

  return (
    <div style={{ background: "#0d1117", border: "1px solid #1e293b",
      borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
            <Tag label={job.source} color={SOURCE_COLORS[job.source]||"#64748b"} />
            <Tag label={job.contract} color={CONTRACT_COLORS[job.contract]||"#64748b"} />
            <Tag label={job.secteur} color="#8b5cf6" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 700, margin: 0,
              fontFamily: "'Sora', sans-serif" }}>{job.title}</h3>
            {alreadyApplied && (
              <span style={{ background: "#ef444422", color: "#ef4444",
                border: "1px solid #ef444444", borderRadius: 4,
                padding: "2px 8px", fontSize: 10,
                fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap" }}>
                ✓ Applied
              </span>
            )}
          </div>
          <div style={{ color: "#64748b", fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
            {job.company} · {job.location} · {job.date ? new Date(job.date).toLocaleDateString('en-GB') : ""}
          </div>
        </div>
        {analysis && <ScoreRing score={analysis.score} />}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
        {job.tags.slice(0, 4).map(t => <Tag key={t} label={t} color="#3b82f6" />)}
      </div>

      {analysis && (
        <div style={{ borderTop: "1px solid #1e293b", paddingTop: 8, marginBottom: 10 }}>
          {analysis.points_forts?.slice(0,2).map(p => (
            <div key={p} style={{ display: "flex", gap: 6, marginBottom: 2 }}>
              <span style={{ color: "#10b981", fontSize: 10 }}>✓</span>
              <span style={{ color: "#94a3b8", fontSize: 11, fontFamily: "'Space Mono', monospace" }}>{p}</span>
            </div>
          ))}
          {analysis.lacunes?.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
              <span style={{ color: "#f59e0b", fontSize: 10 }}>⚠</span>
              <span style={{ color: "#94a3b8", fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
                {analysis.lacunes[0]}
              </span>
            </div>
          )}
          {analysis.conseil && (
            <div style={{ background: "#1e293b", borderRadius: 6, padding: "5px 8px",
              color: "#cbd5e1", fontSize: 10, fontStyle: "italic",
              fontFamily: "'Space Mono', monospace" }}>💡 {analysis.conseil}</div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => onAnalyze(job)} disabled={isAnalyzing} style={{
          flex: 1, padding: "7px 0", borderRadius: 6, border: "none",
          cursor: isAnalyzing ? "wait" : "pointer",
          background: isAnalyzing ? "#1e293b" : "#1e3a5f",
          color: isAnalyzing ? "#475569" : "#93c5fd",
          fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
          {isAnalyzing ? "⏳ Analysing..." : analysis ? "Re-analyse" : "Analyse"}
        </button>

        <button onClick={() => onGenerate(job, analysis)} disabled={isGenerating || !analysis} style={{
          flex: 1, padding: "7px 0", borderRadius: 6, border: "none",
          cursor: (isGenerating || !analysis) ? "not-allowed" : "pointer",
          background: (isGenerating || !analysis) ? "#1e293b" : "#1a3a2a",
          color: (isGenerating || !analysis) ? "#475569" : "#6ee7b7",
          fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
          {isGenerating ? "⏳ Generating..." : "CV LaTeX"}
        </button>

        <button onClick={() => onApply(job)} disabled={!job.url} style={{
          flex: 1, padding: "7px 0", borderRadius: 6, border: "none",
          cursor: !job.url ? "not-allowed" : "pointer",
          background: !job.url ? "#1e293b" : "#1a2a1a",
          color: !job.url ? "#475569" : "#34d399",
          fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
          Apply →
        </button>
      </div>
    </div>
  );
}

// ─── MAP VIEW ─────────────────────────────────────────────────────────────────
function MapView({ jobs, candidatures, analyses, onApply }) {
  const [geoJobs, setGeoJobs] = useState([]);

  useEffect(() => {
    const geocodeAll = async () => {
      const results = [];

      for (const c of (candidatures || [])) {
        if (c.latitude && c.longitude) {
          results.push({
            id: `cand_${c.id}`,
            title: c.titre_poste,
            company: c.entreprise,
            location: c.localisation,
            latitude: c.latitude,
            longitude: c.longitude,
            url: c.url_offre,
            source: c.source,
            contract: c.contrat,
            score: c.score_compatibilite,
          });
        }
      }

      for (const job of jobs) {
        if (job.latitude && job.longitude) {
          results.push(job);
        } else if (job.location) {
          const geo = await geocodeAddress(job.location);
          if (geo) {
            results.push({ ...job, latitude: geo.lat, longitude: geo.lng });
          }
        }
      }

      setGeoJobs(results);
    };
    geocodeAll();
  }, [jobs, candidatures]);

  const getColor = (score) => {
    if (!score) return "#64748b";
    if (score >= 80) return "#10b981";
    if (score >= 60) return "#f59e0b";
    return "#ef4444";
  };

  const createIcon = (score) => L.divIcon({
    className: "",
    html: `<div style="
      background: ${getColor(score)};
      width: 32px; height: 32px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 2px solid white;
      box-shadow: 0 2px 8px #0006;
      display: flex; align-items: center; justify-content: center;
    ">
      <span style="transform: rotate(45deg); color: white; font-size: 11px; font-weight: 700;">
        ${score || "?"}
      </span>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });

  return (
    <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #1e293b" }}>
      <div style={{ background: "#0d1117", padding: "10px 16px",
        display: "flex", gap: 16, alignItems: "center",
        borderBottom: "1px solid #1e293b" }}>
        <span style={{ color: "#64748b", fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
          📍 {geoJobs.length} geolocated out of {jobs.length + (candidatures?.length || 0)}
        </span>
        <div style={{ display: "flex", gap: 10 }}>
          {[["#10b981", "Score ≥ 80"], ["#f59e0b", "Score 60-79"], ["#ef4444", "Score < 60"], ["#64748b", "Not analysed"]].map(([color, label]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
              <span style={{ color: "#64748b", fontSize: 10, fontFamily: "'Space Mono', monospace" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {geoJobs.length === 0 ? (
        <div style={{ background: "#0d1117", padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🗺️</div>
          <div style={{ color: "#475569", fontSize: 13, fontFamily: "'Space Mono', monospace" }}>
            Load some jobs then click "Analyse all" to geolocate them!
          </div>
        </div>
      ) : (
        <MapContainer center={[46.8, 2.3]} zoom={6} style={{ height: "600px", width: "100%" }}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='© OpenStreetMap © CARTO'
          />
          {geoJobs.map(job => {
            const analysis = analyses[job.id];
            return (
              <Marker
                key={job.id}
                position={[job.latitude, job.longitude]}
                icon={createIcon(analysis?.score || job.score)}
              >
                <Popup>
                  <div style={{ minWidth: 200, fontFamily: "sans-serif" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                      {job.title}
                    </div>
                    <div style={{ color: "#666", fontSize: 11, marginBottom: 6 }}>
                      {job.company} · {job.location}
                    </div>
                    {(analysis || job.score) && (
                      <div style={{
                        background: getColor(analysis?.score || job.score) + "22",
                        border: `1px solid ${getColor(analysis?.score || job.score)}`,
                        borderRadius: 6, padding: "4px 8px",
                        color: getColor(analysis?.score || job.score),
                        fontWeight: 700, fontSize: 13,
                        marginBottom: 6, display: "inline-block"
                      }}>
                        Score: {analysis?.score || job.score}/100
                      </div>
                    )}
                    {analysis?.conseil && (
                      <div style={{ fontSize: 11, color: "#444", marginBottom: 8, fontStyle: "italic" }}>
                        💡 {analysis.conseil}
                      </div>
                    )}
                    <button onClick={() => onApply(job)} style={{
                      width: "100%", padding: "6px", borderRadius: 6,
                      border: "none", background: "#10b981",
                      color: "white", cursor: "pointer",
                      fontSize: 12, fontWeight: 700
                    }}>
                      Apply →
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      )}
    </div>
  );
}


// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const { user, loading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState("jobs");
  const [analyses, setAnalyses] = useState({});
  const [analyzing, setAnalyzing] = useState({});
  const [generating, setGenerating] = useState({});
  const [latexModal, setLatexModal] = useState(null);
  const [savingApplication, setSavingApplication] = useState(false);
  const [toast, setToast] = useState(null);
  const [profilItems, setProfilItems] = useState([]);
  const [candidatures, setCandidatures] = useState([]);
  const [filter, setFilter] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [filterDate, setFilterDate] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [analyzeAll, setAnalyzeAll] = useState(false);
  const [stopAnalysis, setStopAnalysis] = useState(false);

  const [fetchingFT, setFetchingFT] = useState(false);
  const [ftOffres, setFtOffres] = useState([]);

  const [fetchingWTTJ, setFetchingWTTJ] = useState(false);
  const [wttjOffres, setWttjOffres] = useState([]);

  const [fetchingIndeed, setFetchingIndeed] = useState(false);
  const [indeedOffres, setIndeedOffres] = useState([]);

  const [fetchingApec, setFetchingApec] = useState(false);
  const [apecOffres, setApecOffres] = useState([]);

  const [fetchingJT, setFetchingJT] = useState(false);
  const [jtOffres, setJtOffres] = useState([]);
  const [showJTModal, setShowJTModal] = useState(false);
  const [jtEmail, setJtEmail] = useState("");
  const [jtPassword, setJtPassword] = useState("");
  const [jtSchool, setJtSchool] = useState("");

  // Show auth screen while loading or if not logged in
  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#080c14", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#475569", fontFamily: "'Space Mono', monospace", fontSize: 13 }}>Loading...</div>
      </div>
    );
  }
  if (!user) return <AuthScreen />;

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const getProfileContent = () => {
    if (profilItems.length === 0) {
      return "No profile found. Please add your CV or experience in the Profile tab.";
    }
    return profilItems.map(p => `[${p.titre}]\n${p.contenu}`).join("\n\n");
  };

  const refreshProfile = async () => {
    const data = await loadProfil(user.id);
    setProfilItems(data);
  };

  const refreshApplications = async () => {
    const data = await loadCandidatures(user.id);
    setCandidatures(data);
  };

  // Load on mount when user is available
  // Note: these are called inside the render path — we use a separate effect below

  const handleFetchFT = async () => {
    setFetchingFT(true);
    showToast("Fetching France Travail jobs...");
    try {
      const offres = await fetchFranceTravailOffres();
      if (offres.length > 0) {
        setFtOffres(offres);
        showToast(`${offres.length} France Travail jobs loaded!`);
      } else {
        showToast("No France Travail jobs found", "error");
      }
    } catch (err) {
      showToast("France Travail error: " + err.message, "error");
    } finally {
      setFetchingFT(false);
    }
  };

  const handleFetchWTTJ = async () => {
    setFetchingWTTJ(true);
    showToast("Fetching WTTJ jobs...");
    try {
      const offres = await fetchWTTJOffres();
      if (offres.length > 0) {
        setWttjOffres(offres);
        showToast(`${offres.length} WTTJ jobs loaded!`);
      } else {
        showToast("No WTTJ jobs found", "error");
      }
    } catch (err) {
      showToast("WTTJ error: " + err.message, "error");
    } finally {
      setFetchingWTTJ(false);
    }
  };

  const handleFetchIndeed = async () => {
    setFetchingIndeed(true);
    showToast("Fetching Indeed jobs...");
    try {
      const offres = await fetchIndeedOffres();
      if (offres.length > 0) {
        setIndeedOffres(offres);
        showToast(`${offres.length} Indeed jobs loaded!`);
      } else {
        showToast("No Indeed jobs found", "error");
      }
    } catch (err) {
      showToast("Indeed error: " + err.message, "error");
    } finally {
      setFetchingIndeed(false);
    }
  };

  const handleFetchApec = async () => {
    setFetchingApec(true);
    showToast("Fetching APEC jobs...");
    try {
      const offres = await fetchApecOffres();
      if (offres.length > 0) {
        setApecOffres(offres);
        showToast(`${offres.length} APEC jobs loaded!`);
      } else {
        showToast("No APEC jobs found", "error");
      }
    } catch (err) {
      showToast("APEC error: " + err.message, "error");
    } finally {
      setFetchingApec(false);
    }
  };

  const handleFetchJT = async () => {
    if (!jtEmail || !jtPassword) return showToast("Email and password are required", "error");
    if (!jtSchool.trim()) return showToast("School name is required", "error");
    setFetchingJT(true);
    setShowJTModal(false);
    showToast(`Connecting to JobTeaser (${jtSchool})...`);
    try {
      const offres = await fetchJobTeaserOffres(jtEmail, jtPassword, jtSchool.trim());
      if (offres.length > 0) {
        setJtOffres(prev => [
          ...prev.filter(o => !o.source?.includes(jtSchool)),
          ...offres,
        ]);
        showToast(`${offres.length} JobTeaser jobs loaded!`);
      } else {
        showToast("No JobTeaser jobs found", "error");
      }
    } catch (err) {
      showToast("JobTeaser error: " + err.message, "error");
    } finally {
      setFetchingJT(false);
    }
  };

  const handleAnalyze = async (job) => {
    setAnalyzing(p => ({ ...p, [job.id]: true }));
    try {
      const result = await analyzeJob(job, getProfileContent());
      if (!job.latitude && job.location) {
        const geo = await geocodeAddress(job.location);
        if (geo) {
          job.latitude = geo.lat;
          job.longitude = geo.lng;
        }
      }
      setAnalyses(p => ({ ...p, [job.id]: result }));
      showToast(`Score: ${result.score}/100 for ${job.company}`);
    } catch {
      showToast("Analysis failed", "error");
    } finally {
      setAnalyzing(p => ({ ...p, [job.id]: false }));
    }
  };

  const handleAnalyzeAll = async () => {
    setAnalyzeAll(true);
    setStopAnalysis(false);
    for (const job of filteredJobs) {
      if (stopAnalysis) break;
      if (!analyses[job.id]) {
        await handleAnalyze(job);
        await new Promise(r => setTimeout(r, 800));
      }
    }
    setAnalyzeAll(false);
    setStopAnalysis(false);
    showToast("Analysis complete!");
  };

  const handleGenerate = async (job, analysis) => {
    setGenerating(p => ({ ...p, [job.id]: true }));
    try {
      const latex = await generateLatexFromProfile(job, analysis, getProfileContent());
      setLatexModal({ latex, job, analysis });
      showToast(`CV generated for ${job.company}!`);
    } catch {
      showToast("CV generation failed", "error");
    } finally {
      setGenerating(p => ({ ...p, [job.id]: false }));
    }
  };

  const handleSaveApplication = async () => {
    if (!latexModal) return;
    setSavingApplication(true);
    const { error } = await saveCandidature(latexModal.job, latexModal.analysis, latexModal.latex, user.id);
    setSavingApplication(false);
    if (error) {
      showToast("Supabase error: " + error.message, "error");
    } else {
      showToast("Application saved!");
      refreshApplications();
      setLatexModal(null);
    }
  };

  const handleApply = async (job) => {
    const alreadyApplied = candidatures.some(c =>
      c.titre_poste?.toLowerCase() === job.title?.toLowerCase() ||
      (c.entreprise?.toLowerCase() === job.company?.toLowerCase() &&
       c.titre_poste?.toLowerCase().includes(job.title?.toLowerCase().slice(0, 15)))
    );

    if (alreadyApplied) {
      showToast(`You already applied to ${job.company} for this role!`, "error");
      window.open(job.url, '_blank');
      return;
    }

    window.open(job.url, '_blank');
    const analysis = analyses[job.id];
    if (analysis) {
      const { error } = await saveCandidature(job, analysis, "", user.id);
      if (!error) {
        showToast(`Application to ${job.company} saved!`);
        refreshApplications();
      }
    } else {
      showToast("Tip: Analyse the job first to save your compatibility score!");
    }
  };

  const filteredJobs = [...ftOffres, ...wttjOffres, ...jtOffres, ...indeedOffres, ...apecOffres]
    .map((j, i) => ({ ...j, id: j.id + `_${i}` }))
    .filter(j => {
      if (filter === "stage" && j.contract !== "Stage" && j.contract !== "Internship") return false;
      if (filter === "cdi" && j.contract !== "CDI") return false;
      if (filter === "cdd" && !j.contract?.includes("CDD")) return false;
      if (filter === "alternance" && j.contract !== "Alternance" && j.contract !== "Apprenticeship") return false;
      if (filter === "high" && (!analyses[j.id] || analyses[j.id].score < 80)) return false;
      if (filterSource !== "all" && j.source !== filterSource) return false;
      if (filterDate === "today") {
        if (new Date(j.date).toDateString() !== new Date().toDateString()) return false;
      }
      if (filterDate === "week") {
        if (new Date(j.date) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) return false;
      }
      if (filterDate === "month") {
        if (new Date(j.date) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) return false;
      }
      if (searchText) {
        const q = searchText.toLowerCase();
        return j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)
          || j.tags.some(t => t.toLowerCase().includes(q)) || j.secteur?.toLowerCase().includes(q);
      }
      return true;
    });

  const avgScore = Object.values(analyses).length
    ? Math.round(Object.values(analyses).reduce((s, a) => s + a.score, 0) / Object.values(analyses).length)
    : null;

  const displayName = user?.user_metadata?.full_name || user?.email || "Job seeker";

  const tabs = [
    { id: "jobs", label: "Jobs", count: filteredJobs.length },
    { id: "profile", label: "Profile", count: profilItems.length },
    { id: "applications", label: "Applications", count: candidatures.length },
    { id: "map", label: "Map", count: filteredJobs.filter(j => analyses[j.id]).length },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #080c14; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #0d1117; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
        button:hover:not(:disabled) { opacity: 0.85; }
        select option { background: #0d1117; }
      `}</style>

      {/* Data loader — runs after render when user is known */}
      <DataLoader userId={user.id} setProfilItems={setProfilItems} setCandidatures={setCandidatures} />

      <Toast toast={toast} />

      {latexModal && (
        <LatexModal
          latex={latexModal.latex}
          job={latexModal.job}
          user={user}
          onClose={() => setLatexModal(null)}
          onSave={handleSaveApplication}
          saving={savingApplication}
        />
      )}

      {/* JobTeaser modal */}
      {showJTModal && (
        <div style={{ position: "fixed", inset: 0, background: "#00000099",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, backdropFilter: "blur(4px)", padding: 20 }}>
          <div style={{ background: "#0d1117", border: "1px solid #1e293b",
            borderRadius: 16, padding: 24, width: "100%", maxWidth: 400 }}>
            <h3 style={{ color: "#f1f5f9", fontSize: 15, fontFamily: "'Sora', sans-serif",
              marginBottom: 4 }}>JobTeaser Login</h3>
            <p style={{ color: "#475569", fontSize: 11, fontFamily: "'Space Mono', monospace",
              marginBottom: 16 }}>Enter your school's JobTeaser credentials</p>

            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {["ensg", "ifp"].map(s => (
                <button key={s} onClick={() => setJtSchool(s)} style={{
                  padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 11,
                  fontFamily: "'Space Mono', monospace",
                  background: jtSchool === s ? "#e85d0422" : "#1e293b",
                  color: jtSchool === s ? "#e85d04" : "#64748b",
                  border: `1px solid ${jtSchool === s ? "#e85d0444" : "#1e293b"}`
                }}>
                  {s.toUpperCase()}
                </button>
              ))}
            </div>

            <input value={jtSchool} onChange={e => setJtSchool(e.target.value)}
              placeholder="School name (e.g. ensg, ifp, mines-paris...)"
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8,
                border: "1px solid #1e293b", background: "#0a0f1a",
                color: "#f1f5f9", fontSize: 12, fontFamily: "'Space Mono', monospace",
                outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
            <input value={jtEmail} onChange={e => setJtEmail(e.target.value)}
              placeholder="JobTeaser email"
              type="email"
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8,
                border: "1px solid #1e293b", background: "#0a0f1a",
                color: "#f1f5f9", fontSize: 12, fontFamily: "'Space Mono', monospace",
                outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
            <input value={jtPassword} onChange={e => setJtPassword(e.target.value)}
              placeholder="Password"
              type="password"
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8,
                border: "1px solid #1e293b", background: "#0a0f1a",
                color: "#f1f5f9", fontSize: 12, fontFamily: "'Space Mono', monospace",
                outline: "none", boxSizing: "border-box", marginBottom: 16 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowJTModal(false)} style={{
                flex: 1, padding: "10px", borderRadius: 8,
                border: "1px solid #1e293b", background: "transparent",
                color: "#64748b", cursor: "pointer",
                fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
                Cancel
              </button>
              <button onClick={handleFetchJT} style={{
                flex: 1, padding: "10px", borderRadius: 8, border: "none",
                background: "#1a0a00", color: "#e85d04", cursor: "pointer",
                fontSize: 12, fontFamily: "'Space Mono', monospace",
                border: "1px solid #e85d0444" }}>
                Fetch jobs
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ minHeight: "100vh", background: "#080c14", fontFamily: "'Sora', sans-serif", color: "#f1f5f9" }}>
        {/* Header */}
        <div style={{ borderBottom: "1px solid #1e293b", background: "#0d1117", padding: "0 32px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 0",
            display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8,
                background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎯</div>
              <div>
                <h1 style={{ fontSize: 18, fontWeight: 800 }}>
                  Radar <span style={{ color: "#3b82f6" }}>AI</span>
                </h1>
                <p style={{ color: "#475569", fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
                  {displayName}
                </p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
              {[
                { label: "Jobs", value: filteredJobs.length, color: "#3b82f6" },
                { label: "Analysed", value: Object.keys(analyses).length, color: "#8b5cf6" },
                { label: "Applied", value: candidatures.length, color: "#10b981" },
                { label: "Avg score", value: avgScore ? `${avgScore}%` : "—", color: "#f59e0b" },
              ].map(s => (
                <div key={s.label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color,
                    fontFamily: "'Space Mono', monospace" }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: "#475569",
                    fontFamily: "'Space Mono', monospace" }}>{s.label}</div>
                </div>
              ))}
              <button
                onClick={() => supabase.auth.signOut()}
                style={{ padding: "6px 14px", borderRadius: 8,
                  border: "1px solid #1e293b", background: "transparent",
                  color: "#64748b", cursor: "pointer",
                  fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
                Sign out
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, maxWidth: 1200, margin: "0 auto" }}>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                padding: "10px 20px", border: "none", cursor: "pointer",
                background: "transparent", fontFamily: "'Space Mono', monospace",
                fontSize: 12, fontWeight: activeTab === tab.id ? 700 : 400,
                color: activeTab === tab.id ? "#f1f5f9" : "#475569",
                borderBottom: activeTab === tab.id ? "2px solid #3b82f6" : "2px solid transparent",
                transition: "all 0.2s"
              }}>
                {tab.label} {tab.count > 0 && (
                  <span style={{ background: "#1e293b", borderRadius: 10, padding: "1px 6px",
                    fontSize: 10, marginLeft: 4 }}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 32px" }}>

          {/* JOBS TAB */}
          {activeTab === "jobs" && (
            <>
              <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                <input value={searchText} onChange={e => setSearchText(e.target.value)}
                  placeholder="Search job title, company, skill, sector..."
                  style={{ flex: 1, minWidth: 200, padding: "8px 14px", borderRadius: 8,
                    border: "1px solid #1e293b", background: "#0d1117",
                    color: "#f1f5f9", fontSize: 12, fontFamily: "'Space Mono', monospace", outline: "none" }} />

                <select value={filter} onChange={e => setFilter(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #1e293b",
                    background: "#0d1117", color: "#94a3b8", fontSize: 11,
                    fontFamily: "'Space Mono', monospace", cursor: "pointer" }}>
                  <option value="all">All contracts</option>
                  <option value="stage">Internship</option>
                  <option value="cdi">CDI</option>
                  <option value="cdd">CDD</option>
                  <option value="alternance">Apprenticeship</option>
                  <option value="high">Score ≥ 80%</option>
                </select>

                <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #1e293b",
                    background: "#0d1117", color: "#94a3b8", fontSize: 11,
                    fontFamily: "'Space Mono', monospace", cursor: "pointer" }}>
                  <option value="all">All sources</option>
                  <option value="France Travail">France Travail</option>
                  <option value="Welcome to the Jungle">WTTJ</option>
                  <option value="Indeed">Indeed</option>
                  <option value="APEC">APEC</option>
                  <option value="JobTeaser ENSG">JobTeaser ENSG</option>
                  <option value="JobTeaser IFP">JobTeaser IFP</option>
                </select>

                <select value={filterDate} onChange={e => setFilterDate(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #1e293b",
                    background: "#0d1117", color: "#94a3b8", fontSize: 11,
                    fontFamily: "'Space Mono', monospace", cursor: "pointer" }}>
                  <option value="all">All dates</option>
                  <option value="today">Today</option>
                  <option value="week">This week</option>
                  <option value="month">This month</option>
                </select>

                <button onClick={handleAnalyzeAll} disabled={analyzeAll} style={{
                  padding: "8px 16px", borderRadius: 8, border: "none",
                  background: analyzeAll ? "#1e293b" : "#2d1b69",
                  color: analyzeAll ? "#475569" : "#a78bfa",
                  cursor: analyzeAll ? "wait" : "pointer",
                  fontSize: 11, fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap" }}>
                  {analyzeAll ? "⏳ Analysing..." : "⚡ Analyse all"}
                </button>

                {analyzeAll && (
                  <button onClick={() => setStopAnalysis(true)} style={{
                    padding: "8px 16px", borderRadius: 8,
                    border: "1px solid #ef444444",
                    background: "#1a0000", color: "#ef4444",
                    cursor: "pointer", fontSize: 11,
                    fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap"
                  }}>
                    ⏹ Stop
                  </button>
                )}

                <button onClick={handleFetchFT} disabled={fetchingFT} style={{
                  padding: "8px 16px", borderRadius: 8,
                  border: "1px solid #34d39944",
                  background: "#0a2a1a", color: "#34d399",
                  cursor: fetchingFT ? "wait" : "pointer",
                  fontSize: 11, fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap" }}>
                  {fetchingFT ? "⏳ Loading..." : "France Travail"}
                </button>

                <button onClick={handleFetchWTTJ} disabled={fetchingWTTJ} style={{
                  padding: "8px 16px", borderRadius: 8,
                  border: "1px solid #3ddc9744",
                  background: "#0a2a1a", color: "#3ddc97",
                  cursor: fetchingWTTJ ? "wait" : "pointer",
                  fontSize: 11, fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap" }}>
                  {fetchingWTTJ ? "⏳ Loading..." : "WTTJ"}
                </button>

                <button onClick={() => setShowJTModal(true)} disabled={fetchingJT} style={{
                  padding: "8px 16px", borderRadius: 8,
                  border: "1px solid #e85d0444",
                  background: "#1a0a00", color: "#e85d04",
                  cursor: fetchingJT ? "wait" : "pointer",
                  fontSize: 11, fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap" }}>
                  {fetchingJT ? "⏳ Connecting..." : "JobTeaser"}
                </button>

                <button onClick={handleFetchIndeed} disabled={fetchingIndeed} style={{
                  padding: "8px 16px", borderRadius: 8,
                  border: "1px solid #00339944",
                  background: "#001a33", color: "#4d94ff",
                  cursor: fetchingIndeed ? "wait" : "pointer",
                  fontSize: 11, fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap" }}>
                  {fetchingIndeed ? "⏳ Loading..." : "Indeed"}
                </button>

                <button onClick={handleFetchApec} disabled={fetchingApec} style={{
                  padding: "8px 16px", borderRadius: 8,
                  border: "1px solid #0052cc44",
                  background: "#001433", color: "#4d94ff",
                  cursor: fetchingApec ? "wait" : "pointer",
                  fontSize: 11, fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap" }}>
                  {fetchingApec ? "⏳ Loading..." : "APEC"}
                </button>
              </div>

              {profilItems.length === 0 && (
                <div style={{ background: "#1a1a0a", border: "1px solid #f59e0b44",
                  borderRadius: 10, padding: "10px 16px", marginBottom: 16,
                  color: "#f59e0b", fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
                  ⚠️ Profile empty — generated CVs will have no content. Go to "Profile" to add your CV!
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
                {filteredJobs.map(job => (
                  <JobCard key={job.id} job={job} analysis={analyses[job.id]}
                    onAnalyze={handleAnalyze} onGenerate={handleGenerate}
                    onApply={handleApply}
                    candidatures={candidatures}
                    isAnalyzing={!!analyzing[job.id]} isGenerating={!!generating[job.id]} />
                ))}
              </div>

              {filteredJobs.length === 0 && (
                <div style={{ textAlign: "center", padding: "60px 0", color: "#334155",
                  fontFamily: "'Space Mono', monospace", fontSize: 13 }}>
                  No jobs loaded. Use the buttons above to fetch from job boards.
                </div>
              )}
            </>
          )}

          {/* PROFILE TAB */}
          {activeTab === "profile" && (
            <ProfilePanel
              profilItems={profilItems}
              userId={user.id}
              onRefresh={refreshProfile}
              showToast={showToast}
            />
          )}

          {/* APPLICATIONS TAB */}
          {activeTab === "applications" && (
            <ApplicationsTracker
              candidatures={candidatures}
              onRefresh={refreshApplications}
              showToast={showToast}
            />
          )}

          {/* MAP TAB */}
          {activeTab === "map" && (
            <MapView
              jobs={filteredJobs}
              candidatures={candidatures}
              analyses={analyses}
              onApply={handleApply}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ─── DATA LOADER ──────────────────────────────────────────────────────────────
// Separate component to run data loading effects after user is confirmed
function DataLoader({ userId, setProfilItems, setCandidatures }) {
  useEffect(() => {
    loadProfil(userId).then(setProfilItems);
    loadCandidatures(userId).then(setCandidatures);
  }, [userId]);
  return null;
}
