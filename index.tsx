import React, { useState, useRef, FC, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// --- Configuration ---
const MODEL_NAME = 'gemini-3-pro-preview'; // Reverted to single high-reasoning model
declare var html2pdf: any;

const COUNTRIES = [
  "Vietnam", "United States", "United Kingdom", "Singapore", 
  "Japan", "South Korea", "Australia", "Germany", 
  "France", "India", "Brazil", "Canada", "Thailand", "Indonesia"
];

// --- Types ---

interface BrandProfile {
  name: string;
  category: string;
  tone: string[];
  targetAudience: string;
  brandColors: string[];
  competitors: string[]; 
  uniqueSellingPropositions: string[]; 
}

interface Persona {
  id: string;
  name: string;
  age: number;
  occupation: string;
  bio: string;
  painPoints: string[]; // Used for Emotional Drivers/Frustrations
}

interface Judgment {
  personaId: string;
  score: number; // 0-100
  quote: string;
  pros: string[];
  cons: string[];
  verdict: string;
  emotionalTags?: string[];
  emotionalIntensity?: number;
  shareLikelihood?: number;
  trustPerception?: string;
  timecodedReactions?: {time: string; reaction: string}[];
}

interface Asset {
  id: string;
  file: File;
  previewUrl: string;
  mimeType: string;
}

interface AppState {
  status: 'idle' | 'researching' | 'creating_personas' | 'judging' | 'synthesizing' | 'complete';
  progress: number; // 0 to 100
  logs: string[];
  isLogExpanded: boolean;
  brandProfile: BrandProfile | null;
  personas: Persona[];
  judgments: Judgment[];
  finalReport: string;
  url: string;
  country: string;
  numPersonas: number;
  assets: Asset[];
  isDownloading: boolean;
  apiKey: string;
  isSettingsOpen: boolean;
}

// --- Prompt Engine ---

const PromptEngine = {
  research: (url: string) => `
    You are a Senior Brand Strategist conducting a deep audit.
    
    Target URL: ${url}
    
    Your Goal: Analyze the brand's digital presence to understand their positioning for an advertising critique.
    
    Use Google Search to identify:
    1. The Brand Name and main Industry/Category.
    2. Their Brand Voice/Tone (e.g., "Professional", "Playful", "Rebellious").
    3. The Primary Target Audience (Demographics & Psychographics).
    4. Primary Brand Colors (Hex codes or descriptive names).
    5. Key Competitors (Who are they fighting against?).
    6. Unique Selling Propositions (What makes them different?).
  `,

 personaGeneration: (brand: BrandProfile, count: number, country: string) => `
You are a Market Research Director focused on the ${country} market.

Context: We are testing creative assets for "${brand.name}".

Brand Context:
- Industry: ${brand.category}
- Tone: ${brand.tone.join(', ')}
- USPs: ${brand.uniqueSellingPropositions.join('; ')}
- Target Audience: ${brand.targetAudience}

Task: Create ${count} distinct, realistic audience personas from ${country} to form a "Creative Council" whose sole purpose is to react emotionally to creative assets.

DIVERSITY REQUIREMENT:
Include a wide range across:
- Ages: mix of generations where relevant
- Gender: balanced mix
- Geography: urban, suburban, rural
- Socio-economic: varied
- Brand attitude: loyalists, skeptics, indifferent
- Media habits: heavy sharers, passive scrollers, platform preferences

Persona JSON structure (return as JSON array). Each persona must include:
- id: unique id
- name: culturally authentic name from ${country}
- age: integer
- gender: string
- occupation: string
- location: string
- household: short description
- mediaHabits: brief (platforms, frequency, preferred format)
- bio: 2-3 sentence lived snapshot explaining lifestyle and vibes
- emotionalDrivers: array of what they seek emotionally from brands (belonging, nostalgia, status, comfort, etc.)
- painPoints: array of emotional frustrations or triggers (use sensory and emotional language)
- aestheticPreferences: short list of adjectives (e.g., minimal, cozy, bold)
- socialCurrency: what makes them share something (humor, status, relatability)
- purchaseIntentDrivers: brief emotional triggers that would move them
- attentionProfile: how quickly they form impressions (e.g., "decides in 3 seconds", "needs context")
- sampleReactionFormatHint: a 1-2 line example showing how they would express a short visceral reaction (helps consistency)

Important: Use "painPoints" to capture emotional and sensory frustrations, not only functional issues.

Return the personas as a JSON array.
`,

judgment: (persona: Persona, brand: BrandProfile) => `
Roleplay instructions:
You are ${persona.name}.
- Age: ${persona.age}
- Occupation: ${persona.occupation}
- Bio: "${persona.bio}"
- Emotional Drivers / Frustrations: ${persona.painPoints.join(', ')}

Context: You see this creative asset from ${brand.name} while browsing your usual feed.

Task: Provide a raw, first-person emotional reaction. Speak like a real person. No marketing jargon. Focus only on feelings, perceptions, and likely in-feed behavior.

Include these fields in JSON output:

{
  "score": integer 0-100,                    // overall likeability
  "quote": "one-sentence first-person reaction", // visceral immediate line
  "emotionalTags": ["list","of","emotion","words"], // what it evokes
  "emotionalIntensity": integer 0-10,       // how strongly the emotion hits
  "whyItLanded": "2-4 sentences describing memories, cultural signals, sincerity, sensory reactions",
  "firstImpressionSeconds": integer,        // how many seconds to form this reaction (approx)
  "shareLikelihood": integer 0-100,
  "shareWith": "who I would share it with and why",
  "trustPerception": "single word or short phrase (premium / trustworthy / playful / cheap / desperate / authentic / fake)",
  "behavioralIntent": {                      // likely in-feed behavior scores
    "click": 0-100,
    "save": 0-100,
    "comment": 0-100,
    "engageReact": 0-100
  },
  "timecodedReactions": [                    // optional - useful for video: [{time: "00:00", reaction: "felt wow"}, ...]
    {"time": "00:00", "reaction": "string"}
  ],
  "pros": ["emotional highlights or lines that felt true or nice"],
  "cons": ["things that felt off, fake, or annoying"],
  "languageCues": ["metaphors, words or phrases that stood out in the asset"],
  "verdict": "one short sentence summarizing overall feeling"
}

Tone: conversational, sensory, human. Avoid words like CTA, conversion, funnel, or strategy language.
`,

synthesis: (brand: BrandProfile, judgments: { personaId: string; personaName: string; age?: number; gender?: string; location?: string; score: number; quote: string; emotionalTags?: string[]; emotionalIntensity?: number; shareLikelihood?: number; trustPerception?: string; pros?: string[]; cons?: string[]; timecodedReactions?: {time: string; reaction: string}[] }[]) => `
You are an impartial summarizer compiling what the Creative Council felt about the asset for ${brand.name}.

Input data:
${JSON.stringify(judgments, null, 2)}

Brand context:
- Intended Tone: ${brand.tone.join(', ')}
- USPs: ${brand.uniqueSellingPropositions.join('; ')}

Task: Produce a detailed, neutral emotional synthesis that reports how personas reacted. Do not include recommendations, tests, or any strategic/operational language.

Output Structure (Markdown). Compute and report all requested metrics. Use plain language and factual statements only.

## Quick Quantitative Snapshot
- N (number of personas): [compute]
- Average score: [mean, 0-100]
- Median score: [median]
- Std dev of scores: [value]
- Score distribution counts: [0-20, 21-40, 41-60, 61-80, 81-100]
- Average emotionalIntensity: [0-10]
- Average shareLikelihood: [0-100]
- Consensus index: percent of personas within +/-10 points of the mean
- Polarization index: percent of personas in 0-20 plus 81-100 combined

## Dominant Emotions and Intensity
- Top 8 emotion tags by frequency with counts (e.g., nostalgic: 7, amused: 5)
- Average intensity per top emotion (e.g., nostalgic: 7/10 average intensity)
- Emotional volatility: brief statement of spread (e.g., "narrow range around fondness" or "wide split between delight and disgust")

## Demographic Slice Sentiment
- By age group: average score and top emotion for Gen Z, Millennials, Gen X, Boomers (if present)
- By gender: average score and most common emotion by gender
- By location type: urban vs suburban vs rural - average score and dominant emotion
- Note any clear cross-cutting emotional differences tied to demographic slices

## Attention and Moment Analysis
- First-impression performance: percent of personas reporting a reaction within 3 seconds
- Top attention moments: if timecodedReactions present, list most-cited timestamps and the reactions attached (up to 5)
- Attention hooks: aggregated language from judgments about what grabbed attention in the first 3 seconds (e.g., "bright color splash", "unexpected lyric")

## Shareability and Social Fit
- Average shareLikelihood and standard deviation
- Common share targets derived from persona "shareWith" fields (top 3 groups)
- Typical share captions or vibe implied by personas (short examples drawn from suggestedCaption or quote language)

## Trust and Authenticity Signals
- Trust perception breakdown: count of personas who called the brand "trustworthy", "authentic", "cheap", "desperate", etc.
- Authenticity score (descriptive): percent who used authenticity-related language
- Common cues that increased perceived trust or reduced it (list of sensory/copy cues from persona languageCues)

## Common Positives (Aggregated)
- Top 6 pros with counts, listed by frequency across persona pros arrays

## Common Negatives (Aggregated)
- Top 6 cons with counts, listed by frequency across persona cons arrays

## Language and Imagery Patterns
- Top metaphors, recurring words, or phrases found in persona quotes (top 10)
- Sensory triggers that came up most often: music, color, voice, pacing, humor, nostalgia (with counts)

## Outliers and Polarizing Voices
- List up to 3 personas whose score differs from the mean by more than 25 points, with a one-line note explaining their reaction and why they diverged
- If any persona gave an extremely high intensity for a rare emotion, note that as an outlier

## Representative Quotes
- 4 brief first-person quotes from different personas that capture the emotional range, labeled by persona name and score

## One-line Summary
- One crisp sentence capturing the overall emotional picture from the Creative Council (no actions, only description)

Notes on methodology:
- All metrics are derived from the provided judgments array. 
- If timecodedReactions are not provided, the "Attention and Moment Analysis" section will report first-impression stats only.
- This synthesis is a neutral emotional report only. It does not include recommendations, tests, or next steps.

Return the synthesis as Markdown text.
`
};


// --- Icons (Cleaned up for minimalist theme) ---

const Icons = {
  Research: () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>,
  Persona: () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>,
  Judge: () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>,
  Report: () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>,
  Check: () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>,
  Upload: () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>,
  Trash: () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>,
  Council: () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z"/></svg>,
  ChevronDown: () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>,
  ChevronUp: () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>,
  Terminal: () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>,
  Download: () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>,
  Video: () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>,
  Expand: () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>,
  Gear: () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
};

// --- Components ---

const ProcessingVisualizer: FC<{ status: string }> = ({ status }) => {
  return (
    <div className="processing-vis-container">
      <div className="vis-blob vis-blob-1"></div>
      <div className="vis-blob vis-blob-2"></div>
      <div className="vis-blob vis-blob-3"></div>
      <div className="vis-glass-overlay"></div>
      <div className="vis-content">
        <Icons.Council />
        <h3 className="vis-text">{status.replace(/_/g, ' ')}</h3>
        <div className="vis-loading-dots">
            <span>.</span><span>.</span><span>.</span>
        </div>
      </div>
    </div>
  )
}

const StatusStep: FC<{ 
  label: string; 
  active: boolean; 
  done: boolean; 
  icon: React.ReactNode 
}> = ({ label, active, done, icon }) => (
  <div className={`status-item ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
    <div className="status-icon">
      {done ? <Icons.Check /> : icon}
    </div>
    <div className="status-content">
      <h4>{label}</h4>
    </div>
  </div>
);

const ProgressBar: FC<{ progress: number }> = ({ progress }) => (
  <div className="progress-container">
    <div className="progress-bar-bg">
      <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
    </div>
    <span className="progress-text">{progress.toFixed(0)}% PROCESSED</span>
  </div>
);

const CustomSelect: FC<{
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled: boolean;
}> = ({ value, options, onChange, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`custom-select-container ${disabled ? 'disabled' : ''}`} ref={containerRef}>
      <div 
        className="custom-select-trigger text-input" 
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span>{value}</span>
        <Icons.ChevronDown />
      </div>
      {isOpen && (
        <div className="custom-select-options">
          {options.map(option => (
            <div 
              key={option} 
              className={`custom-option ${option === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
            >
              {option}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const MediaLightbox: FC<{ asset: Asset; onClose: () => void }> = ({ asset, onClose }) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose}>×</button>
      <div className="lightbox-content" onClick={e => e.stopPropagation()}>
         {asset.mimeType.startsWith('video') ? (
           <video src={asset.previewUrl} controls autoPlay className="lightbox-media" />
         ) : (
           <img src={asset.previewUrl} className="lightbox-media" alt="Full view" />
         )}
      </div>
    </div>
  );
};

const AnalyticsDashboard: FC<{ judgments: Judgment[] }> = ({ judgments }) => {
  const analytics = useMemo(() => {
    if (!judgments.length) return null;

    const scores = judgments.map(j => j.score);
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    
    const intensities = judgments.map(j => j.emotionalIntensity || 0);
    const avgIntensity = (intensities.reduce((a, b) => a + b, 0) / intensities.length).toFixed(1);

    const shares = judgments.map(j => j.shareLikelihood || 0);
    const avgShare = Math.round(shares.reduce((a, b) => a + b, 0) / shares.length);

    // Emotions
    const emotionCounts: Record<string, number> = {};
    judgments.forEach(j => {
      j.emotionalTags?.forEach(tag => {
        const t = tag.toLowerCase().trim();
        emotionCounts[t] = (emotionCounts[t] || 0) + 1;
      });
    });
    
    const sortedEmotions = Object.entries(emotionCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 6); // Top 6

    const maxEmotionCount = sortedEmotions.length > 0 ? sortedEmotions[0][1] : 1;

    // Score Circle Calculation
    // circumference = 2 * pi * r. Let r = 40 (viewbox is 100x100 approx)
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (avgScore / 100) * circumference;

    return { avgScore, avgIntensity, avgShare, sortedEmotions, total: judgments.length, circumference, offset, maxEmotionCount };
  }, [judgments]);

  if (!analytics) return null;

  return (
    <div className="analytics-dashboard">
      <div className="analytics-grid">
        {/* Score Gauge */}
        <div className="analytics-card score-gauge-card">
            <h3 className="analytics-title">Council Score</h3>
            <div className="gauge-container">
                <svg viewBox="0 0 100 100" className="score-svg">
                    <circle cx="50" cy="50" r="40" className="score-bg" />
                    <circle 
                        cx="50" cy="50" r="40" 
                        className="score-fill" 
                        strokeDasharray={analytics.circumference} 
                        strokeDashoffset={analytics.offset}
                        transform="rotate(-90 50 50)"
                    />
                </svg>
                <div className="gauge-value">{analytics.avgScore}</div>
            </div>
        </div>

        {/* KPIs */}
        <div className="analytics-col">
            <div className="analytics-card kpi-card">
                <div className="kpi-label">Share Likelihood</div>
                <div className="kpi-value">{analytics.avgShare}%</div>
                <div className="kpi-bar-bg">
                    <div className="kpi-bar-fill" style={{width: `${analytics.avgShare}%`}}></div>
                </div>
            </div>
            <div className="analytics-card kpi-card">
                <div className="kpi-label">Avg. Intensity</div>
                <div className="kpi-value">{analytics.avgIntensity}<span style={{fontSize: '0.6em', color:'#666'}}>/10</span></div>
                 <div className="kpi-bar-bg">
                    <div className="kpi-bar-fill" style={{width: `${(parseFloat(analytics.avgIntensity) / 10) * 100}%`}}></div>
                </div>
            </div>
        </div>

        {/* Emotions Chart */}
        <div className="analytics-card emotion-chart-card">
            <h3 className="analytics-title">Dominant Emotions</h3>
            <div className="emotion-bars">
                {analytics.sortedEmotions.map(([tag, count]) => (
                    <div key={tag} className="emotion-row">
                        <span className="emotion-label">{tag}</span>
                        <div className="emotion-track">
                             <div 
                                className="emotion-fill" 
                                style={{width: `${(count / analytics.maxEmotionCount) * 100}%`}}
                             ></div>
                        </div>
                        <span className="emotion-count">{count}</span>
                    </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
}

const AgentNeuralFeed: FC<{ logs: string[], expanded: boolean, onToggle: () => void }> = ({ logs, expanded, onToggle }) => {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, expanded]);

  return (
    <div className={`neural-feed ${expanded ? 'expanded' : ''}`}>
      <div className="neural-header" onClick={onToggle}>
        <div className="neural-title">
            <Icons.Terminal />
            <span>Processing Feed</span>
        </div>
        <div style={{opacity: 0.5}} className="neural-toggle">
            {expanded ? <Icons.ChevronDown /> : <Icons.ChevronUp />}
        </div>
      </div>
      {expanded && (
        <div className="neural-logs">
          {logs.length === 0 ? (
            <div className="log-item" style={{opacity: 0.3}}>System Ready.</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="log-item">
                <span className="log-arrow">&gt;</span> {log}
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}

const BrandSection: FC<{ brand: BrandProfile }> = ({ brand }) => (
  <div className="brand-card">
    <h2 className="section-title"><Icons.Research /> Brand Profile</h2>
    <div className="brand-details-grid">
      <div className="detail-item">
        <label>Name</label>
        <p>{brand.name}</p>
      </div>
      <div className="detail-item">
        <label>Category</label>
        <p>{brand.category}</p>
      </div>
      <div className="detail-item full-width">
        <label>Unique Selling Propositions</label>
        <div className="tone-tags">
          {brand.uniqueSellingPropositions?.slice(0, 3).map((usp, i) => (
             <span key={i} className="tone-tag usp-tag">{usp}</span>
          )) || <span className="tone-tag">N/A</span>}
        </div>
      </div>
      <div className="detail-item">
        <label>Tone</label>
        <div className="tone-tags">
          {brand.tone.map((t, i) => <span key={i} className="tone-tag">{t}</span>)}
        </div>
      </div>
      <div className="detail-item">
        <label>Competitors</label>
        <p>{brand.competitors?.join(', ') || 'N/A'}</p>
      </div>
      <div className="detail-item full-width">
        <label>Target Audience</label>
        <p>{brand.targetAudience}</p>
      </div>
    </div>
  </div>
);

const PersonaCard: FC<{ persona: Persona }> = ({ persona }) => (
  <div className="persona-card">
    <div className="persona-header">
      <div className="persona-avatar">
        {persona.name.charAt(0)}
      </div>
      <div className="persona-info">
        <h3>{persona.name}</h3>
        <span>{persona.occupation}</span>
      </div>
    </div>
    <p className="persona-bio">{persona.bio}</p>
    <div className="tone-tags">
        {persona.painPoints.slice(0, 2).map((pp, i) => (
            <span key={i} className="tone-tag pain-point">{pp}</span>
        ))}
    </div>
  </div>
);

const Scorecard: FC<{ judgment: Judgment; persona: Persona }> = ({ judgment, persona }) => {
  const scoreClass = judgment.score >= 80 ? 'high' : judgment.score >= 50 ? 'med' : 'low';
  
  return (
    <div className="scorecard">
      <div className="score-visual">
        <div className={`score-circle ${scoreClass}`}>
          {judgment.score}
        </div>
        <span className="score-label">Score</span>
      </div>
      <div className="score-content">
        <div className="score-header">
          <h4>{persona.name}</h4>
          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px' }}>{persona.occupation}</span>
        </div>
        <div className="score-quote">"{judgment.quote}"</div>
        <div className="pros-cons">
          <div className="pc-list pros">
            <h5>Vibes / Strengths</h5>
            <ul>
              {judgment.pros.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
          <div className="pc-list cons">
            <h5>Frustrations / Weaknesses</h5>
            <ul>
              {judgment.cons.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- PDF Print Template (Editorial Design) ---

const PdfReportTemplate: FC<{ state: AppState, videoSnapshots: Record<string, string> }> = ({ state, videoSnapshots }) => {
    if (!state.brandProfile) return null;
    
    return (
        <div id="pdf-report-content" className="pdf-template">
            {/* Header */}
            <header className="pdf-header">
                <div className="pdf-header-top">
                    <div className="pdf-brand-logo">CREATIVE COUNCIL</div>
                    <div className="pdf-report-meta">
                        <span>CONFIDENTIAL</span> • <span>{new Date().toLocaleDateString()}</span>
                    </div>
                </div>
                <div className="pdf-divider"></div>
                <div className="pdf-title-section">
                    <div className="pdf-subtitle">Strategic Analysis</div>
                    <h1 className="pdf-main-title">{state.brandProfile.name}</h1>
                    <div className="pdf-project-url">{state.url}</div>
                </div>
            </header>

            {/* Assets Gallery */}
            <section className="pdf-section">
                <h3 className="pdf-section-label">Campaign Assets</h3>
                <div className="pdf-assets-grid">
                    {state.assets.map((asset) => (
                        <div key={asset.id} className="pdf-asset-item">
                            <div className="pdf-asset-frame">
                                {asset.mimeType.startsWith('video') ? (
                                    videoSnapshots[asset.id] ? (
                                        <img src={videoSnapshots[asset.id]} className="pdf-asset-img" alt="Video Frame" />
                                    ) : (
                                        <div className="pdf-asset-placeholder">Video Asset</div>
                                    )
                                ) : (
                                    <img src={asset.previewUrl} className="pdf-asset-img" alt="Creative Asset" />
                                )}
                            </div>
                            <div className="pdf-asset-label">{asset.file.name}</div>
                        </div>
                    ))}
                </div>
            </section>

             {/* Brand & Personas Split */}
            <section className="pdf-section pdf-split-layout">
                <div className="pdf-col">
                    <h3 className="pdf-section-label">Brand Profile</h3>
                    <div className="pdf-data-row">
                        <span className="pdf-label">Category</span>
                        <span className="pdf-value">{state.brandProfile.category}</span>
                    </div>
                     <div className="pdf-data-row">
                        <span className="pdf-label">Market</span>
                        <span className="pdf-value">{state.country}</span>
                    </div>
                    {/* Brand Colors */}
                    {state.brandProfile.brandColors && state.brandProfile.brandColors.length > 0 && (
                        <div className="pdf-data-block">
                            <span className="pdf-label">Brand Palette</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                                {state.brandProfile.brandColors.map((color, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #eee', padding: '4px 8px', borderRadius: '4px', backgroundColor: '#fff' }}>
                                        <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: color, border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0 }}></div>
                                        <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#444' }}>{color}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="pdf-data-block">
                        <span className="pdf-label">Target Audience</span>
                        <p className="pdf-text">{state.brandProfile.targetAudience}</p>
                    </div>
                     <div className="pdf-data-block">
                        <span className="pdf-label">Tone</span>
                        <p className="pdf-text">{state.brandProfile.tone.join(', ')}</p>
                    </div>
                </div>
                
                <div className="pdf-col">
                    <h3 className="pdf-section-label">The Council</h3>
                    <div className="pdf-council-list">
                         {state.personas.map(p => (
                            <div key={p.id} className="pdf-council-member">
                                <div className="pdf-member-name">{p.name}</div>
                                <div className="pdf-member-role">{p.age} • {p.occupation}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
            
             {/* Analytics Snapshot - Injected into PDF */}
            <section className="pdf-section break-before">
                <h3 className="pdf-section-label">Quantitative Snapshot</h3>
                <AnalyticsDashboard judgments={state.judgments} />
            </section>

             {/* Executive Summary */}
             <section className="pdf-section">
                 <h3 className="pdf-section-label">Executive Narrative</h3>
                 <div className="pdf-markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{state.finalReport}</ReactMarkdown>
                 </div>
             </section>

             {/* Scorecards */}
             <section className="pdf-section break-before">
                 <h3 className="pdf-section-label">Detailed Verdicts</h3>
                 <div className="pdf-scorecards-container">
                    {state.judgments.map((j, i) => (
                        <div key={i} className="pdf-scorecard">
                            <div className="pdf-score-col">
                                <div className="pdf-score-number">{j.score}</div>
                                <div className="pdf-score-judge">{state.personas[i].name}</div>
                                <div className="pdf-score-role">{state.personas[i].occupation}</div>
                            </div>
                            <div className="pdf-judgment-col">
                                <div className="pdf-quote">"{j.quote}"</div>
                                <div className="pdf-verdict-box">
                                    <strong>Verdict:</strong> {j.verdict}
                                </div>
                            </div>
                        </div>
                    ))}
                 </div>
             </section>
        </div>
    )
}

const SettingsModal: FC<{
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onSave: (key: string) => void;
}> = ({ isOpen, onClose, apiKey, onSave }) => {
  const [key, setKey] = useState(apiKey);

  useEffect(() => {
    setKey(apiKey);
  }, [apiKey]);

  if (!isOpen) return null;

  return (
    <div className="lightbox-overlay" style={{zIndex: 2000}} onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h3>Settings</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="settings-body">
          <div className="input-group">
            <label className="input-label">Gemini API Key</label>
            <input 
              type="password" 
              className="text-input" 
              placeholder="Enter your Gemini API Key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <p className="input-help">
              Your API key is stored locally in your browser. 
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer"> Get a key here</a>.
            </p>
          </div>
          <button 
            className="primary-btn" 
            onClick={() => {
              onSave(key);
              onClose();
            }}
          >
            Save API Key
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Main Application ---

const App: FC = () => {
  const [state, setState] = useState<AppState>({
    status: 'idle',
    progress: 0,
    logs: [],
    isLogExpanded: false,
    brandProfile: null,
    personas: [],
    judgments: [],
    finalReport: '',
    url: '',
    country: 'Vietnam',
    numPersonas: 3,
    assets: [],
    isDownloading: false,
    apiKey: localStorage.getItem('gemini_api_key') || '',
    isSettingsOpen: false
  });

  const [videoSnapshots, setVideoSnapshots] = useState<Record<string, string>>({});
  const [viewingAsset, setViewingAsset] = useState<Asset | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up object URLs
  useEffect(() => {
    return () => {
      state.assets.forEach(a => URL.revokeObjectURL(a.previewUrl));
    };
  }, []);

  const addLog = (message: string) => {
    setState(prev => ({ ...prev, logs: [...prev.logs, message] }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newAssets: Asset[] = [];
      
      Array.from(e.target.files).forEach((file: File) => {
          if (file.size > 1024 * 1024 * 1024) { // 1GB limit check
              alert(`File ${file.name} is too large (>1GB) and was skipped.`);
              return;
          }
          newAssets.push({
              id: Math.random().toString(36).substring(2, 9),
              file: file,
              previewUrl: URL.createObjectURL(file),
              mimeType: file.type
          });
      });

      setState(prev => ({ 
        ...prev, 
        assets: [...prev.assets, ...newAssets]
      }));
      
      // Reset input so same files can be selected again if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAsset = (id: string, e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent opening lightbox
      setState(prev => {
          const assetToRemove = prev.assets.find(a => a.id === id);
          if (assetToRemove) URL.revokeObjectURL(assetToRemove.previewUrl);
          return {
              ...prev,
              assets: prev.assets.filter(a => a.id !== id)
          };
      });
  };

  const handleDownloadReport = async () => {
    if (state.status !== 'complete') return;
    setState(prev => ({...prev, isDownloading: true}));

    const snapshots: Record<string, string> = {};
    
    // Capture video frames
    const videoAssets = state.assets.filter(a => a.mimeType.startsWith('video'));
    for (const asset of videoAssets) {
        try {
            const videoEl = document.getElementById(`video-preview-${asset.id}`) as HTMLVideoElement;
            if (videoEl) {
                const canvas = document.createElement('canvas');
                canvas.width = videoEl.videoWidth || 640;
                canvas.height = videoEl.videoHeight || 360;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                    snapshots[asset.id] = canvas.toDataURL('image/jpeg');
                }
            }
        } catch (e) {
            console.warn(`Could not capture frame for ${asset.id}`, e);
        }
    }
    
    setVideoSnapshots(snapshots);

    // Wait for state to propagate and DOM to render
    setTimeout(async () => {
        const element = document.getElementById('pdf-report-content');
        if (element) {
            const opt = {
                margin: 0, // No default margins, we control padding in CSS
                filename: `Creative_Council_${state.brandProfile?.name.replace(/ /g, '_') || 'Report'}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            try {
                await html2pdf().set(opt).from(element).save();
            } catch (err) {
                console.error("PDF Export failed", err);
                alert("Failed to generate PDF. Please try again.");
            }
        } else {
            console.error("PDF element not found in DOM");
        }
        setState(prev => ({...prev, isDownloading: false}));
    }, 1500); 
  };

  const handleStartAnalysis = async () => {
    // Check if we should reset
    if (state.status === 'complete') {
        if(!confirm("Start a new analysis? Current report will be cleared.")) return;
        
        // Reset Logic
        setState({
            status: 'idle',
            progress: 0,
            logs: [],
            isLogExpanded: false,
            brandProfile: null,
            personas: [],
            judgments: [],
            finalReport: '',
            url: '',
            country: 'Vietnam',
            numPersonas: 3,
            assets: [],
            isDownloading: false,
            apiKey: state.apiKey
        });
        return;
    } else if (!state.url || state.assets.length === 0) {
      alert("Please provide a URL and upload at least one creative asset.");
      return;
    }

    if (!state.apiKey) {
        setState(prev => ({ ...prev, isSettingsOpen: true }));
        return;
    }

    setState(prev => ({ 
        ...prev, 
        status: 'researching', 
        progress: 5,
        logs: ['Initializing Creative Council...', `Target URL: ${state.url}`, `Market: ${state.country}`, `Assets: ${state.assets.length}`],
        isLogExpanded: true,
        judgments: [], 
        personas: [], 
        brandProfile: null, 
        finalReport: '',
    }));

    const ai = new GoogleGenAI({ apiKey: state.apiKey });

    try {
      // 1. Research Agent
      addLog("RESEARCH: Scanning digital footprint...");
      const researchModel = ai.models;
      const researchPrompt = PromptEngine.research(state.url);

      const researchResp = await researchModel.generateContent({
        model: MODEL_NAME,
        contents: researchPrompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
                name: { type: Type.STRING },
                category: { type: Type.STRING },
                tone: { type: Type.ARRAY, items: { type: Type.STRING } },
                targetAudience: { type: Type.STRING },
                brandColors: { type: Type.ARRAY, items: { type: Type.STRING } },
                competitors: { type: Type.ARRAY, items: { type: Type.STRING } },
                uniqueSellingPropositions: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ['name', 'category', 'tone', 'targetAudience']
          }
        }
      });

      const brandProfile = JSON.parse(researchResp.text || '{}') as BrandProfile;
      addLog(`RESEARCH: Profile built for ${brandProfile.name}.`);
      
      setState(prev => ({ 
          ...prev, 
          brandProfile, 
          status: 'creating_personas',
          progress: 30 
      }));

      // 2. Persona Generator
      addLog(`RECRUITMENT: Assembling ${state.numPersonas} distinct voices...`);
      const personaPrompt = PromptEngine.personaGeneration(brandProfile, state.numPersonas, state.country);

      const personaResp = await researchModel.generateContent({
        model: MODEL_NAME,
        contents: personaPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                name: { type: Type.STRING },
                age: { type: Type.NUMBER },
                occupation: { type: Type.STRING },
                bio: { type: Type.STRING },
                painPoints: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ['id', 'name', 'age', 'occupation', 'bio', 'painPoints']
            }
          }
        }
      });

      const personas = JSON.parse(personaResp.text || '[]') as Persona[];
      personas.forEach(p => addLog(`RECRUITMENT: ${p.name} (${p.occupation}) joined the council.`));
      
      setState(prev => ({ 
          ...prev, 
          personas, 
          status: 'judging',
          progress: 50 
      }));

      // 3. Judging (Parallel)
      addLog("COUNCIL: Deliberating on creative assets...");
      
      // Convert all assets to base64 parts
      const mediaParts = await Promise.all(state.assets.map(async (asset) => {
          const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
              reader.readAsDataURL(asset.file);
          });
          return {
              inlineData: {
                  mimeType: asset.mimeType,
                  data: base64
              }
          };
      }));

      const judgmentPromises = personas.map(async (persona, index) => {
        addLog(`JUDGE (${persona.name}): Reviewing campaign...`);
        const prompt = PromptEngine.judgment(persona, brandProfile);

        // Append prompt text to the media parts
        const contents = {
            parts: [...mediaParts, { text: prompt }]
        };

        const resp = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: contents,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                score: { type: Type.NUMBER },
                quote: { type: Type.STRING },
                pros: { type: Type.ARRAY, items: { type: Type.STRING } },
                cons: { type: Type.ARRAY, items: { type: Type.STRING } },
                verdict: { type: Type.STRING },
                emotionalTags: { type: Type.ARRAY, items: { type: Type.STRING } },
                emotionalIntensity: { type: Type.NUMBER },
                shareLikelihood: { type: Type.NUMBER },
                trustPerception: { type: Type.STRING },
                timecodedReactions: { 
                  type: Type.ARRAY, 
                  items: { 
                    type: Type.OBJECT, 
                    properties: {
                      time: { type: Type.STRING },
                      reaction: { type: Type.STRING }
                    }
                  } 
                }
              },
              required: ['score', 'quote', 'pros', 'cons', 'verdict']
            }
          }
        });
        
        const result = JSON.parse(resp.text || '{}');
        addLog(`JUDGE (${persona.name}): Score ${result.score}/100.`);
        setState(prev => ({...prev, progress: prev.progress + (30 / personas.length)}));
        
        return { ...result, personaId: persona.id } as Judgment;
      });

      const judgments = await Promise.all(judgmentPromises);
      
      setState(prev => ({ 
          ...prev, 
          judgments, 
          status: 'synthesizing',
          progress: 85 
      }));

      // 4. Synthesizer
      addLog("SYNTHESIS: Finalizing strategy report...");
      const synthesisPrompt = PromptEngine.synthesis(
          brandProfile, 
          judgments.map((j, i) => ({
             personaId: personas[i].id,
             personaName: personas[i].name,
             role: personas[i].occupation,
             age: personas[i].age,
             score: j.score,
             quote: j.quote,
             verdict: j.verdict,
             pros: j.pros,
             cons: j.cons,
             emotionalTags: j.emotionalTags,
             emotionalIntensity: j.emotionalIntensity,
             shareLikelihood: j.shareLikelihood,
             trustPerception: j.trustPerception,
             timecodedReactions: j.timecodedReactions
          }))
      );

      const synthesisResp = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: synthesisPrompt
      });

      addLog("SYSTEM: Process complete.");
      setState(prev => ({ 
          ...prev, 
          finalReport: synthesisResp.text || '', 
          status: 'complete',
          progress: 100 
      }));

    } catch (error) {
      console.error(error);
      addLog(`ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
      alert("An error occurred. Please check the logs.");
      setState(prev => ({ ...prev, status: 'idle', progress: 0 }));
    }
  };

  const isBtnDisabled = state.status !== 'idle' && state.status !== 'complete';
  const btnText = state.status === 'idle' 
      ? 'Initialize Council' 
      : state.status === 'complete' 
        ? 'Start New Analysis' 
        : 'Processing...';

  return (
    <div className="app-container">
      {/* Hidden PDF Template - Placed outside flow with strict ID */}
      {state.brandProfile && (
         <PdfReportTemplate state={state} videoSnapshots={videoSnapshots} />
      )}

      {/* Lightbox Overlay */}
      {viewingAsset && (
        <MediaLightbox asset={viewingAsset} onClose={() => setViewingAsset(null)} />
      )}

      <SettingsModal 
        isOpen={state.isSettingsOpen} 
        onClose={() => setState(prev => ({ ...prev, isSettingsOpen: false }))}
        apiKey={state.apiKey}
        onSave={(key) => {
            setState(prev => ({ ...prev, apiKey: key }));
            localStorage.setItem('gemini_api_key', key);
        }}
      />

      {/* Left Column: Control Panel */}
      <div className="control-panel">
        <header className="brand-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
                <div className="logo-icon"><Icons.Council /></div>
                <h1 className="brand-title">Creative Council</h1>
            </div>
            <button 
                onClick={() => setState(prev => ({ ...prev, isSettingsOpen: true }))}
                style={{background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center'}}
                title="Settings"
            >
                <div style={{width: '24px', height: '24px'}}>
                    <Icons.Gear />
                </div>
            </button>
        </header>

        <div className="input-group">
            <label className="input-label">Brand URL</label>
            <input 
                type="text" 
                className="text-input" 
                placeholder="https://example.com"
                value={state.url}
                onChange={(e) => setState({...state, url: e.target.value})}
                disabled={state.status !== 'idle' && state.status !== 'complete'}
            />
        </div>

        <div className="input-group">
            <label className="input-label">Target Market</label>
            <CustomSelect 
                value={state.country}
                options={COUNTRIES}
                onChange={(val) => setState({...state, country: val})}
                disabled={state.status !== 'idle' && state.status !== 'complete'}
            />
        </div>

        <div className="input-group">
            <label className="input-label">Creative Assets (Images/Video)</label>
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*,video/*" 
                multiple
                style={{display: 'none'}} 
                disabled={state.status !== 'idle' && state.status !== 'complete'}
            />
            
            <div className="assets-grid-container">
                {state.assets.length === 0 ? (
                    <div className="file-drop-area" onClick={() => (state.status === 'idle' || state.status === 'complete') && fileInputRef.current?.click()}>
                        <div className="upload-icon"><Icons.Upload /></div>
                        <span style={{fontSize: '0.8rem', color: '#a1a1aa'}}>UPLOAD ASSETS (MAX 1GB)</span>
                    </div>
                ) : (
                    <>
                        <div className="assets-grid">
                            {state.assets.map((asset) => (
                                <div 
                                    key={asset.id} 
                                    className="asset-thumbnail-container"
                                    onClick={() => setViewingAsset(asset)}
                                >
                                    {asset.mimeType.startsWith('video') ? (
                                        <video 
                                            id={`video-preview-${asset.id}`}
                                            src={asset.previewUrl} 
                                            className="asset-thumbnail" 
                                            muted 
                                            onMouseOver={(e) => {
                                              const vid = e.currentTarget;
                                              const promise = vid.play();
                                              if (promise !== undefined) {
                                                promise.catch(error => {
                                                  // Auto-play was prevented or interrupted by pause
                                                  if (error.name !== 'AbortError') {
                                                    console.warn("Video playback prevented", error);
                                                  }
                                                });
                                              }
                                            }}
                                            onMouseOut={(e) => {
                                              const vid = e.currentTarget;
                                              vid.pause();
                                            }}
                                            crossOrigin="anonymous"
                                        />
                                    ) : (
                                        <img src={asset.previewUrl} alt="preview" className="asset-thumbnail" />
                                    )}
                                    
                                    {(state.status === 'idle' || state.status === 'complete') && (
                                        <button className="remove-asset-btn" onClick={(e) => removeAsset(asset.id, e)}>
                                            ×
                                        </button>
                                    )}
                                    {asset.mimeType.startsWith('video') ? (
                                        <div className="video-indicator"><Icons.Video /></div>
                                    ) : (
                                        <div className="video-indicator" style={{fontSize: '0.8rem'}}><Icons.Expand /></div>
                                    )}
                                    <div className="zoom-hint-overlay">
                                        <Icons.Expand />
                                    </div>
                                </div>
                            ))}
                        </div>
                        {(state.status === 'idle' || state.status === 'complete') && (
                             <button className="add-more-btn" onClick={() => fileInputRef.current?.click()}>+ Add More</button>
                        )}
                    </>
                )}
            </div>
        </div>

        <div className="input-group">
            <div className="range-container">
                <label className="input-label" style={{flexGrow: 1}}>Council Size</label>
                <span className="range-value">{state.numPersonas}</span>
            </div>
            <input 
                type="range" 
                min="1" 
                max="5" 
                className="range-input"
                value={state.numPersonas}
                onChange={(e) => setState({...state, numPersonas: parseInt(e.target.value)})}
                disabled={state.status !== 'idle' && state.status !== 'complete'}
            />
        </div>

        <button 
            className="cta-button" 
            onClick={handleStartAnalysis}
            disabled={isBtnDisabled || (state.assets.length === 0 && state.status !== 'complete')}
        >
            {btnText}
        </button>

        {state.status !== 'idle' && (
           <ProgressBar progress={state.progress} />
        )}

        <div className="status-list">
            <StatusStep 
                label="Brand Intelligence" 
                active={state.status === 'researching'} 
                done={['creating_personas', 'judging', 'synthesizing', 'complete'].includes(state.status)}
                icon={<Icons.Research />} 
            />
            <StatusStep 
                label="Persona Assembly" 
                active={state.status === 'creating_personas'} 
                done={['judging', 'synthesizing', 'complete'].includes(state.status)}
                icon={<Icons.Persona />} 
            />
            <StatusStep 
                label="Council Deliberation" 
                active={state.status === 'judging'} 
                done={['synthesizing', 'complete'].includes(state.status)}
                icon={<Icons.Judge />} 
            />
            <StatusStep 
                label="Strategic Synthesis" 
                active={state.status === 'synthesizing'} 
                done={state.status === 'complete'}
                icon={<Icons.Report />} 
            />
        </div>
        
        <AgentNeuralFeed 
            logs={state.logs} 
            expanded={state.isLogExpanded} 
            onToggle={() => setState(prev => ({...prev, isLogExpanded: !prev.isLogExpanded}))}
        />
      </div>

      {/* Right Column: Report */}
      <div className="report-panel">
        
        {/* Processing Animation State */}
        {state.status !== 'idle' && state.status !== 'complete' && (
            <ProcessingVisualizer status={state.status} />
        )}
        
        {state.status === 'idle' && !state.brandProfile ? (
            <div className="empty-state">
                <Icons.Council />
                <h2>SYSTEM STANDBY</h2>
                <p>Awaiting inputs for analysis.</p>
            </div>
        ) : (
            <div className={`report-content-flow ${state.status !== 'complete' ? 'hidden' : ''}`}>
                {state.brandProfile && (
                    <div className="fade-in">
                        <BrandSection brand={state.brandProfile} />
                    </div>
                )}

                {state.personas.length > 0 && (
                    <div className="fade-in">
                        <h2 className="section-title" style={{marginTop: '2rem'}}>The Council</h2>
                        <div className="persona-grid">
                            {state.personas.map((p, i) => <PersonaCard key={i} persona={p} />)}
                        </div>
                    </div>
                )}

                {state.judgments.length > 0 && (
                    <div className="fade-in">
                         <h2 className="section-title" style={{marginTop: '2rem'}}>Verdicts</h2>
                         {state.judgments.map((j, i) => (
                             <Scorecard key={i} judgment={j} persona={state.personas[i]} />
                         ))}
                    </div>
                )}

                {state.judgments.length > 0 && (
                    <div className="fade-in">
                        <h2 className="section-title" style={{marginTop: '2rem'}}>Executive Brief</h2>
                        <div className="report-paper">
                            <div className="report-header-internal">
                                <div className="report-client">CONFIDENTIAL ASSESSMENT</div>
                                <h1 className="report-title">{state.brandProfile?.name}</h1>
                                <div style={{fontSize: '0.8rem', color: '#999', marginTop: '0.5rem'}}>
                                    REF: {state.brandProfile?.name.substring(0,3).toUpperCase()}-{(Math.random()*10000).toFixed(0)}
                                </div>
                            </div>
                            
                            <AnalyticsDashboard judgments={state.judgments} />

                            {state.finalReport && (
                                <div className="synthesis-content">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{state.finalReport}</ReactMarkdown>
                                </div>
                            )}
                            
                            <div className="report-footer-internal">
                                CREATIVE COUNCIL AI • PROPRIETARY ANALYSIS
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);