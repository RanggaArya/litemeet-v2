'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
  useRemoteParticipants,
  useRoomContext,
  useChat,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track, RoomEvent, VideoPresets } from 'livekit-client';

// --- ICONS ---
const ICONS = {
  mic: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`,
  micOff: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`,
  cam: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"></path><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`,
  camOff: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`,
  screen: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`,
  chat: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
  hangup: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" y1="1" x2="1" y2="23"></line></svg>`,
  pip: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"></path><path d="M21 15v4a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2z"></path></svg>`,
  layout: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>`,
};

// --- BANDWIDTH MODE PRESETS ---
const BANDWIDTH_MODES = {
  saver: {
    label: 'Mode Hemat',
    sublabel: 'Seperti WhatsApp · ~150 MB/jam',
    icon: '📶',
    resolution: VideoPresets.h360.resolution,
    maxBitrate: 200_000,
    maxFramerate: 15,
    screenShareBitrate: 300_000,
    screenShareFps: 10,
    simulcastLayers: [VideoPresets.h90, VideoPresets.h180],
  },
  hd: {
    label: 'Mode HD',
    sublabel: 'Kualitas tinggi · ~1.3 GB/jam',
    icon: '🎬',
    resolution: VideoPresets.h720.resolution,
    maxBitrate: 1_500_000,
    maxFramerate: 30,
    screenShareBitrate: 1_500_000,
    screenShareFps: 15,
    simulcastLayers: [VideoPresets.h180, VideoPresets.h360],
  },
  fhd: {
    label: 'Mode FHD',
    sublabel: 'Kualitas mantap · ~2.5 GB/jam',
    icon: '🎥',
    resolution: VideoPresets.h1080.resolution,
    maxBitrate: 3_000_000,
    maxFramerate: 30,
    screenShareBitrate: 3_000_000,
    screenShareFps: 30,
    simulcastLayers: [VideoPresets.h360, VideoPresets.h720],
  },
};

// --- Helper: Build RoomOptions based on mode ---
function buildRoomOptions(mode) {
  const cfg = BANDWIDTH_MODES[mode];
  return {
    adaptiveStream: true,
    dynacast: true,
    videoCaptureDefaults: {
      resolution: cfg.resolution,
      facingMode: 'user',
    },
    publishDefaults: {
      videoEncoding: {
        maxBitrate: cfg.maxBitrate,
        maxFramerate: cfg.maxFramerate,
      },
      screenShareEncoding: {
        maxBitrate: cfg.screenShareBitrate,
        maxFramerate: cfg.screenShareFps,
      },
      dtx: true,
      red: false,
      videoSimulcastLayers: cfg.simulcastLayers,
    },
  };
}

export default function Home() {
  const [room, setRoom] = useState('');
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bandwidthMode, setBandwidthMode] = useState('saver'); // default hemat

  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const roomOptions = useMemo(() => buildRoomOptions(bandwidthMode), [bandwidthMode]);

  const joinRoom = async () => {
    if (!room || !name) {
      alert("Mohon isi Nama Ruangan dan Nama Anda!");
      return;
    }
    setLoading(true);

    try {
      const resp = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room, username: name }),
      });
      const data = await resp.json();

      if (data.token) {
        setToken(data.token);
        setJoined(true);
      } else {
        alert("Gagal mendapatkan token.");
      }
    } catch (e) {
      console.error(e);
      alert("Terjadi kesalahan koneksi.");
    } finally {
      setLoading(false);
    }
  };

  if (!joined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white p-4 font-sans relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-[#030712] overflow-hidden z-0">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-screen filter blur-[100px] opacity-20 animate-blob"></div>
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-indigo-500 rounded-full mix-blend-screen filter blur-[100px] opacity-20 animate-blob animation-delay-2000"></div>
        </div>

        <div className="w-full max-w-md bg-white/5 backdrop-blur-2xl p-8 rounded-[2rem] shadow-[0_20px_50px_rgba(8,_112,_184,_0.1)] border border-white/10 z-10 animate-slide-up relative overflow-hidden group">
          {/* Efek kilap on hover */}
          <div className="absolute top-0 -inset-full h-full w-1/2 z-5 block transform -skew-x-12 bg-gradient-to-r from-transparent to-white opacity-10 group-hover:animate-shine"></div>

          <div className="absolute top-6 right-8 text-xs font-mono font-bold text-indigo-300/80 bg-indigo-900/40 px-3 py-1 rounded-full border border-indigo-500/30 shadow-inner">
            {currentTime || '••:••'}
          </div>

          <div className="text-center mb-8 mt-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 mb-6 shadow-[0_0_40px_rgba(99,102,241,0.5)] ring-4 ring-white/10 animate-float">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white drop-shadow-md animate-pulse-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            </div>
            <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-200 to-indigo-400 mb-2 tracking-tight">Lite-Meet</h1>
            <p className="text-indigo-200/60 text-sm tracking-[0.2em] font-medium uppercase relative inline-block">
              <span className="absolute left-0 top-1/2 w-4 h-[1px] bg-indigo-500/50 -translate-x-6"></span>
              Video Conference
              <span className="absolute right-0 top-1/2 w-4 h-[1px] bg-indigo-500/50 translate-x-6"></span>
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="text-xs font-bold text-indigo-300 uppercase ml-1 mb-2 block">Room Name</label>
              <input className="w-full p-4 rounded-xl bg-black/30 text-white border border-white/10 focus:border-indigo-500 outline-none transition-all" placeholder="Ex: DailyScrum" onChange={(e) => setRoom(e.target.value)} value={room} />
            </div>
            <div>
              <label className="text-xs font-bold text-indigo-300 uppercase ml-1 mb-2 block">Display Name</label>
              <input className="w-full p-4 rounded-xl bg-black/30 text-white border border-white/10 focus:border-indigo-500 outline-none transition-all" placeholder="Ex: Rangga" onChange={(e) => setName(e.target.value)} value={name} />
            </div>

            {/* === MODE SELECTION === */}
            <div>
              <label className="text-xs font-bold text-indigo-300 uppercase ml-1 mb-3 block">Kualitas Video</label>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(BANDWIDTH_MODES).map(([key, mode]) => (
                  <button
                    key={key}
                    onClick={() => setBandwidthMode(key)}
                    className={`relative p-4 rounded-xl border transition-all duration-300 text-left group overflow-hidden
                      ${bandwidthMode === key
                        ? key === 'saver'
                          ? 'bg-emerald-500/15 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                          : 'bg-blue-500/15 border-blue-500/50 shadow-lg shadow-blue-500/10'
                        : 'bg-black/20 border-white/10 hover:border-white/20 hover:bg-white/5'
                      }`}
                  >
                    {bandwidthMode === key && (
                      <div className={`absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px]
                        ${key === 'saver' ? 'bg-emerald-500' : key === 'hd' ? 'bg-blue-500' : 'bg-purple-500'}`}>
                        ✓
                      </div>
                    )}
                    <div className="text-xl mb-1">{mode.icon}</div>
                    <div className={`text-sm font-bold ${bandwidthMode === key ? 'text-white' : 'text-gray-300'}`}>
                      {mode.label}
                    </div>
                    <div className={`text-[11px] mt-0.5 ${bandwidthMode === key ? (key === 'saver' ? 'text-emerald-300/80' : key === 'hd' ? 'text-blue-300/80' : 'text-purple-300/80') : 'text-gray-500'}`}>
                      {mode.sublabel}
                    </div>
                  </button>
                ))}
              </div>
              {bandwidthMode === 'saver' && (
                <div className="mt-3 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300/80 flex items-center gap-2">
                  <span>🌿</span>
                  <span>Hemat kuota ~85% · Resolusi 360p · Cocok untuk meeting biasa</span>
                </div>
              )}
              {bandwidthMode === 'hd' && (
                <div className="mt-3 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300/80 flex items-center gap-2">
                  <span>🎬</span>
                  <span>Kualitas tinggi 720p · Butuh koneksi stabil</span>
                </div>
              )}
              {bandwidthMode === 'fhd' && (
                <div className="mt-3 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-[11px] text-purple-300/80 flex items-center gap-2">
                  <span>⚠️</span>
                  <span>Kuota extra besar ~2.5 GB/jam · Resolusi 1080p super jernih</span>
                </div>
              )}
            </div>

            <button onClick={joinRoom} disabled={loading} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white py-4 rounded-xl font-bold text-lg shadow-xl transition-all transform hover:scale-[1.02] active:scale-[0.98]">
              {loading ? "Connecting..." : "Start Meeting"}
            </button>
          </div>
        </div>
        <style jsx>{`
          @keyframes blob { 0% { transform: scale(1); } 33% { transform: scale(1.1) translate(30px, -50px); } 66% { transform: scale(0.9) translate(-20px, 20px); } 100% { transform: scale(1); } }
          @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
          @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes shine { 100% { left: 125%; } }
          .animate-blob { animation: blob 7s infinite; }
          .animate-float { animation: float 3s ease-in-out infinite; }
          .animate-slide-up { animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
          .animate-shine { animation: shine 2s infinite cubic-bezier(0.4, 0, 0.2, 1); }
          .animate-pulse-slow { animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
          .animation-delay-2000 { animation-delay: 2s; }
          .animation-delay-4000 { animation-delay: 4s; }
        `}</style>
      </div>
    );
  }

  return (
    <LiveKitRoom
      video={true}
      audio={true}
      token={token}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
      data-lk-theme="default"
      style={{ height: '100dvh', backgroundColor: '#030712' }}
      onDisconnected={() => { setJoined(false); setToken(''); }}
      options={roomOptions}
    >
      <MyVideoConference myName={name} bandwidthMode={bandwidthMode} setBandwidthMode={setBandwidthMode} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

// --- BANDWIDTH MONITOR COMPONENT ---
function BandwidthMonitor({ bandwidthMode }) {
  const room = useRoomContext();
  const [stats, setStats] = useState({ upload: 0, download: 0 });
  const prevBytesRef = useRef({ sent: 0, received: 0, timestamp: 0 });

  useEffect(() => {
    if (!room) return;

    const interval = setInterval(async () => {
      try {
        // Get stats from all peer connections via the room's engine
        const senders = room.engine?.pcManager?.publisher?.getStats?.();
        const receivers = room.engine?.pcManager?.subscriber?.getStats?.();

        let totalBytesSent = 0;
        let totalBytesReceived = 0;

        if (senders) {
          const senderStats = await senders;
          senderStats.forEach((report) => {
            if (report.type === 'transport') {
              totalBytesSent += report.bytesSent || 0;
              totalBytesReceived += report.bytesReceived || 0;
            }
          });
        }

        if (receivers) {
          const receiverStats = await receivers;
          receiverStats.forEach((report) => {
            if (report.type === 'transport') {
              totalBytesSent += report.bytesSent || 0;
              totalBytesReceived += report.bytesReceived || 0;
            }
          });
        }

        const now = Date.now();
        const prev = prevBytesRef.current;

        if (prev.timestamp > 0) {
          const elapsed = (now - prev.timestamp) / 1000;
          if (elapsed > 0) {
            const uploadKBps = Math.max(0, (totalBytesSent - prev.sent) / 1024 / elapsed);
            const downloadKBps = Math.max(0, (totalBytesReceived - prev.received) / 1024 / elapsed);
            setStats({
              upload: Math.round(uploadKBps),
              download: Math.round(downloadKBps),
            });
          }
        }

        prevBytesRef.current = { sent: totalBytesSent, received: totalBytesReceived, timestamp: now };
      } catch {
        // Stats not available — silently ignore
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [room]);

  const totalKBps = stats.upload + stats.download;
  const statusColor = totalKBps < 300 ? 'text-emerald-400' : totalKBps < 800 ? 'text-yellow-400' : 'text-red-400';
  const statusDot = totalKBps < 300 ? 'bg-emerald-400' : totalKBps < 800 ? 'bg-yellow-400' : 'bg-red-400';
  const modeLabel = BANDWIDTH_MODES[bandwidthMode]?.label || '';

  return (
    <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl px-3 py-2 flex items-center gap-3 shadow-lg">
      <div className={`w-2 h-2 rounded-full ${statusDot} animate-pulse`}></div>
      <div className="flex flex-col">
        <div className={`text-[10px] ${statusColor} font-bold uppercase tracking-wider`}>
          {modeLabel}
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-blue-300">↑ {stats.upload} KB/s</span>
          <span className="text-gray-600">│</span>
          <span className="text-green-300">↓ {stats.download} KB/s</span>
        </div>
      </div>
    </div>
  );
}

function MyVideoConference({ myName, bandwidthMode, setBandwidthMode }) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState([]);
  const { chatMessages, send } = useChat();
  
  const [meetingStart] = useState(Date.now());
  const [durationStr, setDurationStr] = useState('00:00');

  useEffect(() => {
    const timer = setInterval(() => {
      const diff = Math.floor((Date.now() - meetingStart) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
      const s = (diff % 60).toString().padStart(2, '0');
      setDurationStr(h > 0 ? `${h.toString().padStart(2, '0')}:${m}:${s}` : `${m}:${s}`);
    }, 1000);
    return () => clearInterval(timer);
  }, [meetingStart]);

  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();

  const [oneOnOneMode, setOneOnOneMode] = useState('remote-main'); // 'remote-main', 'local-main', 'grid'

  // --- PiP Browser Logic ---
  const handleToggleBrowserPiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return;
      }
      
      const videos = document.querySelectorAll('video');
      // Cari video peserta lawan (bukan diri sendiri)
      let targetVideo = Array.from(videos).find(v => {
        const participantTile = v.closest('.lk-participant-tile');
        // Identifikasi remote video jika kita tau ada class spesifik, atau cari yang tidak di-mute secara lokal (diri sendiri biasanya muted).
        return participantTile && Array.from(participantTile.classList).some(c => c.includes('remote') || c.includes('audio') === false);
      });

      // Default jika tidak bisa mendeteksi secara pasti, ambil video pertama.
      if (!targetVideo && videos.length > 0) targetVideo = videos[0];

      if (targetVideo) {
        await targetVideo.requestPictureInPicture();
        addToast('Membuka mode PiP window', 'success');
      } else {
        addToast('Tidak ada video untuk PiP', 'error');
      }
    } catch (e) {
      console.error(e);
      addToast('Browser tidak mendukung Picture-in-Picture', 'error');
    }
  };

  // --- DYNAMIC MODE SWITCHING MID-CALL ---
  const toggleDataSaver = useCallback(async () => {
    let newMode;
    if (bandwidthMode === 'saver') newMode = 'hd';
    else if (bandwidthMode === 'hd') newMode = 'fhd';
    else newMode = 'saver';

    const cfg = BANDWIDTH_MODES[newMode];
    setBandwidthMode(newMode);

    // Dynamically update local video track encoding
    if (localParticipant) {
      try {
        const camPubs = localParticipant.videoTrackPublications;
        for (const [, pub] of camPubs) {
          if (pub.track && pub.source === Track.Source.Camera) {
            // Restart the camera with new constraints
            await localParticipant.setCameraEnabled(false);
            // Brief pause to allow the track to stop
            await new Promise(r => setTimeout(r, 200));
            await localParticipant.setCameraEnabled(true);
          }
        }
      } catch (e) {
        console.warn('Failed to update video encoding:', e);
      }
    }

    addToast(
      newMode === 'saver'
        ? '🌿 Mode Hemat aktif · Kuota irit!'
        : newMode === 'hd' ? '🎬 Mode HD aktif · Kualitas tinggi' : '🎥 Mode FHD aktif · Sangat jernih',
      newMode === 'saver' ? 'success' : newMode === 'fhd' ? 'error' : 'info'
    );
  }, [bandwidthMode, setBandwidthMode, localParticipant]);

  // --- TOAST HELPER ---
  const addToast = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  //NOTIFIKASI BERGABUNG/KELUAR
  useEffect(() => {
    if (!room) return;

    const onConnected = (participant) => {
      addToast(`${participant.identity} bergabung ke room! 👋`, 'success');
    };

    const onDisconnected = (participant) => {
      addToast(`${participant.identity} meninggalkan room. 👋`, 'error');
    };

    room.on(RoomEvent.ParticipantConnected, onConnected);
    room.on(RoomEvent.ParticipantDisconnected, onDisconnected);

    return () => {
      room.off(RoomEvent.ParticipantConnected, onConnected);
      room.off(RoomEvent.ParticipantDisconnected, onDisconnected);
    };
  }, [room, addToast]);

  // LOGIC CHAT COUNTER
  useEffect(() => {
    if (!isChatOpen && chatMessages.length > 0) {
      const lastMsg = chatMessages[chatMessages.length - 1];
      if (lastMsg && lastMsg.from?.identity !== myName) {
        setUnreadCount(prev => prev + 1);
      }
    } else {
      setUnreadCount(0);
    }
  }, [chatMessages, isChatOpen, myName]);

  const screenTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: true });
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false });
  const isScreenSharing = screenTracks.length > 0;

  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    if (!localParticipant) return;
    setIsMuted(!localParticipant.isMicrophoneEnabled);
    setIsCamOff(!localParticipant.isCameraEnabled);
    setIsSharing(localParticipant.isScreenShareEnabled);
  }, [localParticipant, localParticipant?.isMicrophoneEnabled, localParticipant?.isCameraEnabled, localParticipant?.isScreenShareEnabled]);

  const toggleMic = () => localParticipant.setMicrophoneEnabled(isMuted);
  const toggleCam = () => localParticipant.setCameraEnabled(isCamOff);
  const toggleScreen = () => localParticipant.setScreenShareEnabled(!isSharing);
  const leave = () => room.disconnect();

  const isSaver = bandwidthMode === 'saver';

  return (
    <div className="h-full w-full relative flex flex-col bg-gray-950 overflow-hidden font-sans">

      {/* --- TOP LEFT INFOS (Bandwidth & Timer) --- */}
      <div className="absolute top-4 left-4 z-50 flex items-center gap-3">
        <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl px-4 flex items-center gap-2 shadow-lg h-[46px]">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
          <span className="text-white text-sm font-mono font-bold tracking-widest">{durationStr}</span>
        </div>
        <BandwidthMonitor bandwidthMode={bandwidthMode} />
      </div>

      {/* --- TOAST NOTIFICATIONS (TOP CENTER) --- */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-2 rounded-xl backdrop-blur-md border shadow-xl flex items-center gap-2 animate-bounce-short text-sm font-medium
              ${toast.type === 'success' ? 'bg-green-500/20 border-green-500/30 text-green-200' : toast.type === 'info' ? 'bg-blue-500/20 border-blue-500/30 text-blue-200' : 'bg-red-500/20 border-red-500/30 text-red-200'}
            `}
          >
            <span className={`w-2 h-2 rounded-full ${toast.type === 'success' ? 'bg-green-800' : toast.type === 'info' ? 'bg-blue-800' : 'bg-red-800'}`}></span>
            {toast.msg}
          </div>
        ))}
      </div>

      {/* --- AREA ATAS: VIDEO & CHAT (Flex Grow) --- */}
      <div className="flex-grow flex overflow-hidden relative">

        {/* KOLOM VIDEO */}
        <div className="flex-grow flex flex-col p-4 gap-4 h-full relative transition-all duration-500">

          {isScreenSharing ? (
            <div className="flex-grow flex gap-4 h-full">
              <div className="flex-grow rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl relative">
                {screenTracks.map((track) => (
                  <ParticipantTile key={track.publication.trackSid} trackRef={track} />
                ))}
              </div>
              <div className="w-56 flex-shrink-0 flex flex-col gap-2 overflow-y-auto custom-scrollbar hidden md:flex">
                <GridLayout tracks={cameraTracks}><ParticipantTile /></GridLayout>
              </div>
            </div>
          ) : remoteParticipants.length === 1 ? (
             // --- 1vs1 CUSTOM LAYOUT ---
             <OneOnOneLayout 
                localTrack={cameraTracks.find(t => t.participant.identity === localParticipant?.identity)} 
                remoteTrack={cameraTracks.find(t => t.participant.identity === remoteParticipants[0]?.identity)} 
                mode={oneOnOneMode} 
                onSwap={() => setOneOnOneMode(m => m === 'remote-main' ? 'local-main' : 'remote-main')}
             />
          ) : (
            // --- GRID LAYOUT ---
            <div className="w-full h-full">
              <GridLayout tracks={cameraTracks}><ParticipantTile /></GridLayout>
            </div>
          )}
        </div>

        {/* --- CUSTOM CHAT SIDEBAR --- */}
        <div className={`${isChatOpen ? 'w-full md:w-96 translate-x-0' : 'w-0 translate-x-full'} bg-gray-900/95 backdrop-blur-xl border-l border-white/10 transition-all duration-300 ease-in-out absolute right-0 top-0 bottom-0 z-40 md:relative md:translate-x-0 overflow-hidden flex flex-col shadow-2xl`}>
          <div className="p-4 border-b border-white/10 flex justify-between items-center bg-gray-900/50">
            <h3 className="font-bold text-white flex items-center gap-2">
              <span className="text-indigo-400">💬</span> Chat Room
            </h3>
            <button onClick={() => { setIsChatOpen(false); setUnreadCount(0); }} className="md:hidden text-gray-400 hover:text-white transition-colors bg-white/5 p-2 rounded-lg">✕ Tutup</button>
          </div>

          <div className="flex-grow p-4 overflow-y-auto custom-scrollbar flex flex-col gap-3">
            {chatMessages.length === 0 && (
              <div className="text-gray-500 text-center text-sm mt-10 opacity-60 italic">Belum ada pesan. Sapa temanmu! 👋</div>
            )}

            {chatMessages.map((msg) => {
              const isMe = msg.from?.identity === myName;
              return (
                <div key={msg.timestamp} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className={`text-xs font-bold ${isMe ? 'text-indigo-400' : 'text-green-400'}`}>
                      {isMe ? 'Anda' : (msg.from?.identity || 'Teman')}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className={`px-4 py-2 rounded-2xl text-sm max-w-[85%] break-words shadow-md border border-white/5 ${isMe ? 'bg-indigo-600/80 text-white rounded-tr-sm' : 'bg-gray-800/80 text-white rounded-tl-sm'}`}>
                    {msg.message}
                  </div>
                </div>
              );
            })}
          </div>

          <form
            className="p-4 border-t border-white/10 bg-gray-900/50"
            onSubmit={(e) => {
              e.preventDefault();
              const input = e.target.elements.chatInput;
              if (input.value.trim()) {
                send(input.value);
                input.value = '';
              }
            }}
          >
            <div className="relative">
              <input
                name="chatInput"
                className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder-gray-500"
                placeholder="Ketik pesan..."
                autoComplete="off"
              />
              <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </div>
          </form>
        </div>

      </div>

      {/* --- AREA BAWAH: CONTROL BAR --- */}
      <div className="flex-shrink-0 flex justify-center py-6 bg-gray-950 z-50 border-t border-white/5 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-3 sm:gap-4 bg-gray-900/80 backdrop-blur-2xl px-6 sm:px-8 py-3 sm:py-4 rounded-3xl border border-white/10 shadow-2xl transition-transform hover:scale-[1.01]">
          <button onClick={toggleMic} className={`p-3 sm:p-4 rounded-2xl transition-all duration-300 ${isMuted ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-gray-800/80 text-white hover:bg-gray-700'}`}>
            <div dangerouslySetInnerHTML={{ __html: isMuted ? ICONS.micOff : ICONS.mic }} />
          </button>
          <button onClick={toggleCam} className={`p-3 sm:p-4 rounded-2xl transition-all duration-300 ${isCamOff ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-gray-800/80 text-white hover:bg-gray-700'}`}>
            <div dangerouslySetInnerHTML={{ __html: isCamOff ? ICONS.camOff : ICONS.cam }} />
          </button>
          <button onClick={toggleScreen} className={`hidden md:block p-3 sm:p-4 rounded-2xl transition-all duration-300 ${isSharing ? 'bg-green-500 text-white' : 'bg-gray-800/80 text-white hover:bg-gray-700'}`}>
            <div dangerouslySetInnerHTML={{ __html: ICONS.screen }} />
          </button>

          {/* --- ONLY FOR 1v1: TOGGLE GRID/PIP --- */}
          {remoteParticipants.length === 1 && !isScreenSharing && (
            <button 
              onClick={() => setOneOnOneMode(m => m === 'grid' ? 'remote-main' : 'grid')}
              title={oneOnOneMode === 'grid' ? "Kembali ke mode PiP" : "Ubah ke mode Grid (Terbelah)"}
              className={`p-3 sm:p-4 rounded-2xl transition-all duration-300 ${oneOnOneMode === 'grid' ? 'bg-indigo-600 shadow-[0_0_20px_rgba(79,70,229,0.4)]' : 'bg-gray-800/80 hover:bg-gray-700'} text-white`}
            >
              <div dangerouslySetInnerHTML={{ __html: ICONS.layout }} />
            </button>
          )}

          {/* --- BROWSER PIP --- */}
          <button 
            onClick={handleToggleBrowserPiP}
            title="Buka Popup Window"
            className="p-3 sm:p-4 rounded-2xl transition-all duration-300 bg-gray-800/80 text-white hover:bg-gray-700"
          >
            <div dangerouslySetInnerHTML={{ __html: ICONS.pip }} />
          </button>

          {/* --- DATA SAVER TOGGLE --- */}
          <button
            onClick={toggleDataSaver}
            title={bandwidthMode === 'saver' ? 'Hemat -> HD' : bandwidthMode === 'hd' ? 'HD -> FHD' : 'FHD -> Hemat'}
            className={`relative p-3 sm:p-4 rounded-2xl transition-all duration-300 group
              ${bandwidthMode === 'saver'
                ? 'bg-emerald-600/80 text-white hover:bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                : bandwidthMode === 'hd'
                ? 'bg-blue-600/80 text-white hover:bg-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)]'
                : 'bg-purple-600/80 text-white hover:bg-purple-500 shadow-[0_0_20px_rgba(147,51,234,0.3)]'
              }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {bandwidthMode === 'saver' ? (
                <>
                  <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                  <path d="M8 12l3 3 5-6"/>
                </>
              ) : bandwidthMode === 'hd' ? (
                <>
                  <rect x="5" y="2" width="14" height="20" rx="2"/>
                  <path d="M12 18h.01"/>
                </>
              ) : (
                <>
                  <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
                  <line x1="7" y1="2" x2="7" y2="22"/>
                  <line x1="17" y1="2" x2="17" y2="22"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <line x1="2" y1="7" x2="7" y2="7"/>
                  <line x1="2" y1="17" x2="7" y2="17"/>
                  <line x1="17" y1="17" x2="22" y2="17"/>
                  <line x1="17" y1="7" x2="22" y2="7"/>
                </>
              )}
            </svg>
            <span className={`absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none
              ${bandwidthMode === 'saver' ? 'bg-emerald-600 text-white' : bandwidthMode === 'hd' ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white'}`}>
              {bandwidthMode === 'saver' ? '🌿 Hemat' : bandwidthMode === 'hd' ? '🎬 HD' : '🎥 FHD'}
            </span>
          </button>

          <button
            onClick={() => { setIsChatOpen(!isChatOpen); if (!isChatOpen) setUnreadCount(0); }}
            className={`relative p-3 sm:p-4 rounded-2xl transition-all duration-300 ${isChatOpen ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.4)]' : 'bg-gray-800/80 text-white hover:bg-gray-700'}`}
          >
            <div dangerouslySetInnerHTML={{ __html: ICONS.chat }} />
            {unreadCount > 0 && !isChatOpen && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-gray-900 animate-bounce">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <div className="w-px h-8 bg-white/20 mx-1"></div>
          <button onClick={leave} className="p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-red-600 to-red-500 text-white shadow-lg hover:scale-105 active:scale-95 transition-all">
            <div className="rotate-[135deg]" dangerouslySetInnerHTML={{ __html: ICONS.hangup }} />
          </button>
        </div>
      </div>
    </div>
  );
}

// --- 1v1 CUSTOM LAYOUT COMPONENT ---
function OneOnOneLayout({ localTrack, remoteTrack, mode, onSwap }) {
  if (mode === 'grid') {
    return (
      <div className="flex flex-col md:flex-row w-full h-full gap-4">
         <div className="flex-1 rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl relative">
            {localTrack && <ParticipantTile trackRef={localTrack} />}
         </div>
         <div className="flex-1 rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl relative">
            {remoteTrack && <ParticipantTile trackRef={remoteTrack} />}
         </div>
      </div>
    );
  }

  const mainTrack = mode === 'remote-main' ? remoteTrack : localTrack;
  const miniTrack = mode === 'remote-main' ? localTrack : remoteTrack;

  return (
    <div className="w-full h-full relative rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl">
      {mainTrack && <ParticipantTile trackRef={mainTrack} className="w-full h-full" />}
      
      {/* Mini PiP */}
      {miniTrack && (
        <div 
          onClick={onSwap}
          className="absolute top-4 right-4 w-32 md:w-64 aspect-video bg-black rounded-xl overflow-hidden border border-white/20 shadow-[0_0_30px_rgba(0,0,0,0.9)] cursor-pointer hover:scale-105 hover:border-white/50 transition-all z-10 duration-300"
          title="Klik untuk menukar layar"
        >
           <ParticipantTile trackRef={miniTrack} className="w-full h-full" />
        </div>
      )}
    </div>
  );
}