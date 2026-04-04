import { useState, useCallback, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix icônes Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ─── SUPABASE ────────────────────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const SECTEURS = ["Énergie", "Environnement", "Médecine/Santé", "Finance", "Défense", "Urbanisme", "Agriculture", "Transport", "Recherche", "Autre"];
const STATUTS = ["à envoyer", "envoyé", "réponse reçue", "entretien", "refus", "accepté"];
const STATUT_COLORS = {
  "à envoyer": "#64748b", "envoyé": "#3b82f6", "réponse reçue": "#f59e0b",
  "entretien": "#8b5cf6", "refus": "#ef4444", "accepté": "#10b981"
};
const SOURCE_COLORS = {
  "APEC": "#0052cc", "LinkedIn": "#0077b5",
  "Welcome to the Jungle": "#3ddc97", "Indeed": "#003a9b",
  "JobTeaser ENSG": "#e85d04", "JobTeaser IFP": "#7b2d8b", "Autre": "#64748b"
};
const CONTRACT_COLORS = {
  "CDI": "#10b981", "CDD": "#f59e0b", "CDD 18 mois": "#f59e0b",
  "Stage": "#8b5cf6", "Alternance": "#ec4899"
};

const LATEX_TEMPLATE = `%-------------------------
% CV LaTeX - Loice Graciane Pokam
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
[CONTENU]
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

async function fetchApecOffres() {
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

async function fetchApecScrapedOffres() {
  const response = await fetch("http://localhost:3001/api/apec/offres");
  const data = await response.json();
  return data.offres || [];
}

async function fetchJobTeaserOffres(email, password, school) {
  const response = await fetch(
    `http://localhost:3001/api/jobteaser/offres?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&school=${school}`
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
 const prompt = `Tu es un chasseur de têtes expérimenté et honnête qui veut aider sa candidate à trouver les meilleurs postes pour elle.

PROFIL DE LA CANDIDATE:
${profileContent}

OFFRE D'EMPLOI:
Titre: ${job.title}
Entreprise: ${job.company}
Contrat: ${job.contract}
Description: ${job.description}

RÈGLES DE SCORING:
- Poste JUNIOR / DÉBUTANT (0-2 ans) → score 75-95 si compétences présentes
- Poste CONFIRMÉ (2-5 ans) → score 55-70 max
- Poste SENIOR / EXPERT (5+ ans) → score 40-55 max
- Si années d'expérience explicitement demandées et non atteintes → pénalise fortement
- Si compétences clés du poste absentes du profil → pénalise
- Si domaine correspond (data, géomatique, ML, Python) même partiellement → valorise

INSTRUCTIONS:
- Cherche les correspondances réelles entre le profil et l'offre
- Valorise les compétences transférables
- Sois honnête sur le niveau demandé vs le niveau du profil
- Conseil: comment pitcher sa candidature de façon réaliste
- Ne critique jamais l'employeur

Réponds UNIQUEMENT avec un JSON valide sans markdown:
{
  "score": 78,
  "points_forts": ["correspondance concrète entre profil et offre"],
  "points_faibles": ["écart réel à anticiper en entretien"],
  "lacunes": ["compétence manquante et indispensable"],
  "conseil": "comment présenter sa candidature pour maximiser ses chances"
}`;

  const text = await callClaude(prompt);
  try {
    const clean = text.replace(/\`\`\`json|\`\`\`/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return { score: 70, points_forts: ["Profil compatible"], points_faibles: [], lacunes: [], conseil: "Candidature recommandée" };
  }
}

async function generateLatexFromProfile(job, analysis, profileContent) {
  const prompt = `Tu es expert CV LaTeX. Génère le contenu LaTeX ADAPTÉ à cette offre.

PROFIL RÉEL (utilise UNIQUEMENT ces informations):
${profileContent}

OFFRE CIBLE:
Titre: ${job.title}
Entreprise: ${job.company}
Description: ${job.description}

RÈGLES DE CONTENU STRICTES — COMPTE CHAQUE LIGNE:
1. PROFIL: 2 phrases maximum, 2 lignes max
2. EXPÉRIENCE PROFESSIONNELLE: 3 postes max
   - Chaque poste: exactement 2 bullets maximum decrivant missions, compétences, résultats avec des metriques
   - mots cles doivent etre presents dans les bullets (ex: Python, Machine Learning, AWS, etc) si ils sont dans le profil et pertinents pour l'offre
   - montrer comment les missions réalisées correspondent aux missions demandées dans l'offre
   - ces bullets doivent être très concrets, précis, avec des chiffres et résultats quand c'est possible (ex: "Développé un modèle de ML pour prédire X avec une précision de Y% sur un dataset de Z échantillons")
3. PROJETS: exactement 2 projets, 1 bullet chacun, 10 mots max par bullet
4. FORMATION: 3 lignes, une ligne par diplôme format compact
5. COMPÉTENCES: 4 catégories, format inline, pas de saut de ligne entre catégories
6. LinkedIn cliquable: \\href{https://www.linkedin.com/in/loice-pokam}{LinkedIn}
7. Commence par \\begin{center}, PAS \\documentclass
8. Tout en français sauf termes techniques
9. N'invente AUCUNE compétence absente du profil
10. TERMINE correctement tous les environnements LaTeX
11. SI une information du profil correspond TRES BIEN à une exigence de l'offre, mentionne la dans les points forts et adapte le CV pour la mettre en avant
12. SI une compétence clé pour l'offre est absente du profil, mentionne la dans les lacunes et adapte le CV pour minimiser cette lacune
13. les marges doivent être respectées, le CV doit tenir sur une page, pas de section vide, pas de saut de page inutile, pas de contenu coupé ou qui dépasse les marges, pas de contenu redondant ou inutile pour l'offre ciblée

STRUCTURE EXACTE:
\\begin{center}
NOM \\\\ contact | \\href{...}{LinkedIn} | ville \\\\ titre adapté
\\end{center}
\\section*{PROFIL}
2 phrases max.
\\section*{EXPÉRIENCE PROFESSIONNELLE}
3 postes, 2 bullets chacun.
\\section*{PROJETS}
2 projets, 1 bullet chacun.
\\section*{FORMATION}
3 lignes compactes.
\\section*{COMPÉTENCES}
4 lignes inline.`;

  const result = await callClaude(prompt);
  return result.replace(/```latex|```/g, "").trim();
}

async function compileLatexToPdf(latex) {
  const response = await fetch("http://localhost:3001/api/latex/compile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ latex })
  });
  if (!response.ok) throw new Error("Erreur compilation PDF");
  const blob = await response.blob();
  return blob;
}

// ─── SUPABASE OPS ─────────────────────────────────────────────────────────────
async function saveCandidature(job, analysis, latex) {
  const geo = await geocodeAddress(job.location);
  const { data, error } = await supabase.from("candidatures").insert({
    date_candidature: new Date().toISOString().split("T")[0],
    titre_poste: job.title,
    entreprise: job.company,
    source: job.source,
    secteur: job.secteur || "Autre",
    contrat: job.contract,
    localisation: job.location,
    adresse_complete: geo?.display || job.location,
    latitude: geo?.lat || null,
    longitude: geo?.lng || null,
    statut: "à envoyer",
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

async function loadCandidatures() {
  const { data } = await supabase.from("candidatures").select("*").order("created_at", { ascending: false });
  return data || [];
}

async function updateStatut(id, statut) {
  await supabase.from("candidatures").update({ statut }).eq("id", id);
}

async function updateNotes(id, notes) {
  await supabase.from("candidatures").update({ notes }).eq("id", id);
}

async function loadProfil() {
  const { data } = await supabase.from("profil").select("*").eq("actif", true).order("created_at", { ascending: false });
  return data || [];
}

async function saveProfil(type, titre, contenu) {
  const { data } = await supabase.from("profil").insert({ type, titre, contenu, actif: true }).select();
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

// ─── PROFIL PANEL ─────────────────────────────────────────────────────────────
function ProfilPanel({ profilItems, onRefresh, showToast }) {
  const [tab, setTab] = useState("list");
  const [titre, setTitre] = useState("");
  const [contenu, setContenu] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const handleSaveManuel = async () => {
    if (!titre.trim()) return showToast("Titre requis", "error");
    if (!contenu.trim()) return showToast("Contenu requis", "error");
    setSaving(true);
    await saveProfil("experience_manuelle", titre.trim(), contenu.trim());
    setSaving(false);
    setTitre("");
    setContenu("");
    onRefresh();
    showToast("✅ Expérience ajoutée !");
    setTab("list");
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);

    try {
      // PDF
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
        await saveProfil("cv_upload", file.name, fullText.trim());
        showToast(`✅ PDF "${file.name}" extrait et sauvegardé !`);
      }
      // TXT, TEX, MD
      else {
        const text = await file.text();
        await saveProfil("cv_upload", file.name, text.trim());
        showToast(`✅ Fichier "${file.name}" sauvegardé !`);
      }

      onRefresh();
      setTab("list");
    } catch (err) {
      showToast("Erreur lecture fichier: " + err.message, "error");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (id) => {
    await supabase.from("profil").update({ actif: false }).eq("id", id);
    onRefresh();
    showToast("Élément supprimé");
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[
          { id: "list", label: "📋 Mon profil", count: profilItems.length },
          { id: "upload", label: "📎 Upload fichier" },
          { id: "manuel", label: "✏️ Saisie manuelle" },
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
                Ton profil est vide — ajoute ton CV ou des expériences !
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button onClick={() => setTab("upload")} style={{
                  padding: "8px 16px", borderRadius: 8, border: "none",
                  background: "#1e3a5f", color: "#93c5fd", cursor: "pointer",
                  fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
                  📎 Uploader un CV
                </button>
                <button onClick={() => setTab("manuel")} style={{
                  padding: "8px 16px", borderRadius: 8, border: "none",
                  background: "#1a3a2a", color: "#6ee7b7", cursor: "pointer",
                  fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
                  ✏️ Saisie manuelle
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
                        {item.type === "cv_upload" ? "📎 Fichier" : "✏️ Manuel"}
                      </span>
                      <span style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 600,
                        fontFamily: "'Sora', sans-serif" }}>{item.titre}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                        style={{ padding: "3px 8px", borderRadius: 6,
                          border: "1px solid #1e293b", background: "transparent",
                          color: "#64748b", cursor: "pointer", fontSize: 11 }}>
                        {expandedId === item.id ? "▲ Réduire" : "▼ Voir"}
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
            📎 Uploader un fichier CV
          </h3>
          <p style={{ color: "#64748b", fontSize: 12,
            fontFamily: "'Space Mono', monospace", marginBottom: 20 }}>
            Formats acceptés : <strong style={{ color: "#93c5fd" }}>PDF, TXT, TEX, MD</strong>
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
                  Lecture en cours...
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 40, marginBottom: 10 }}>📂</div>
                <div style={{ color: "#f1f5f9", fontSize: 13,
                  fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>
                  Clique pour choisir un fichier
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
            💡 <strong style={{ color: "#f59e0b" }}>Conseil :</strong> Plus ton profil est riche,
            plus les CVs générés seront précis et fidèles à tes vraies compétences.
            Ajoute tous tes CVs !
          </div>
        </div>
      )}

      {/* MANUEL TAB */}
      {tab === "manuel" && (
        <div style={{ background: "#0d1117", border: "1px solid #1e293b",
          borderRadius: 12, padding: 24 }}>
          <h3 style={{ color: "#f1f5f9", fontSize: 14, fontWeight: 700,
            fontFamily: "'Sora', sans-serif", marginBottom: 16 }}>
            ✏️ Saisie manuelle d'expérience
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ color: "#64748b", fontSize: 11,
                fontFamily: "'Space Mono', monospace", display: "block", marginBottom: 4 }}>
                Titre *
              </label>
              <input value={titre} onChange={e => setTitre(e.target.value)}
                placeholder="Ex: Stage TotalEnergies 2025, Compétences Python, Formation ENSG..."
                style={{ width: "100%", padding: "10px 14px", borderRadius: 8,
                  border: "1px solid #1e293b", background: "#0a0f1a",
                  color: "#f1f5f9", fontSize: 12,
                  fontFamily: "'Space Mono', monospace", outline: "none",
                  boxSizing: "border-box" }} />
            </div>

            <div>
              <label style={{ color: "#64748b", fontSize: 11,
                fontFamily: "'Space Mono', monospace", display: "block", marginBottom: 4 }}>
                Contenu *
              </label>
              <textarea value={contenu} onChange={e => setContenu(e.target.value)}
                placeholder={`Décris en détail :
- Tes missions et responsabilités
- Les technologies utilisées
- Tes résultats et réalisations
- Tes compétences clés

Exemple:
Stage Data Scientist - Institut Curie (2024-2025)
• Développement de pipelines ETL Python/SQL pour 44000 données cliniques
• Modèle ML prédictif avec 82% rappel et AUC 0.85
• Géocodage et analyse spatiale avec GeoPandas`}
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
                🗑 Effacer
              </button>
              <button onClick={handleSaveManuel} disabled={saving}
                style={{ padding: "9px 24px", borderRadius: 8, border: "none",
                  cursor: saving ? "wait" : "pointer",
                  background: saving ? "#1e293b" : "#1a3a2a",
                  color: saving ? "#475569" : "#6ee7b7",
                  fontSize: 12, fontFamily: "'Space Mono', monospace",
                  fontWeight: 700 }}>
                {saving ? "⏳ Sauvegarde..." : "✅ Sauvegarder"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CANDIDATURES TRACKER ─────────────────────────────────────────────────────
function CandidaturesTracker({ candidatures, onRefresh, showToast }) {
  const [editNotes, setEditNotes] = useState({});
  const [expandedId, setExpandedId] = useState(null);

  const handleStatut = async (id, statut) => {
    await updateStatut(id, statut);
    onRefresh();
    showToast("Statut mis à jour !");
  };

  const handleNotes = async (id) => {
    await updateNotes(id, editNotes[id] || "");
    onRefresh();
    showToast("Notes sauvegardées !");
  };

  if (candidatures.length === 0) {
    return (
      <div style={{ background: "#0d1117", border: "1px solid #1e293b", borderRadius: 12, padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
        <div style={{ color: "#475569", fontSize: 13, fontFamily: "'Space Mono', monospace" }}>
          Aucune candidature. Génère un CV et sauvegarde une candidature !
        </div>
      </div>
    );
  }

  // Stats
  const statsByStatut = STATUTS.reduce((acc, s) => {
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
        {Object.entries(statsByStatut).filter(([,v]) => v > 0).map(([statut, count]) => (
          <div key={statut} style={{ background: (STATUT_COLORS[statut]||"#64748b")+"22",
            border: `1px solid ${(STATUT_COLORS[statut]||"#64748b")}44`,
            borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: STATUT_COLORS[statut]||"#64748b", fontSize: 18, fontWeight: 800,
              fontFamily: "'Space Mono', monospace" }}>{count}</span>
            <span style={{ color: "#64748b", fontSize: 11, fontFamily: "'Space Mono', monospace" }}>{statut}</span>
          </div>
        ))}
        {avgScore && (
          <div style={{ background: "#10b98122", border: "1px solid #10b98144",
            borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#10b981", fontSize: 18, fontWeight: 800, fontFamily: "'Space Mono', monospace" }}>{avgScore}%</span>
            <span style={{ color: "#64748b", fontSize: 11, fontFamily: "'Space Mono', monospace" }}>score moyen</span>
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
                <select value={c.statut} onChange={e => handleStatut(c.id, e.target.value)}
                  style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${(STATUT_COLORS[c.statut]||"#64748b")}44`,
                    background: (STATUT_COLORS[c.statut]||"#64748b")+"22",
                    color: STATUT_COLORS[c.statut]||"#64748b",
                    fontSize: 11, fontFamily: "'Space Mono', monospace", cursor: "pointer" }}>
                  {STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
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
                      marginBottom: 4, fontWeight: 700 }}>⚠️ Lacunes identifiées:</div>
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
                    placeholder="Notes personnelles..."
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
function LatexModal({ latex, job, onClose, onSave, saving }) {
  const [copied, setCopied] = useState(false);
  const [compilingPdf, setCompilingPdf] = useState(false);
  const fullLatex = LATEX_TEMPLATE.replace("[CONTENU]", latex);

  const downloadPdf = async () => {
    setCompilingPdf(true);
    try {
      const blob = await compileLatexToPdf(fullLatex);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `CV_Pokam_${job.company.replace(/\s+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Erreur PDF: " + err.message);
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
    a.download = `CV_Pokam_${job.company.replace(/\s+/g, "_")}.tex`;
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
              {copied ? "✓ Copié!" : "📋 Copier"}
            </button>

            <button onClick={download} style={{ padding: "7px 14px", borderRadius: 8,
                border: "none", background: "#1e3a5f", color: "#93c5fd",
                cursor: "pointer", fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
                ⬇ .tex
              </button>
              <button onClick={downloadPdf} disabled={compilingPdf} style={{ 
                padding: "7px 14px", borderRadius: 8,
                border: "none", background: compilingPdf ? "#1e293b" : "#1a0a2a",
                color: compilingPdf ? "#475569" : "#c084fc",
                cursor: compilingPdf ? "wait" : "pointer",
                fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
                {compilingPdf ? "⏳ Compilation..." : "📄 PDF"}
              </button>
              
            <button onClick={onSave} disabled={saving} style={{ padding: "7px 14px", borderRadius: 8,
              border: "none", background: saving ? "#1e293b" : "#1a3a2a",
              color: saving ? "#475569" : "#6ee7b7",
              cursor: saving ? "wait" : "pointer",
              fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
              {saving ? "⏳..." : "💾 Sauvegarder"}
            </button>
            <button onClick={onClose} style={{ padding: "7px 12px", borderRadius: 8,
              border: "1px solid #1e293b", background: "transparent",
              color: "#ef4444", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>
        </div>
        <div style={{ padding: "8px 20px", background: "#1a3a2a44",
          borderBottom: "1px solid #1e293b", color: "#6ee7b7",
          fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
          💡 Compile sur overleaf.com (gratuit) · Upload le fichier .tex
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
function JobCard({ job, analysis, onAnalyze, onGenerate, onPostuler, candidatures, isAnalyzing, isGenerating }) {
  const dejaPostule = candidatures?.some(c => 
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
          {dejaPostule && (
            <span style={{ background: "#ef444422", color: "#ef4444",
              border: "1px solid #ef444444", borderRadius: 4,
              padding: "2px 8px", fontSize: 10,
              fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap" }}>
              ✓ Déjà postulé
            </span>
          )}
        </div>
          <div style={{ color: "#64748b", fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
            {job.company} · {job.location} · {job.date ? new Date(job.date).toLocaleDateString('fr-FR') : ""}
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
          {isAnalyzing ? "⏳ Analyse..." : analysis ? "🔄 Ré-analyser" : "🔍 Analyser"}
        </button>

        <button onClick={() => onGenerate(job, analysis)} disabled={isGenerating || !analysis} style={{
          flex: 1, padding: "7px 0", borderRadius: 6, border: "none",
          cursor: (isGenerating || !analysis) ? "not-allowed" : "pointer",
          background: (isGenerating || !analysis) ? "#1e293b" : "#1a3a2a",
          color: (isGenerating || !analysis) ? "#475569" : "#6ee7b7",
          fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
          {isGenerating ? "⏳ Génère..." : "📄 CV LaTeX"}
        </button>

        
        <button onClick={() => onPostuler(job)} disabled={!job.url} style={{
          flex: 1, padding: "7px 0", borderRadius: 6, border: "none",
          cursor: !job.url ? "not-allowed" : "pointer",
          background: !job.url ? "#1e293b" : "#1a2a1a",
          color: !job.url ? "#475569" : "#34d399",
          fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
          🚀 Postuler
        </button>

      </div>
    </div>
  );
}

// ─── CARTE ────────────────────────────────────────────────────────────────────
function CarteOffres({ jobs, candidatures, analyses, onPostuler }) {
  const [geoJobs, setGeoJobs] = useState([]);

  useEffect(() => {
    const geocodeAll = async () => {
      const results = [];

      // 1. Candidatures déjà en BD avec coords
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

      // 2. Offres scrapées sans coords
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

  const jobsWithCoords = geoJobs;

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
      {/* Stats bar */}
      <div style={{ background: "#0d1117", padding: "10px 16px",
        display: "flex", gap: 16, alignItems: "center",
        borderBottom: "1px solid #1e293b" }}>
        <span style={{ color: "#64748b", fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
          📍 {jobsWithCoords.length} offres géolocalisées sur {jobs.length + (candidatures?.length || 0)}
        </span>
        <div style={{ display: "flex", gap: 10 }}>
          {[["#10b981", "Score ≥ 80"], ["#f59e0b", "Score 60-79"], ["#ef4444", "Score < 60"], ["#64748b", "Non analysé"]].map(([color, label]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
              <span style={{ color: "#64748b", fontSize: 10, fontFamily: "'Space Mono', monospace" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {jobsWithCoords.length === 0 ? (
        <div style={{ background: "#0d1117", padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🗺️</div>
          <div style={{ color: "#475569", fontSize: 13, fontFamily: "'Space Mono', monospace" }}>
            Charge des offres puis clique sur "Analyser tout" pour géolocaliser !
          </div>
        </div>
      ) : (
        <MapContainer
          center={[46.8, 2.3]}
          zoom={6}
          style={{ height: "600px", width: "100%" }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='© OpenStreetMap © CARTO'
          />
          {jobsWithCoords.map(job => {
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
                    <button
                      onClick={() => onPostuler(job)}
                      style={{
                        width: "100%", padding: "6px", borderRadius: 6,
                        border: "none", background: "#10b981",
                        color: "white", cursor: "pointer",
                        fontSize: 12, fontWeight: 700
                      }}>
                      🚀 Postuler
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
  const [activeTab, setActiveTab] = useState("offres");
  const [jobs] = useState([]);
  const [analyses, setAnalyses] = useState({});
  const [analyzing, setAnalyzing] = useState({});
  const [generating, setGenerating] = useState({});
  const [latexModal, setLatexModal] = useState(null);
  const [savingCandidature, setSavingCandidature] = useState(false);
  const [toast, setToast] = useState(null);
  const [profilItems, setProfilItems] = useState([]);
  const [candidatures, setCandidatures] = useState([]);
  const [filter, setFilter] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [filterDate, setFilterDate] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [analyzeAll, setAnalyzeAll] = useState(false);
  const [stopAnalysis, setStopAnalysis] = useState(false);

  const [fetchingApec, setFetchingApec] = useState(false);
  const [apecOffres, setApecOffres] = useState([]);

  const [fetchingWTTJ, setFetchingWTTJ] = useState(false);
  const [wttjOffres, setWttjOffres] = useState([]);

  const [fetchingIndeed, setFetchingIndeed] = useState(false);
  const [indeedOffres, setIndeedOffres] = useState([]);

  const [fetchingApecS, setFetchingApecS] = useState(false);
  const [apecSOffres, setApecSOffres] = useState([]);

  const handleFetchApecS = async () => {
    setFetchingApecS(true);
    showToast("🔍 Récupération des offres APEC...");
    try {
      const offres = await fetchApecScrapedOffres();
      if (offres.length > 0) {
        setApecSOffres(offres);
        showToast(`✅ ${offres.length} offres APEC chargées !`);
      } else {
        showToast("Aucune offre APEC trouvée", "error");
      }
    } catch (err) {
      showToast("Erreur APEC: " + err.message, "error");
    } finally {
      setFetchingApecS(false);
    }
};

  const handleFetchIndeed = async () => {
    setFetchingIndeed(true);
    showToast("🔍 Récupération des offres Indeed...");
    try {
      const offres = await fetchIndeedOffres();
      if (offres.length > 0) {
        setIndeedOffres(offres);
        showToast(`✅ ${offres.length} offres Indeed chargées !`);
      } else {
        showToast("Aucune offre Indeed trouvée", "error");
      }
    } catch (err) {
      showToast("Erreur Indeed: " + err.message, "error");
    } finally {
      setFetchingIndeed(false);
    }
  };

  const [fetchingJT, setFetchingJT] = useState(false);
const [jtOffres, setJtOffres] = useState([]);
const [showJTModal, setShowJTModal] = useState(false);
const [jtEmail, setJtEmail] = useState("");
const [jtPassword, setJtPassword] = useState("");
const [jtSchool, setJtSchool] = useState("ensg");

const handleFetchJT = async () => {
  if (!jtEmail || !jtPassword) return showToast("Email et mot de passe requis", "error");
  setFetchingJT(true);
  setShowJTModal(false);
  showToast(`🔍 Connexion JobTeaser ${jtSchool.toUpperCase()}...`);
  try {
    const offres = await fetchJobTeaserOffres(jtEmail, jtPassword, jtSchool);
    if (offres.length > 0) {
      setJtOffres(prev => [...prev.filter(o => o.source !== (jtSchool === 'ensg' ? 'JobTeaser ENSG' : 'JobTeaser IFP')), ...offres]);
      showToast(`✅ ${offres.length} offres JobTeaser ${jtSchool.toUpperCase()} !`);
    } else {
      showToast("Aucune offre JobTeaser trouvée", "error");
    }
  } catch (err) {
    showToast("Erreur JobTeaser: " + err.message, "error");
  } finally {
    setFetchingJT(false);
  }
};

  const handleFetchWTTJ = async () => {
    setFetchingWTTJ(true);
    showToast("🔍 Récupération des offres WTTJ...");
    try {
      const offres = await fetchWTTJOffres();
      if (offres.length > 0) {
        setWttjOffres(offres);
        showToast(`✅ ${offres.length} offres WTTJ chargées !`);
      } else {
        showToast("Aucune offre WTTJ trouvée", "error");
      }
    } catch (err) {
      showToast("Erreur WTTJ: " + err.message, "error");
    } finally {
      setFetchingWTTJ(false);
    }
  };

  const handleFetchApec = async () => {
    setFetchingApec(true);
    showToast("🔍 Récupération des offres France Travail...");
    try {
      const offres = await fetchApecOffres();
      if (offres.length > 0) {
        setApecOffres(offres);
        showToast(`✅ ${offres.length} offres France Travail chargées !`);
      } else {
        showToast("Aucune offre trouvée", "error");
      }
    } catch (err) {
      showToast("Erreur France Travail: " + err.message, "error");
    } finally {
      setFetchingApec(false);
    }
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const getProfileContent = () => {
      console.log('>>> Profil items:', profilItems.length);
      if (profilItems.length === 0) return `Loice Graciane Pokam — Ingénieur Géomatique & Data Scientist
  Compétences: Python, ML, Deep Learning, GIS, Télédétection, PostGIS, CDMP
  Expériences: TotalEnergies (IA Géospatiale), Institut Curie (Data Science), IGN (Géomatique)
  Formation: ENSG & IFP School Ingénieur Géomatique, Master Géomatique Tunis`;
      const content = profilItems.map(p => `[${p.titre}]\n${p.contenu}`).join("\n\n");
      console.log('>>> Profil content length:', content.length);
      return content;
    };

  

  const refreshProfil = async () => {
    const data = await loadProfil();
    setProfilItems(data);
  };

  const refreshCandidatures = async () => {
    const data = await loadCandidatures();
    setCandidatures(data);
  };

  useEffect(() => {
    refreshProfil();
    refreshCandidatures();
  }, []);

  const handleAnalyze = useCallback(async (job) => {
    setAnalyzing(p => ({ ...p, [job.id]: true }));
    try {
      const result = await analyzeJob(job, getProfileContent());
      // Géocoder si pas encore fait
      if (!job.latitude && job.location) {
        const geo = await geocodeAddress(job.location);
        if (geo) {
          job.latitude = geo.lat;
          job.longitude = geo.lng;
        }
      }
      setAnalyses(p => ({ ...p, [job.id]: result }));
      showToast(`Score: ${result.score}/100 pour ${job.company}`);
    } catch {
      showToast("Erreur lors de l'analyse", "error");
    } finally {
      setAnalyzing(p => ({ ...p, [job.id]: false }));
    }
  }, [profilItems]);

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
    showToast("Analyse terminée !");
  };

  const handleGenerate = useCallback(async (job, analysis) => {
    setGenerating(p => ({ ...p, [job.id]: true }));
    try {
      const latex = await generateLatexFromProfile(job, analysis, getProfileContent());
      setLatexModal({ latex, job, analysis });
      showToast(`CV généré pour ${job.company} !`);
    } catch {
      showToast("Erreur génération CV", "error");
    } finally {
      setGenerating(p => ({ ...p, [job.id]: false }));
    }
  }, [profilItems]);

  const handleSaveCandidature = async () => {
    if (!latexModal) return;
    setSavingCandidature(true);
    const { error } = await saveCandidature(latexModal.job, latexModal.analysis, latexModal.latex);
    setSavingCandidature(false);
    if (error) {
      showToast("Erreur Supabase: " + error.message, "error");
    } else {
      showToast("Candidature sauvegardée dans Supabase !");
      refreshCandidatures();
      setLatexModal(null);
    }
  };

  const handlePostuler = async (job) => {
  // Vérifier si déjà postulé
  const dejaPostule = candidatures.some(c =>
    c.titre_poste?.toLowerCase() === job.title?.toLowerCase() ||
    (c.entreprise?.toLowerCase() === job.company?.toLowerCase() &&
     c.titre_poste?.toLowerCase().includes(job.title?.toLowerCase().slice(0, 15)))
  );

  if (dejaPostule) {
    showToast(`⚠️ Tu as déjà postulé chez ${job.company} pour ce poste !`, "error");
    window.open(job.url, '_blank');
    return;
  }

  window.open(job.url, '_blank');
  const analysis = analyses[job.id];
  if (analysis) {
    const { error } = await saveCandidature(job, analysis, "");
    if (!error) {
      showToast(`✅ Candidature ${job.company} enregistrée !`);
      refreshCandidatures();
    }
  } else {
    showToast("💡 Analyse d'abord l'offre pour sauvegarder le score !");
  }
};

  const filteredJobs = [...jobs, ...apecOffres, ...wttjOffres, ...jtOffres, ...indeedOffres, ...apecSOffres]
  .map((j, i) => ({ ...j, id: j.id + `_${i}` }))
  .filter(j => {
    if (filter === "stage" && j.contract !== "Stage") return false;
    if (filter === "cdi" && j.contract !== "CDI") return false;
    if (filter === "cdd" && !j.contract?.includes("CDD")) return false;
    if (filter === "alternance" && j.contract !== "Alternance") return false;
    if (filter === "high" && (!analyses[j.id] || analyses[j.id].score < 80)) return false;
    if (filterSource !== "all" && j.source !== filterSource) return false;
    if (filterDate === "today") {
      const today = new Date().toDateString();
      if (new Date(j.date).toDateString() !== today) return false;
    }
    if (filterDate === "week") {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      if (new Date(j.date) < weekAgo) return false;
    }
    if (filterDate === "month") {
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      if (new Date(j.date) < monthAgo) return false;
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

  const tabs = [
    { id: "offres", label: "🎯 Offres", count: filteredJobs.length },
    { id: "profil", label: "👤 Profil", count: profilItems.length },
    { id: "candidatures", label: "📊 Candidatures", count: candidatures.length },
    { id: "carte", label: "🗺️ Carte", count: filteredJobs.filter(j => analyses[j.id]).length },
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

      <Toast toast={toast} />
      {latexModal && <LatexModal latex={latexModal.latex} job={latexModal.job}
        onClose={() => setLatexModal(null)}
        onSave={handleSaveCandidature} saving={savingCandidature} />}

      {showJTModal && (
        <div style={{ position: "fixed", inset: 0, background: "#00000099",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, backdropFilter: "blur(4px)", padding: 20 }}>
          <div style={{ background: "#0d1117", border: "1px solid #1e293b",
            borderRadius: 16, padding: 24, width: "100%", maxWidth: 400 }}>
            <h3 style={{ color: "#f1f5f9", fontSize: 15, fontFamily: "'Sora', sans-serif",
              marginBottom: 16 }}>🎓 Connexion JobTeaser</h3>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {["ensg", "ifp"].map(s => (
                <button key={s} onClick={() => setJtSchool(s)} style={{
                  flex: 1, padding: "8px", borderRadius: 8, border: "none",
                  background: jtSchool === s ? "#e85d0422" : "#1e293b",
                  color: jtSchool === s ? "#e85d04" : "#64748b",
                  cursor: "pointer", fontSize: 12,
                  fontFamily: "'Space Mono', monospace",
                  border: `1px solid ${jtSchool === s ? "#e85d0444" : "#1e293b"}`
                }}>
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
            <input value={jtEmail} onChange={e => setJtEmail(e.target.value)}
              placeholder="Email JobTeaser"
              type="email"
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8,
                border: "1px solid #1e293b", background: "#0a0f1a",
                color: "#f1f5f9", fontSize: 12, fontFamily: "'Space Mono', monospace",
                outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
            <input value={jtPassword} onChange={e => setJtPassword(e.target.value)}
              placeholder="Mot de passe"
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
                Annuler
              </button>
              <button onClick={handleFetchJT} style={{
                flex: 1, padding: "10px", borderRadius: 8, border: "none",
                background: "#1a0a00", color: "#e85d04", cursor: "pointer",
                fontSize: 12, fontFamily: "'Space Mono', monospace",
                border: "1px solid #e85d0444" }}>
                🔍 Scraper
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
                  JobHunter <span style={{ color: "#3b82f6" }}>AI</span>
                </h1>
                <p style={{ color: "#475569", fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
                  Loice Graciane Pokam · Ingénieur Géomatique & Data Scientist
                </p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              {[
                { label: "Offres", value: filteredJobs.length, color: "#3b82f6" },
                { label: "Analysées", value: Object.keys(analyses).length, color: "#8b5cf6" },
                { label: "Candidatures", value: candidatures.length, color: "#10b981" },
                { label: "Score moy.", value: avgScore ? `${avgScore}%` : "—", color: "#f59e0b" },
              ].map(s => (
                <div key={s.label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color,
                    fontFamily: "'Space Mono', monospace" }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: "#475569",
                    fontFamily: "'Space Mono', monospace" }}>{s.label}</div>
                </div>
              ))}
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
                {tab.label} {tab.count > 0 && <span style={{
                  background: "#1e293b", borderRadius: 10, padding: "1px 6px",
                  fontSize: 10, marginLeft: 4
                }}>{tab.count}</span>}
              </button>
            ))}
          </div>
        </div>

        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 32px" }}>
          {/* OFFRES TAB */}
          {activeTab === "offres" && (
            <>
              <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                <input value={searchText} onChange={e => setSearchText(e.target.value)}
                  placeholder="🔍 Poste, entreprise, compétence, secteur..."
                  style={{ flex: 1, minWidth: 200, padding: "8px 14px", borderRadius: 8,
                    border: "1px solid #1e293b", background: "#0d1117",
                    color: "#f1f5f9", fontSize: 12, fontFamily: "'Space Mono', monospace", outline: "none" }} />
                <select value={filter} onChange={e => setFilter(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #1e293b",
                  background: "#0d1117", color: "#94a3b8", fontSize: 11,
                  fontFamily: "'Space Mono', monospace", cursor: "pointer" }}>
                <option value="all">Tous contrats</option>
                <option value="stage">Stage</option>
                <option value="cdi">CDI</option>
                <option value="cdd">CDD</option>
                <option value="alternance">Alternance</option>
                <option value="high">Score ≥ 80%</option>
              </select>

              <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #1e293b",
                  background: "#0d1117", color: "#94a3b8", fontSize: 11,
                  fontFamily: "'Space Mono', monospace", cursor: "pointer" }}>
                <option value="all">Toutes sources</option>
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
                <option value="all">Toutes dates</option>
                <option value="today">Aujourd'hui</option>
                <option value="week">Cette semaine</option>
                <option value="month">Ce mois</option>
              </select>
                <button onClick={handleAnalyzeAll} disabled={analyzeAll} style={{
                  padding: "8px 16px", borderRadius: 8, border: "none",
                  background: analyzeAll ? "#1e293b" : "#2d1b69",
                  color: analyzeAll ? "#475569" : "#a78bfa",
                  cursor: analyzeAll ? "wait" : "pointer",
                  fontSize: 11, fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap" }}>
                  {analyzeAll ? "⏳ Analyse..." : "⚡ Analyser tout"}
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

                
                <button onClick={handleFetchApec} style={{
                  padding: "8px 16px", borderRadius: 8, border: "none",
                  background: "#0a2a1a", color: "#34d399",
                  cursor: "pointer", fontSize: 11,
                  fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap",
                  border: "1px solid #34d39944"
                }}>
                  🌐 Offres France Travail
                </button>

                <button onClick={handleFetchWTTJ} disabled={fetchingWTTJ} style={{
                  padding: "8px 16px", borderRadius: 8,
                  border: "1px solid #3ddc9744",
                  background: "#0a2a1a", color: "#3ddc97",
                  cursor: fetchingWTTJ ? "wait" : "pointer",
                  fontSize: 11, fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap"
                }}>
                  {fetchingWTTJ ? "⏳ Chargement..." : "🌴 WTTJ"}
                </button>

                <button onClick={() => setShowJTModal(true)} disabled={fetchingJT} style={{
                  padding: "8px 16px", borderRadius: 8,
                  border: "1px solid #e85d0444",
                  background: "#1a0a00", color: "#e85d04",
                  cursor: fetchingJT ? "wait" : "pointer",
                  fontSize: 11, fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap"
                }}>
                  {fetchingJT ? "⏳ Connexion..." : "🎓 JobTeaser"}
                </button>

                <button onClick={handleFetchIndeed} disabled={fetchingIndeed} style={{
                  padding: "8px 16px", borderRadius: 8,
                  border: "1px solid #00339944",
                  background: "#001a33", color: "#003399",
                  cursor: fetchingIndeed ? "wait" : "pointer",
                  fontSize: 11, fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap",
                  color: "#4d94ff"
                }}>
                  {fetchingIndeed ? "⏳ Chargement..." : "🔎 Indeed"}
              </button>

              <button onClick={handleFetchApecS} disabled={fetchingApecS} style={{
              padding: "8px 16px", borderRadius: 8,
              border: "1px solid #0052cc44",
              background: "#001433", color: "#4d94ff",
              cursor: fetchingApecS ? "wait" : "pointer",
              fontSize: 11, fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap"
            }}>
              {fetchingApecS ? "⏳ Chargement..." : "🎯 APEC"}
            </button>
              </div>

              {profilItems.length === 0 && (
                <div style={{ background: "#1a1a0a", border: "1px solid #f59e0b44",
                  borderRadius: 10, padding: "10px 16px", marginBottom: 16,
                  color: "#f59e0b", fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
                  ⚠️ Profil vide — les CVs générés utiliseront un profil par défaut. Va dans "Profil" pour ajouter ton vrai CV !
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
                {filteredJobs.map(job => (
                  <JobCard key={job.id} job={job} analysis={analyses[job.id]}
                    onAnalyze={handleAnalyze} onGenerate={handleGenerate}
                    onPostuler={handlePostuler}
                    candidatures={candidatures}
                    isAnalyzing={!!analyzing[job.id]} isGenerating={!!generating[job.id]} />
                ))}
              </div>
            </>
          )}

          {/* PROFIL TAB */}
          {activeTab === "profil" && (
            <ProfilPanel profilItems={profilItems} onRefresh={refreshProfil} showToast={showToast} />
          )}

          {activeTab === "carte" && (
            <CarteOffres
              jobs={filteredJobs}
              candidatures={candidatures}
              analyses={analyses}
              onPostuler={handlePostuler}
            />
          )}
          {/* CANDIDATURES TAB */}
          {activeTab === "candidatures" && (
            <CandidaturesTracker candidatures={candidatures}
              onRefresh={refreshCandidatures} showToast={showToast} />
          )}
        </div>
      </div>
    </>
  );
}
