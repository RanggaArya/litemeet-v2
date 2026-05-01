'use client';

import { useEffect, useRef, useState } from 'react';
import Pusher from 'pusher-js';

export default function Home() {
  // --- STATE ---
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');
  const [myId, setMyId] = useState('');
  const [joined, setJoined] = useState(false);

  // State Media Lokal
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMobile, setIsMobile] = useState(false); // Deteksi HP

  const [statusMessage, setStatusMessage] = useState('');

  // --- REFS ---
  const localVideoRef = useRef(null);
  const peersRef = useRef({});
  const pusherRef = useRef(null);
  const localStreamRef = useRef(null);
  const userMapRef = useRef({}); // Mapping ID -> Nama
  const userStatusRef = useRef({}); // Mapping ID -> Status Mic/Cam Teman (BARU)
  const screenTrackRef = useRef(null);

  // --- CONFIG ---
  let rtcConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" }
    ]
  };

  // Kunci Hemat Kuota & Anti Stuck di HP
  // Kita turunkan sedikit frameRate biar HP gak ngos-ngosan encode 3 stream sekaligus
  const mediaConstraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true
    },
    video: {
      width: { ideal: 320, max: 480 }, // Jangan HD
      height: { ideal: 240, max: 360 },
      frameRate: { ideal: 15, max: 20 } // 15 FPS cukup buat rapat
    }
  };

  // Cek Mobile saat load
  useEffect(() => {
    // Cek sederhana apakah ini browser HP
    const isMobileBrowser = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setIsMobile(isMobileBrowser);
  }, []);

  // --- JOIN ROOM ---
  const joinRoom = async () => {
    if (!roomId || !username) {
      alert("Mohon isi Nama Ruangan dan Nama Anda!");
      return;
    }

    setStatusMessage('Menyiapkan server...');
    const randomId = Math.random().toString(36).substring(7);
    setMyId(randomId);
    setJoined(true);

    // Coba Twilio (Biar tembus firewall beda jaringan)
    try {
      const response = await fetch('/api/get-turn');
      if (response.ok) {
        const data = await response.json();
        if (data.iceServers) {
          rtcConfig = {
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              ...data.iceServers
            ]
          };
        }
      }
    } catch (err) { }

    setStatusMessage('Menyalakan kamera...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      setStatusMessage('Masuk ruangan...');
      connectPusher(randomId, roomId, stream, username);
      setStatusMessage('');
    } catch (err) {
      alert("Gagal akses kamera: " + err);
      setJoined(false);
    }
  };

  // --- PUSHER ---
  const connectPusher = (userId, room, stream, myName) => {
    if (!process.env.NEXT_PUBLIC_PUSHER_KEY) {
      alert("Environment Variable Pusher belum dipasang!");
      return;
    }

    pusherRef.current = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
      authEndpoint: "/api/pusher-auth",
    });

    const channel = pusherRef.current.subscribe(`private-room-${room}`);

    channel.bind('pusher:subscription_succeeded', () => {
      // Kirim sinyal masuk + status awal mic/cam kita
      channel.trigger('client-signal', {
        type: 'new-user',
        senderId: userId,
        username: myName,
        status: { muted: isMuted, camOff: isCameraOff } // Kirim status awal
      });
    });

    channel.bind('client-signal', async (data) => {
      if (data.senderId === userId) return;

      // 1. Ada User Baru Masuk
      if (data.type === 'new-user') {
        userMapRef.current[data.senderId] = data.username || "Teman";
        // Simpan status dia
        if (data.status) userStatusRef.current[data.senderId] = data.status;

        createPeer(data.senderId, userId, true, stream, channel);

        // Kenalan balik
        channel.trigger('client-signal', {
          type: 'identify-user',
          senderId: userId,
          targetId: data.senderId,
          username: myName,
          status: { muted: isMuted, camOff: isCameraOff }
        });
      }

      // 2. User Lama Mengenalkan Diri
      if (data.type === 'identify-user' && data.targetId === userId) {
        userMapRef.current[data.senderId] = data.username || "Teman";
        if (data.status) userStatusRef.current[data.senderId] = data.status;

        updateLabel(data.senderId, data.username);
        updateRemoteStatusUI(data.senderId, data.status); // Update UI ikon
      }

      // 3. User Lain Mematikan Mic/Cam (FITUR BARU)
      if (data.type === 'media-toggle') {
        // Update ref status
        const currentStatus = userStatusRef.current[data.senderId] || {};
        if (data.kind === 'audio') currentStatus.muted = data.enabled; // enabled = isMuted
        if (data.kind === 'video') currentStatus.camOff = data.enabled;
        userStatusRef.current[data.senderId] = currentStatus;

        // Update UI visual di video dia
        updateRemoteStatusUI(data.senderId, currentStatus);
      }

      // 4. Sinyal WebRTC (Offer/Answer/Ice)
      if (data.type === 'signal') {
        const peer = peersRef.current[data.senderId];
        if (!peer) {
          createPeer(data.senderId, userId, false, stream, channel, data.payload);
        } else {
          handleSignalSignal(peer, data.payload);
        }
      }
    });
  };

  // --- WEBRTC CORE ---
  const createPeer = async (targetId, myId, initiator, stream, channel, incomingSignal = null) => {
    const peer = new RTCPeerConnection(rtcConfig);
    peersRef.current[targetId] = peer;

    stream.getTracks().forEach(track => peer.addTrack(track, stream));

    peer.ontrack = (event) => {
      const existingVideo = document.getElementById(`video-${targetId}`);
      if (existingVideo) return;

      const videoGrid = document.getElementById('video-grid');
      const div = document.createElement('div');
      div.id = `wrapper-${targetId}`;
      // Tambahkan min-h agar tidak gepeng di HP
      div.className = "relative group fade-in w-full h-full min-h-[200px] bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 flex items-center justify-center";

      const vid = document.createElement('video');
      vid.id = `video-${targetId}`;
      vid.autoplay = true;
      vid.playsInline = true; // WAJIB BUAT HP BIAR GAK STUCK
      vid.srcObject = event.streams[0];
      vid.className = "w-full h-full object-cover bg-gray-900";

      const friendName = userMapRef.current[targetId] || "Teman";

      // Container Label
      const labelContainer = document.createElement('div');
      labelContainer.className = "absolute bottom-4 left-4 flex items-center gap-2";

      // Nama User
      const nameLabel = document.createElement('div');
      nameLabel.id = `label-${targetId}`;
      nameLabel.innerText = friendName;
      nameLabel.className = "bg-black/60 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-sm font-medium border border-white/10";

      // Ikon Status Mic Mati (Awalnya hidden)
      const muteIcon = document.createElement('div');
      muteIcon.id = `status-mic-${targetId}`;
      muteIcon.innerText = "🔇";
      muteIcon.className = "bg-red-500/80 p-1.5 rounded-lg text-xs hidden";

      labelContainer.appendChild(nameLabel);
      labelContainer.appendChild(muteIcon);

      div.appendChild(vid);
      div.appendChild(labelContainer);
      videoGrid.appendChild(div);

      // Cek status awal (siapa tau dia join udah dalam keadaan mute)
      const initialStatus = userStatusRef.current[targetId];
      if (initialStatus) updateRemoteStatusUI(targetId, initialStatus);
    };

    peer.onicecandidate = (e) => {
      if (e.candidate) {
        channel.trigger('client-signal', {
          type: 'signal', senderId: myId, targetId: targetId,
          payload: { candidate: e.candidate }
        });
      }
    };

    // Connection State Monitoring (Buat Debugging di Console HP)
    peer.onconnectionstatechange = () => {
      console.log(`Connection to ${targetId}: ${peer.connectionState}`);
      if (peer.connectionState === 'failed') {
        // Kalau gagal, info user (bisa restart manual dgn refresh)
        const wrapper = document.getElementById(`wrapper-${targetId}`);
        if (wrapper) wrapper.style.border = "2px solid red";
      }
    };

    if (initiator) {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      channel.trigger('client-signal', { type: 'signal', senderId: myId, payload: { sdp: offer } });
    } else if (incomingSignal && incomingSignal.sdp) {
      await peer.setRemoteDescription(new RTCSessionDescription(incomingSignal.sdp));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      channel.trigger('client-signal', { type: 'signal', senderId: myId, payload: { sdp: answer } });
    } else if (incomingSignal && incomingSignal.candidate) {
      try { await peer.addIceCandidate(new RTCIceCandidate(incomingSignal.candidate)); } catch (e) { }
    }
  };

  const handleSignalSignal = async (peer, payload) => {
    if (payload.sdp) await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    else if (payload.candidate) try { await peer.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch (e) { }
  }

  // --- HELPER UI UPDATES ---
  const updateLabel = (id, name) => {
    const label = document.getElementById(`label-${id}`);
    if (label) label.innerText = name;
  }

  // Fungsi Baru: Update Ikon Mic/Cam Teman
  const updateRemoteStatusUI = (id, status) => {
    // 1. Handle Mic Icon
    const muteIcon = document.getElementById(`status-mic-${id}`);
    if (muteIcon) {
      if (status.muted) muteIcon.classList.remove('hidden');
      else muteIcon.classList.add('hidden');
    }

    // 2. Handle Video Gelap (Opsional: Kalau cam mati, video digelapin)
    const videoEl = document.getElementById(`video-${id}`);
    if (videoEl) {
      if (status.camOff) videoEl.style.opacity = "0.2"; // Redupkan video
      else videoEl.style.opacity = "1";
    }
  }

  // --- CONTROLS UTAMA ---
  const sendMediaSignal = (kind, isEnabled) => {
    // Kirim sinyal ke semua orang bahwa kita mengubah status mic/cam
    if (pusherRef.current) {
      // Cari channel private yang aktif
      // (Cara cepat: kita simpan channelName di ref atau cari di pusher object, 
      // tapi karena cuma 1 room, kita blast aja ke socket id teman via channel trigger)
      const channel = pusherRef.current.channels.find(c => c.name.startsWith('private-'));
      if (channel) {
        channel.trigger('client-signal', {
          type: 'media-toggle',
          senderId: myId,
          kind: kind,     // 'audio' atau 'video'
          enabled: isEnabled // true = mati (muted/off)
        });
      }
    }
  }

  const toggleMic = () => {
    if (!localStreamRef.current) return;
    const enabled = !isMuted; // Status BARU (kebalikan dari skrg)
    localStreamRef.current.getAudioTracks()[0].enabled = !enabled;
    setIsMuted(enabled);

    sendMediaSignal('audio', enabled); // Kirim ke teman
  };

  const toggleCam = () => {
    if (!localStreamRef.current) return;
    const enabled = !isCameraOff; // Status BARU

    // Logic khusus share screen
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) videoTrack.enabled = !enabled;

    setIsCameraOff(enabled);
    sendMediaSignal('video', enabled); // Kirim ke teman
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      stopScreenShare();
      return;
    }
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" },
        audio: false
      });
      const screenTrack = screenStream.getVideoTracks()[0];
      screenTrackRef.current = screenTrack;

      if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;

      Object.values(peersRef.current).forEach((peer) => {
        const sender = peer.getSenders().find(s => s.track.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
      });

      setIsScreenSharing(true);
      setIsCameraOff(false);
      sendMediaSignal('video', false); // Bilang ke teman video kita NYALA (karena share screen)

      screenTrack.onended = () => stopScreenShare();
    } catch (err) {
      console.error("Gagal share screen:", err);
    }
  };

  const stopScreenShare = async () => {
    if (screenTrackRef.current) screenTrackRef.current.stop();

    try {
      const camStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      const camTrack = camStream.getVideoTracks()[0];

      if (localVideoRef.current) localVideoRef.current.srcObject = camStream;

      Object.values(peersRef.current).forEach((peer) => {
        const sender = peer.getSenders().find(s => s.track.kind === 'video');
        if (sender) sender.replaceTrack(camTrack);
      });

      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      localStreamRef.current = new MediaStream([audioTrack, camTrack]);

      setIsScreenSharing(false);
    } catch (err) {
      console.error("Gagal balik ke kamera:", err);
    }
  };

  // --- UI RENDER ---
  if (!joined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white p-4 font-sans">
        <div className="w-full max-w-md bg-gray-900 p-8 rounded-3xl shadow-2xl border border-gray-800">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-extrabold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent mb-2">LiteMeet</h1>
            <p className="text-gray-400 text-sm">Presentasi Lancar, Kuota Aman</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase ml-1 mb-1 block">Nama Ruangan</label>
              <input
                className="w-full p-4 rounded-xl bg-gray-800 text-white border border-gray-700 focus:border-blue-500 outline-none transition-all placeholder-gray-600"
                placeholder="Contoh: SkripsiRangga"
                onChange={(e) => setRoomId(e.target.value)}
                value={roomId}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase ml-1 mb-1 block">Nama Kamu</label>
              <input
                className="w-full p-4 rounded-xl bg-gray-800 text-white border border-gray-700 focus:border-indigo-500 outline-none transition-all placeholder-gray-600"
                placeholder="Contoh: Rangga"
                onChange={(e) => setUsername(e.target.value)}
                value={username}
              />
            </div>

            <button onClick={joinRoom} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-blue-900/40 transition-all mt-4">
              Mulai Rapat 🚀
            </button>

            {statusMessage && (
              <div className="flex items-center justify-center gap-2 text-yellow-400 text-sm bg-yellow-400/10 p-2 rounded-lg animate-pulse mt-2">
                <span>⏳</span> {statusMessage}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <main className="h-[100dvh] bg-gray-950 text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex justify-between items-center px-4 py-3 bg-gray-900 border-b border-gray-800 z-10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"></div>
          <h1 className="font-bold text-lg text-gray-100 tracking-tight">LiteMeet</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 font-mono bg-gray-800 px-2 py-1 rounded border border-gray-700">{roomId}</span>
        </div>
      </header>

      {/* Grid Area */}
      <div id="video-grid" className="flex-grow grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 content-center justify-items-center overflow-y-auto">
        {/* Video Saya */}
        <div className="relative group w-full h-full min-h-[200px] bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 flex items-center justify-center">
          <video
            ref={localVideoRef}
            autoPlay playsInline muted
            className={`w-full h-full object-cover bg-gray-900 ${isScreenSharing ? '' : 'transform -scale-x-100'} ${isCameraOff ? 'opacity-20' : 'opacity-100'}`}
          ></video>

          <div className="absolute bottom-4 left-4 flex items-center gap-2">
            <div className="bg-black/60 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-sm font-medium border border-white/10">
              {username} (Anda)
            </div>
            {isMuted && <div className="bg-red-500/80 p-1.5 rounded-lg text-xs">🔇</div>}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="shrink-0 flex justify-center items-center gap-4 pb-6 pt-4 bg-gray-950">
        {/* Mic */}
        <button onClick={toggleMic} className={`p-4 rounded-2xl transition-all shadow-lg ${isMuted ? 'bg-red-500 text-white' : 'bg-gray-800 text-white hover:bg-gray-700'}`}>
          {isMuted ? '🔇' : '🎤'}
        </button>

        {/* Camera */}
        <button onClick={toggleCam} disabled={isScreenSharing} className={`p-4 rounded-2xl transition-all shadow-lg ${isCameraOff ? 'bg-red-500 text-white' : 'bg-gray-800 text-white hover:bg-gray-700'} ${isScreenSharing ? 'opacity-50 cursor-not-allowed' : ''}`}>
          {isCameraOff ? '🚫' : '📷'}
        </button>

        {/* Share Screen (Hanya muncul jika BUKAN HP) */}
        {!isMobile && (
          <button onClick={toggleScreenShare} className={`p-4 rounded-2xl transition-all shadow-lg ${isScreenSharing ? 'bg-green-500 text-white' : 'bg-gray-800 text-white hover:bg-gray-700'}`}>
            {isScreenSharing ?
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15l-3-3m0 0l3-3m-3 3h12" /></svg>
              :
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            }
          </button>
        )}

        {/* End Call */}
        <button onClick={() => window.location.reload()} className="p-4 rounded-2xl bg-red-600 text-white shadow-xl shadow-red-600/30 hover:bg-red-700">
          📞
        </button>
      </div>
    </main>
  );
}