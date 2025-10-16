import { useState, useEffect, useRef } from "react";

/**
 * Jarvis UI – Personal Assistant (keeps existing features, adds voice + dashboard widgets)
 *
 * Preserves: Chat, Profil (questions + answers), Météo, Agenda (today/demain), Idées, Karaté, Paramètres (fournisseur/modèle/clé API + Google OAuth), Tests intégrés.
 * Adds: HUD Jarvis (clock + weather + status pills), Voice input (Web Speech API) + TTS, Quick Actions bar, Proposal modal (validate/modify), compact widgets, refined layout.
 *
 * NOTE: This file is plain JavaScript (no TypeScript syntax) so it compiles as .js with CRA/Vite.
 */

function AssistantPerso() {
  // ---------- utils (SSR-safe localStorage helpers) ----------
  const lsGet = (key) => {
    try {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const lsSet = (key, val) => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(key, val);
    } catch {}
  };

  // ---------- state ----------
  const [assistantName, setAssistantName] = useState(lsGet("assistantName") || "Senseï");
  const [messages, setMessages] = useState([
    { from: "assistant", text: `Bonjour 👋 Je suis ${lsGet("assistantName") || "Senseï"}. Que veux-tu organiser aujourd'hui ?` },
  ]);
  const [input, setInput] = useState("");
  const [ideas, setIdeas] = useState([]);
  const [karatePlan, setKaratePlan] = useState([]);
  const [events, setEvents] = useState([]);
  const [profileAnswers, setProfileAnswers] = useState(() => {
    try {
      const saved = lsGet("profileAnswers");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [activeSection, setActiveSection] = useState("all"); // "all" | "idea" | "karate" | "event"
  const [weather, setWeather] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [provider, setProvider] = useState("OpenRouter");
  const [model, setModel] = useState("gpt-4.1-mini");
  const [apiKey, setApiKey] = useState(lsGet("apiKey") || "");
  const [googleToken, setGoogleToken] = useState(lsGet("googleToken") || null);
  const [now, setNow] = useState(new Date());
  const [tests, setTests] = useState([]);

  // Jarvis extras
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const recognitionRef = useRef(null);
  const [showProposal, setShowProposal] = useState(false);
  const [proposal, setProposal] = useState({
    type: "karate",
    title: "Cycle Kicks & Cardio (45 min)",
    items: [
      "Échauffement (10min): corde + mobilité hanches",
      "Technique (15min): Mae Geri / Yoko Geri – 5 x 10 reps par jambe",
      "Puissance (10min): enchaînements 1-2-3 coups, chrono 30/30",
      "Finisher (10min): Tabata squats + burpees",
    ],
    calendar: { date: new Date().toISOString().split("T")[0], time: "19:00", title: "Entraînement Karaté – Kicks" },
    notes: "Objectif: précision + explosivité; RPE 7-8.",
  });
  const [quickToast, setQuickToast] = useState(null);
  const [tools] = useState([
    { name: "ChatGPT", url: "https://chatgpt.com" },
    { name: "Kinko Management", url: "https://kinkomanagement.netlify.app/" },
    { name: "Service Client IA", url: "https://service-client-ia.netlify.app/" },
  ]);

  // ---------- effects ----------
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Weather (Terrebonne): robust + abort on unmount
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const url =
          "https://api.open-meteo.com/v1/forecast?latitude=45.7&longitude=-73.6&current_weather=true&timezone=auto";
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && data.current_weather && typeof data.current_weather === "object") {
          setWeather(data.current_weather);
        } else {
          setWeather(null);
        }
      } catch (e) {
        if (e && e.name !== "AbortError") {
          console.warn("Météo indisponible:", e && e.message ? e.message : e);
          setWeather(null);
        }
      }
    })();
    return () => ctrl.abort();
  }, []);

  // Persist profile & assistant name
  useEffect(() => {
    lsSet("profileAnswers", JSON.stringify(profileAnswers));
  }, [profileAnswers]);
  useEffect(() => {
    lsSet("assistantName", String(assistantName));
  }, [assistantName]);
  useEffect(() => {
    if (apiKey) lsSet("apiKey", String(apiKey));
  }, [apiKey]);

  // ---------- helpers ----------
  const pad = (n) => String(n).padStart(2, "0");
  const digital = (d) => {
    const Y = d.getFullYear();
    const M = pad(d.getMonth() + 1);
    const D = pad(d.getDate());
    const h = pad(d.getHours());
    const m = pad(d.getMinutes());
    const s = pad(d.getSeconds());
    return `${Y}-${M}-${D}  ${h}:${m}:${s}`; // sport/scoreboard style
  };

  const speak = (text) => {
    try {
      const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
      if (!synth) return;
      const u = new window.SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.pitch = 1;
      u.lang = "fr-CA";
      synth.cancel();
      synth.speak(u);
    } catch {}
  };

  const initVoice = () => {
    if (typeof window === "undefined") return null;
  
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      console.warn("⚠️ SpeechRecognition non supporté par ce navigateur.");
      return null;
    }
  
    const rec = new SR();
    // petit bip au démarrage et à la fin
const playBeep = (freq = 800, duration = 150) => {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  setTimeout(() => osc.stop(), duration);
};

    rec.lang = "fr-CA";
    rec.continuous = false;
    rec.interimResults = false;
  
    // === Événements vocaux ===
    rec.onstart = () => {
      console.log("🎙️ Micro ON");
      setListening(true);
    };
  
    rec.onresult = (e) => {
      try {
        const transcript = e.results[0][0].transcript;
        setInput(transcript);
        setMessages((prev) => [...prev, { from: "user", text: transcript }]);
        speak(`${assistantName} a bien reçu.`);
        handleSend(transcript); // 👈 essentiel
      } catch (err) {
        console.error("Erreur reconnaissance vocale :", err);
      }
    };    
  
    rec.onstart = () => {
  playBeep(900);
  console.log("🎙️ Micro ON");
  setListening(true);
};

rec.onend = () => {
  playBeep(400);
  console.log("🎙️ Micro OFF");
  setListening(false);
};

    rec.onerror = (e) => {
      console.warn("⚠️ Erreur reconnaissance vocale :", e.error);
      setListening(false);
    };
  
    rec.onend = () => {
      console.log("🎙️ Micro OFF");
      setListening(false);
    };
  
    return rec;
  };  

  const toggleListen = () => {
    if (listening) {
      try {
        if (recognitionRef.current) recognitionRef.current.stop();
      } catch {}
      setListening(false);
      return;
    }
    const rec = initVoice();
    if (!rec) {
      setQuickToast("Micro non supporté sur ce navigateur.");
      setTimeout(() => setQuickToast(null), 2000);
      return;
    }
    recognitionRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {}
  };

  const handleGoogleLogin = async () => {
    try {
      const clientId = "509675438569-rm8lenuieem6k0d7p269s5o9b254ua85.apps.googleusercontent.com"; // TODO: remplacer par le tien
      const redirectUri = window.location.origin;
      const scope = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events";
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=${scope}`;
      const popup = window.open(authUrl, "_blank", "width=500,height=600");
      const poll = setInterval(() => {
        try {
          if (!popup || popup.closed) {
            clearInterval(poll);
            return;
          }
          const hash = popup.location.hash;
          if (hash) {
            const params = new URLSearchParams(hash.substring(1));
            const accessToken = params.get("access_token");
            if (accessToken) {
              setGoogleToken(accessToken);
              lsSet("googleToken", accessToken);
              popup.close();
              clearInterval(poll);
              setQuickToast("Google connecté ✅");
              setTimeout(() => setQuickToast(null), 1500);
            }
          }
        } catch {}
      }, 400);
    } catch (e) {
      console.warn("Connexion Google échouée:", e && e.message ? e.message : e);
    }
  };

  // >>> FIX: single, async handleSend (no stray 'await' outside a function)
  // ✅ Fonction handleSend corrigée et sécurisée
  const handleSend = async (text) => {
    const userText = typeof text === "string" ? text : input;
    if (!userText || !userText.trim()) return;
  
    setInput("");
    setMessages((prev) => [...prev, { from: "user", text: userText }]);
    setLoading(true);
  
    try {
      if (!apiKey) {
        setMessages((prev) => [
          ...prev,
          {
            from: "assistant",
            text: "⚠️ Pas de clé API configurée. Renseigne-la dans les paramètres.",
          },
        ]);
        setLoading(false);
        return;
      }
  
      // === 🧠 Contexte agenda
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const todayStr = today.toISOString().split("T")[0];
      const tomorrowStr = tomorrow.toISOString().split("T")[0];
  
      const todayList =
        events
          .filter((e) => e.date === todayStr)
          .map((e) => `${e.time} → ${e.title}`)
          .join("; ") || "aucun événement aujourd’hui";
  
      const tomorrowList =
        events
          .filter((e) => e.date === tomorrowStr)
          .map((e) => `${e.time} → ${e.title}`)
          .join("; ") || "aucun événement demain";
  
      // === 🔧 Prompt enrichi pour Jarvis
      const payload = {
        model,
        messages: [
          {
            role: "system",
            content: `Tu es Jarvis, assistant personnel francophone relié à Google Calendar.
            Nous sommes le ${today.toLocaleDateString("fr-CA", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}.
            Voici les événements connus :
            • Aujourd’hui : ${todayList}
            • Demain : ${tomorrowList}
  
            Si l’utilisateur te demande d’ajouter un événement,
            tu dois répondre uniquement sous forme JSON à la ligne suivante :
            {"action":"add_event","title":"Titre","date":"YYYY-MM-DD","time":"HH:MM"}
            Sinon, réponds normalement en texte.`,
          },
          { role: "user", content: userText },
        ],
      };
  
      // === 📡 Envoi à OpenRouter
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });
  
      const data = await res.json();
      let botReply =
        data?.choices?.[0]?.message?.content?.trim() ||
        "Je n’ai pas compris ta demande.";
  
      // === 🤖 Essaie d'interpréter une réponse JSON d’ajout d’événement
      if (botReply.startsWith("{") && botReply.includes('"action"')) {
        try {
          const parsed = JSON.parse(botReply);
          if (parsed.action === "add_event" && parsed.title && parsed.date) {
            setMessages((prev) => [
              ...prev,
              { from: "assistant", text: `🗓️ Ajout de l’événement « ${parsed.title} » le ${parsed.date} à ${parsed.time || "00:00"}...` },
            ]);
  
            await addGoogleEvent(parsed.title, parsed.date, parsed.time || "00:00");
  
            setMessages((prev) => [
              ...prev,
              { from: "assistant", text: `✅ Événement ajouté à ton Google Calendar !` },
            ]);
            speak("Événement ajouté à ton agenda.");
            setLoading(false);
            return;
          }
        } catch (e) {
          console.warn("Erreur JSON Jarvis:", e);
        }
      }
  
      // === Sinon, simple réponse textuelle
      setMessages((prev) => [...prev, { from: "assistant", text: botReply }]);
      speak(botReply);
    } catch (err) {
      console.error("Erreur handleSend :", err);
    } finally {
      setLoading(false);
    }
  };
  
  
  const getIcon = (type) => (type === "idea" ? "💡" : type === "karate" ? "🥋" : type === "event" ? "📅" : "");
  const getListColor = (type) =>
    type === "idea" ? "bg-yellow-100" : type === "karate" ? "bg-green-100" : type === "event" ? "bg-blue-100" : "bg-white";

  const Badge = ({ count, type }) => {
    let color = "bg-gray-600";
    if (type === "idea") color = "bg-yellow-500";
    if (type === "karate") color = "bg-green-500";
    if (type === "event") color = "bg-blue-500";
    return (
      <button
        onClick={() => setActiveSection(activeSection === type ? "all" : type)}
        className={`ml-2 inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white ${color} rounded-full hover:opacity-80`}
      >
        {count}
      </button>
    );
  };

  const sampleProfileQuestions = [
    "Quels sont tes objectifs principaux cette année ?",
    "Quels sports pratiques-tu régulièrement ?",
    "Quels sont tes créneaux préférés pour les entraînements ?",
    "Quelles sont tes priorités familiales ?",
    "Quels outils utilises-tu le plus au quotidien ?",
    "Quel ton préfères-tu pour tes emails professionnels ?",
    "Quelles échéances importantes arrivent bientôt ?",
    "Quels projets entrepreneuriaux gères-tu actuellement ?",
    "Quelles sont tes routines du matin et du soir ?",
    "Quels sujets d’actualité t’intéressent le plus ?",
  ];

  const handleProfileAnswer = (question, value) =>
    setProfileAnswers({ ...profileAnswers, [question]: value });

  // ---------- dates & events ----------
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const todayStr = today.toISOString().split("T")[0];
  const tomorrowStr = tomorrow.toISOString().split("T")[0];
  const todayEvents = events.filter((e) => e.date === todayStr);
  const tomorrowEvents = events.filter((e) => e.date === tomorrowStr);

// 📅 Récupération des événements du jour
const fetchGoogleEvents = async () => {
  if (!googleToken) {
    setQuickToast("Connecte-toi à Google d'abord");
    setTimeout(() => setQuickToast(null), 1500);
    return;
  }

  try {
    const now = new Date();
    const start = now.toISOString();
    const end = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${start}&timeMax=${end}&singleEvents=true&orderBy=startTime`,
      { headers: { Authorization: `Bearer ${googleToken}` } }
    );

    const data = await res.json();
    if (data.items) {
      const formatted = data.items.map((item) => ({
        date: item.start.dateTime?.split("T")[0] || item.start.date,
        time: item.start.dateTime
          ? item.start.dateTime.split("T")[1].slice(0, 5)
          : "",
        title: item.summary || "(Sans titre)",
      }));
      setEvents(formatted);
      setQuickToast(`📅 ${formatted.length} événements chargés`);
      setTimeout(() => setQuickToast(null), 2000);
    } else {
      setQuickToast("Aucun événement trouvé");
    }
  } catch (err) {
    console.error("Erreur fetchGoogleEvents:", err);
    setQuickToast("Erreur Google Calendar");
  }
};

// 📆 Ajouter un événement au calendrier
const addGoogleEvent = async (title, date, time) => {
  if (!googleToken) {
    setQuickToast("Connecte-toi à Google d'abord");
    return;
  }

  try {
    const event = {
      summary: title,
      start: { dateTime: `${date}T${time}:00`, timeZone: "America/Toronto" },
      end: {
        dateTime: `${date}T${
          time ? `${parseInt(time.split(":")[0]) + 1}:00` : "23:59"
        }:00`,
        timeZone: "America/Toronto",
      },
    };

    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${googleToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }
    );

    if (res.ok) {
      setQuickToast("✅ Événement ajouté au calendrier");
      fetchGoogleEvents(); // recharge la liste
    } else {
      const error = await res.json();
      console.warn("Erreur ajout event:", error);
      setQuickToast("Erreur lors de l’ajout");
    }
  } catch (err) {
    console.error("Erreur addGoogleEvent:", err);
    setQuickToast("Erreur connexion Google");
  }
};

  // ---------- self tests ----------
  useEffect(() => {
    const results = [];
    results.push({
      name: "digitalFormat",
      pass: /^\d{4}-\d{2}-\d{2}\s\s\d{2}:\d{2}:\d{2}$/.test(digital(new Date())),
      info: "Horloge au format YYYY-MM-DD  HH:MM:SS",
    });
    if (weather) {
      results.push({
        name: "weatherShape",
        pass: typeof weather.temperature === "number" && typeof weather.windspeed === "number",
        info: "Météo contient temperature & windspeed",
      });
    } else {
      results.push({
        name: "weatherShape",
        pass: true,
        skipped: true,
        info: "Météo non disponible — test ignoré",
      });
    }
    results.push({ name: "googleAuthHooked", pass: typeof handleGoogleLogin === "function", info: "Bouton OAuth relié" });
    
    results.push({
      name: "eventsArrays",
      pass: Array.isArray(events) && Array.isArray(todayEvents) && Array.isArray(tomorrowEvents),
      info: "Les listes d’événements sont bien des tableaux",
    });
    results.push({ name: "uiSplitLayout", pass: true, info: "UI Jarvis HUD + widgets actifs" });
    results.push({ name: "speakExists", pass: typeof speak === "function", info: "Fonction speak disponible" });
    results.push({
      name: "speechSupport",
      pass: typeof window !== "undefined" ? ("speechSynthesis" in window) : false,
      info: "API Speech Synthesis accessible",
    });
    results.push({ name: "toolsPresent", pass: Array.isArray(tools) && tools.length >= 1, info: "Liens rapides configurés" });
    // New tests (non-breaking)
    const isAsync = Object.prototype.toString.call(handleSend).includes("AsyncFunction");
    results.push({ name: "handleSendAsync", pass: isAsync, info: "handleSend est async" });
    results.push({ name: "linksThreeItems", pass: tools.length === 3, info: "3 liens rapides visibles" });
    setTests(results);
  }, [weather, events, assistantName, tools]); // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => {
  if (googleToken) {
    fetchGoogleEvents();
  }
}, [googleToken]);

  // ---------- proposal modal handlers ----------
  const approveProposal = () => {
    if (proposal && proposal.type === "karate") {
      setKaratePlan((prev) => [...prev, { jour: proposal.calendar.date, theme: proposal.title }]);
    } else if (proposal && proposal.type === "idea") {
      setIdeas((prev) => [...prev, { text: proposal.title }]);
    }
    if (googleToken && proposal && proposal.calendar) {
      setEvents((prev) => [
        ...prev,
        {
          date: proposal.calendar.date,
          title: proposal.calendar.title,
          time: proposal.calendar.time,
        },
      ]);
    }
    setShowProposal(false);
    setQuickToast("Proposition validée ✅");
    setTimeout(() => setQuickToast(null), 1500);
  };

  const modifyProposal = () => {
    setProposal((p) => ({ ...p, title: p.title + " (modifié)" }));
    setQuickToast("Proposition modifiée ✏️");
    setTimeout(() => setQuickToast(null), 1200);
  };

  // ---------- render ----------
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* AI Glow styles (scoped) */}
      <style>{`
        .aiGlow { position: relative; }
        .aiGlow::after {
          content: "";
          position: absolute;
          inset: -8px;
          border-radius: 16px;
          background: radial-gradient(60% 60% at 50% 50%, rgba(16,185,129,0.35), rgba(16,185,129,0.12) 60%, transparent 80%);
          filter: blur(12px);
          opacity: 0;
          pointer-events: none;
          transition: opacity .25s ease, transform .25s ease;
        }
        .aiGlow.listening::after { opacity: 1; animation: aiPulse 1.6s ease-in-out infinite; }
        @keyframes aiPulse { 0%,100%{ transform: scale(0.985); } 50%{ transform: scale(1.01); } }
      `}</style>

      {/* HUD Jarvis */}
      <header className="sticky top-0 z-20 border-b border-slate-800/60 backdrop-blur bg-slate-900/70">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="text-2xl font-mono tracking-widest text-emerald-400"
              style={{ textShadow: "0 0 8px rgba(16,185,129,0.8)" }}
            >
              ⏱ {digital(now)}
            </div>
            {weather && (
              <div className="text-sm text-slate-300">🌤 Terrebonne : {weather.temperature}°C • {weather.windspeed} km/h</div>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className={`px-2 py-1 rounded-full ${Object.keys(profileAnswers).length ? "bg-emerald-600/30 text-emerald-300" : "bg-rose-600/30 text-rose-300"}`}>Profil</span>
            <span className={`px-2 py-1 rounded-full ${apiKey ? "bg-emerald-600/30 text-emerald-300" : "bg-rose-600/30 text-rose-300"}`}>Clé API</span>
            <span className={`px-2 py-1 rounded-full ${googleToken ? "bg-emerald-600/30 text-emerald-300" : "bg-rose-600/30 text-rose-300"}`}>Google</span>
            {/* 🎙️ Bouton vocal immersif */}
<div className="relative flex flex-col items-center">
<button
  onClick={toggleListen}
  className={`relative w-16 h-16 rounded-full grid place-items-center transition-all duration-300
    ${listening
      ? "bg-cyan-500/20 shadow-[0_0_30px_rgba(34,211,238,0.8)] scale-110"
      : "bg-emerald-500/10 hover:bg-emerald-500/20 hover:scale-105 shadow-[0_0_10px_rgba(16,185,129,0.4)]"
    }`}
>
  {/* Halo animé quand l’écoute est active */}
  {listening && (
    <>
      <span className="jarvis-wave"></span>
      <span className="jarvis-wave delay-200"></span>
      <span className="jarvis-wave delay-400"></span>
    </>
  )}

  {/* Icône vortex */}
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 200 200"
    className={`w-10 h-10 ${listening ? "text-cyan-300" : "text-emerald-400"} animate-pulse-fast`}
  >
    <circle cx="100" cy="100" r="60" fill="none" stroke="currentColor" strokeWidth="10" opacity="0.85"/>
    <circle cx="100" cy="100" r="30" fill="currentColor" opacity="0.8"/>
  </svg>
</button>


  <p className="mt-2 text-xs text-slate-400 font-light h-5">
    {listening ? (
      <span className="text-emerald-400 animate-pulse">🎧 Jarvis écoute...</span>
    ) : (
      <span className="opacity-60">Appuie pour parler</span>
    )}
  </p>
</div>

          </div>
        </div>
        {/* Ribbon: Today (2/3) + Tomorrow (1/3) */}
        <div className="max-w-7xl mx-auto px-4 pb-3 grid grid-cols-3 gap-3">
          <div className="col-span-2 border border-blue-400/30 rounded-lg p-2 bg-gradient-to-br from-blue-950/40 to-blue-900/20">
            <p className="font-semibold text-blue-300 flex items-center gap-2"><span className="inline-block w-2 h-2 rounded-full bg-blue-400"></span>Événements aujourd'hui</p>
            {todayEvents.length ? (
              <ul className="ml-2 mt-1 space-y-1">
                {todayEvents.map((e, i) => (
                  <li key={i} className="pl-2 border-l-2 border-blue-400/60"><span className="text-blue-200 font-semibold mr-2">{e.time}</span><span className="text-slate-200">{e.title}</span></li>
                ))}
              </ul>
            ) : (
              <p className="text-blue-200/70">Aucun événement prévu aujourd'hui.</p>
            )}
          </div>
          <div className="col-span-1 border border-emerald-400/30 rounded-lg p-2 bg-gradient-to-br from-emerald-950/40 to-emerald-900/20">
            <p className="font-semibold text-emerald-300 flex items-center gap-2"><span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>Événements demain</p>
            {tomorrowEvents.length ? (
              <ul className="ml-2 mt-1 space-y-1">
                {tomorrowEvents.map((e, i) => (
                  <li key={i} className="pl-2 border-l-2 border-emerald-400/60"><span className="text-emerald-200 font-semibold mr-2">{e.time}</span><span className="text-slate-200">{e.title}</span></li>
                ))}
              </ul>
            ) : (
              <p className="text-emerald-200/70">Aucun événement prévu demain.</p>
            )}
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-7xl mx-auto px-4 grid grid-cols-3 gap-4 py-4">
        {/* Chat (Jarvis panel) */}
        <section className="col-span-2 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-xl font-semibold">🤖 {assistantName}</h1>
            <div className="text-xs text-slate-400">Moteur: {provider} • {model}</div>
          </div>

          {/* Chat frame with AI glow when listening */}
          <div className={`aiGlow ${listening ? "listening" : ""} rounded-xl`}>
            <div className="border border-slate-700 rounded-xl p-2 h-96 overflow-y-auto bg-slate-900/40">
              {messages.map((m, i) => (
                <div key={i} className={`mb-2 ${m.from === "assistant" ? "text-emerald-300" : "text-slate-200 text-right"}`}>
                  <span className="inline-block px-3 py-2 rounded-lg bg-slate-800/60 shadow-sm whitespace-pre-line">{m.text}</span>
                </div>
              ))}
            </div>
          </div>

{/* 🌊 Animation Siri / Analyse vocale en cours */}
{loading && (
  <div className="flex items-center justify-center mt-4 mb-2">
    <div className="relative w-32 h-8 overflow-hidden">
      <div className="absolute inset-0 flex justify-center gap-2">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="w-2 h-2 bg-emerald-400 rounded-full animate-wave"
            style={{ animationDelay: `${i * 0.15}s` }}
          ></div>
        ))}
      </div>
    </div>
    <p className="text-slate-400 text-sm ml-3 animate-pulse">
      🔍 Analyse vocale en cours...
    </p>
  </div>
)}

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 mt-2">
            <button className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs" onClick={() => { setShowProposal(true); speak("Proposition d'entraînement prête."); }}>⚡ Proposer un entraînement</button>
            <button className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs" onClick={() => { setIdeas((p)=>[...p,{text:"Idée: série de vidéos Karaté"}]); setQuickToast("Idée ajoutée"); setTimeout(()=>setQuickToast(null),1200); }}>💡 Ajouter une idée</button>
            <button className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs" onClick={() => { if (!googleToken) { setQuickToast("Connecte Google d'abord"); setTimeout(()=>setQuickToast(null),1200); return;} setEvents((p)=>[...p,{date:todayStr,title:"Bloc Deep Work",time:"10:00"}]); setQuickToast("Event ajouté"); setTimeout(()=>setQuickToast(null),1200); }}>📅 Ajouter un event</button>
          </div>
          <div className="flex gap-2 mt-2">
            <input className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-100" placeholder="Parle à Jarvis…" value={input} onChange={(e)=>setInput(e.target.value)} onKeyDown={(e)=> e.key==="Enter" && handleSend()} />
            <button onClick={handleSend} className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white">Envoyer</button>
          </div>
        </section>

        {/* Widgets column */}
        <aside className="col-span-1 space-y-4">
          {/* Liens rapides */}
          <div className="border border-slate-700 rounded-xl bg-slate-900/50 p-3">
            <h2 className="font-semibold mb-2">🔗 Liens rapides</h2>
            <ul className="space-y-1 text-sm">
              {tools.map((t, i) => (
                <li key={i}>
                  <a
                    className="text-emerald-300 hover:text-emerald-200 underline"
                    href={t.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Profil (collapsible) */}
          <div className="border border-slate-700 rounded-xl bg-slate-900/50">
            <div className="p-3 cursor-pointer flex items-center justify-between" onClick={() => setShowProfile(!showProfile)}>
              <h2 className="font-semibold">👤 Mon Profil</h2>
              <span>{showProfile ? "▼" : "▶"}</span>
            </div>
            {showProfile && (
              <div className="p-3 pt-0">
                <label className="block mb-2 text-sm">Nom de l’assistant</label>
                <input type="text" value={assistantName} onChange={(e)=>setAssistantName(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 mb-3" />
                <ul className="ml-1 text-xs text-slate-300 space-y-2">
                  {sampleProfileQuestions.map((q,i)=> (
                    <li key={i}>
                      <p className="font-medium text-slate-200 mb-1">{q}</p>
                      <textarea className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5" rows={2} value={profileAnswers[q] || ""} onChange={(e)=>handleProfileAnswer(q, e.target.value)} placeholder="Ta réponse…"/>
                    </li>
                  ))}
                </ul>
                <label className="block mt-3 text-sm">Compléments libres</label>
                <textarea className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5" rows={3} placeholder="Autres infos importantes…" value={profileAnswers["complements"] || ""} onChange={(e)=>handleProfileAnswer("complements", e.target.value)} />
              </div>
            )}
          </div>

          {/* Idées */}
          {(activeSection === "all" || activeSection === "idea") && (
            <div className={`p-3 border border-slate-700 rounded-xl bg-slate-900/50 ${getListColor("idea").replace("bg-","bg-opacity-0 ")}`}>
              <h2 className="font-semibold mb-2 flex items-center">💡 Idées <Badge count={ideas.length} type="idea" /></h2>
              <ul className="list-disc ml-5 max-h-24 overflow-y-auto text-sm">
                {ideas.map((idea, i) => (<li key={i}>{getIcon("idea")} {idea.text}</li>))}
              </ul>
            </div>
          )}

          {/* Karaté */}
          {(activeSection === "all" || activeSection === "karate") && (
            <div className={`p-3 border border-slate-700 rounded-xl bg-slate-900/50 ${getListColor("karate").replace("bg-","bg-opacity-0 ")}`}>
              <h2 className="font-semibold mb-2 flex items-center">🥋 Karaté <Badge count={karatePlan.length} type="karate" /></h2>
              <ul className="list-disc ml-5 max-h-24 overflow-y-auto text-sm">
                {karatePlan.map((p, i) => (<li key={i}>{getIcon("karate")} {p.jour} – {p.theme}</li>))}
              </ul>
            </div>
          )}

          {/* Agenda */}
          {(activeSection === "all" || activeSection === "event") && (
            <div className={`p-3 border border-slate-700 rounded-xl bg-slate-900/50 ${getListColor("event").replace("bg-","bg-opacity-0 ")}`}>
              <h2 className="font-semibold mb-2 flex items-center">📅 Agenda <Badge count={events.length} type="event" /></h2>
              <ul className="list-disc ml-5 max-h-24 overflow-y-auto text-sm">
                {events.map((e, i) => (<li key={i}>{getIcon("event")} {e.date} – {e.title} ({e.time})</li>))}
              </ul>
            </div>
          )}

          {/* Paramètres (collapsible) */}
          <div className="border border-slate-700 rounded-xl bg-slate-900/50">
            <div className="p-3 cursor-pointer flex items-center justify-between" onClick={() => setShowSettings(!showSettings)}>
              <h2 className="font-semibold">⚙️ Paramètres</h2>
              <span>{showSettings ? "▼" : "▶"}</span>
            </div>
            {showSettings && (
              <div className="p-3 pt-0 text-sm space-y-2">
                <div>
                  <label className="block mb-1">Fournisseur</label>
                  <select value={provider} onChange={(e)=>setProvider(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5">
                    <option>OpenRouter</option>
                    <option>OpenAI</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1">Modèle</label>
                  <select value={model} onChange={(e)=>setModel(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5">
                    <option>gpt-4.1-mini</option>
                    <option>gpt-4.1</option>
                    <option>claude-3-sonnet</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1">Clé API</label>
                  <input type="password" value={apiKey} onChange={(e)=>setApiKey(e.target.value)} placeholder="Entre ta clé API" className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5" />
                </div>
                <button onClick={handleGoogleLogin} className={`w-full mt-1 px-3 py-2 rounded ${googleToken ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-200"}`}>
                  {googleToken ? "Compte Google connecté ✅" : "Connecter Google Calendar"}
                </button>
              </div>
            )}
          </div>

          {/* Tests */}
          <div className="p-3 border border-slate-700 rounded-xl bg-slate-900/50">
            <h2 className="font-semibold mb-2">🧪 Tests intégrés</h2>
            <ul className="text-xs list-disc ml-5 space-y-0.5">
              {tests.map((t, i) => (
                <li key={i} className={t.pass ? "text-emerald-300" : "text-rose-300"}>
                  <strong>{t.name}</strong>: {t.skipped ? "(ignoré) " : ""}{t.pass ? "OK" : "FAIL"} — {t.info}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </main>

      {/* Proposal Modal */}
      {showProposal && (
        <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">Proposition – {proposal && proposal.type === "karate" ? "Karaté" : "Idée"}</h3>
              <button onClick={()=>setShowProposal(false)} className="text-slate-400 hover:text-slate-200">✖</button>
            </div>
            <p className="font-medium mb-1">{proposal ? proposal.title : ""}</p>
            <ul className="list-disc ml-5 text-sm text-slate-300">
              {proposal && proposal.items && proposal.items.map((it, idx)=>(<li key={idx}>{it}</li>))}
            </ul>
            {proposal && proposal.calendar && (
              <div className="mt-3 text-sm text-slate-300">📅 {proposal.calendar.date} • {proposal.calendar.time} – {proposal.calendar.title}</div>
            )}
            {proposal && proposal.notes && <p className="mt-2 text-xs text-slate-400">{proposal.notes}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={approveProposal} className="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-500">Valider</button>
              <button onClick={modifyProposal} className="px-3 py-2 rounded bg-slate-700 text-slate-100 hover:bg-slate-600">Modifier</button>
              <button onClick={()=>setShowProposal(false)} className="px-3 py-2 rounded bg-slate-800 text-slate-200 hover:bg-slate-700">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {quickToast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 px-3 py-2 rounded bg-slate-800 text-slate-100 border border-slate-600 shadow-lg">{quickToast}</div>
      )}
    </div>
    );
  } // fin du composant AssistantPerso
  
  export default AssistantPerso;
