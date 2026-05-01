'use client';

import { useEffect, useRef, useState } from 'react';
import Pusher from 'pusher-js';

export default function Home() {
  // --- STATE ---
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');
  const [myId, setMyId] = useState('');
  const [joined, setJoined] = useState(false);

  // Status Media
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [statusMessage, setStatusMessage] = useState('');

  // --- REFS ---
  const localVideoRef = useRef(null);
  const peersRef = useRef({});
  const pusherRef = useRef(null);
  const localStreamRef = useRef(null);
  const userMapRef = useRef({});
  const userStatusRef = useRef({});
  const screenTrackRef = useRef(null);

  // REF BARU: Mencegah Double Connect di Next.js 16
  const isPusherConnected = useRef(false);

  // --- CONFIG ---
  let rtcConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" }
    ]
  };

  const mediaConstraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    // Resolusi Rendah Wajib buat HP
    video: {
      width: { ideal: 240, max: 320 },
      height: { ideal: 180, max: 240 },
      frameRate: { ideal: 15, max: 15 }
    }
  };

  useEffect(() => {
    const isMob = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setIsMobile(isMob);

    // CLEANUP: Matikan koneksi saat keluar halaman/refresh
    return () => {
      if (pusherRef.current) {
        pusherRef.current.disconnect();
        isPusherConnected.current = false;
      }
      // Matikan kamera
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  }, []);

  // --- JOIN ROOM ---
  const joinRoom = async () => {
    if (!roomId || !username) {
      alert("Mohon isi Nama Ruangan dan Nama Anda!");
      return;
    }

    // Cegah double join
    if (joined) return;

    setStatusMessage('Menyiapkan server...');
    const randomId = Math.random().toString(36).substring(7);
    setMyId(randomId);
    setJoined(true);

    // Coba Twilio
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
    // FIX: Cegah koneksi ganda (React Strict Mode)
    if (isPusherConnected.current) return;
    if (!process.env.NEXT_PUBLIC_PUSHER_KEY) return;

    pusherRef.current = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
      authEndpoint: "/api/pusher-auth",
    });

    const channel = pusherRef.current.subscribe(`private-room-${room}`);
    isPusherConnected.current = true; // Tandai sudah konek

    channel.bind('pusher:subscription_succeeded', () => {
      channel.trigger('client-signal', {
        type: 'new-user',
        senderId: userId,
        username: myName,
        status: { muted: isMuted, camOff: isCameraOff }
      });
    });

    channel.bind('client-signal', async (data) => {
      if (data.senderId === userId) return;

      if (data.type === 'new-user') {
        const newName = data.username || "Teman";
        userMapRef.current[data.senderId] = newName;
        if (data.status) userStatusRef.current[data.senderId] = data.status;

        showToast(`${newName} bergabung!`);
        createPeer(data.senderId, userId, true, stream, channel);

        channel.trigger('client-signal', {
          type: 'identify-user',
          senderId: userId,
          targetId: data.senderId,
          username: myName,
          status: { muted: isMuted, camOff: isCameraOff }
        });
      }

      if (data.type === 'identify-user' && data.targetId === userId) {
        userMapRef.current[data.senderId] = data.username || "Teman";
        if (data.status) userStatusRef.current[data.senderId] = data.status;

        updateLabel(data.senderId, data.username);
        updateRemoteStatusUI(data.senderId, data.status);
      }

      if (data.type === 'media-toggle') {
        const currentStatus = userStatusRef.current[data.senderId] || {};
        if (data.kind === 'audio') currentStatus.muted = data.enabled;
        if (data.kind === 'video') currentStatus.camOff = data.enabled;
        userStatusRef.current[data.senderId] = currentStatus;

        updateRemoteStatusUI(data.senderId, currentStatus);
      }

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
    // FIX: Cek apakah peer sudah ada/stabil sebelum timpa
    if (peersRef.current[targetId] && peersRef.current[targetId].signalingState !== 'closed') {
      console.warn("Peer connection already active for", targetId);
      // Jangan return dulu, kadang perlu renegotiation, tapi untuk simple mesh kita biarkan
    }

    const peer = new RTCPeerConnection(rtcConfig);
    peersRef.current[targetId] = peer;

    stream.getTracks().forEach(track => peer.addTrack(track, stream));

    peer.ontrack = (event) => {
      const existingVideo = document.getElementById(`video-${targetId}`);
      if (existingVideo) return;

      const videoGrid = document.getElementById('video-grid');
      const div = document.createElement('div');
      div.id = `wrapper-${targetId}`;
      div.className = "relative group fade-in w-full h-full min-h-[150px] bg-black rounded-xl overflow-hidden shadow-md ring-1 ring-white/10 flex items-center justify-center";

      const vid = document.createElement('video');
      vid.id = `video-${targetId}`;
      vid.autoplay = true;
      vid.playsInline = true;
      vid.srcObject = event.streams[0];
      vid.className = "w-full h-full object-cover bg-gray-900";

      const friendName = userMapRef.current[targetId] || "Teman";

      const labelContainer = document.createElement('div');
      labelContainer.className = "absolute bottom-2 left-2 flex items-center gap-1.5 z-10";

      const nameLabel = document.createElement('div');
      nameLabel.id = `label-${targetId}`;
      nameLabel.innerText = friendName;
      nameLabel.className = "bg-black/50 backdrop-blur-sm text-white px-2 py-1 rounded text-xs font-medium";

      const muteIcon = document.createElement('div');
      muteIcon.id = `status-mic-${targetId}`;
      muteIcon.innerText = "🔇";
      muteIcon.className = "bg-red-500/80 p-1 rounded text-xs hidden";

      labelContainer.appendChild(nameLabel);
      labelContainer.appendChild(muteIcon);
      div.appendChild(vid);
      div.appendChild(labelContainer);
      videoGrid.appendChild(div);

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

    // FIX: Error Handling agar tidak crash
    try {
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
        await peer.addIceCandidate(new RTCIceCandidate(incomingSignal.candidate));
      }
    } catch (e) {
      console.error("WebRTC Error:", e);
    }
  };

  // --- FIX UTAMA DISINI ---
  const handleSignalSignal = async (peer, payload) => {
    try {
      if (payload.sdp) {
        // SATPAM: Jika kita terima ANSWER, tapi status kita sudah STABLE (selesai),
        // berarti ini sinyal duplikat. ABAIKAN SAJA.
        if (payload.sdp.type === 'answer' && peer.signalingState === 'stable') {
          console.log("⚠️ Mengabaikan duplicate answer (sudah stable)");
          return;
        }
        await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      } else if (payload.candidate) {
        // SATPAM 2: Kadang candidate datang sebelum remote description diset.
        // Kalau remoteDescription masih null, kita antrikan atau ignore (disini try-catch handle)
        if (peer.remoteDescription) {
          await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      }
    } catch (e) {
      console.warn("Signal Error (Ignored):", e); // Warn saja jangan crash
    }
  }

  // --- HELPER & CONTROLS (SAMA SEPERTI SEBELUMNYA) ---
  const updateLabel = (id, name) => {
    const label = document.getElementById(`label-${id}`);
    if (label) label.innerText = name;
  }

  const updateRemoteStatusUI = (id, status) => {
    const muteIcon = document.getElementById(`status-mic-${id}`);
    if (muteIcon) {
      if (status.muted) muteIcon.classList.remove('hidden');
      else muteIcon.classList.add('hidden');
    }
    const videoEl = document.getElementById(`video-${id}`);
    if (videoEl) {
      if (status.camOff) videoEl.style.opacity = "0.3";
      else videoEl.style.opacity = "1";
    }
  }

  const showToast = (msg) => {
    const toast = document.createElement('div');
    toast.innerText = msg;
    toast.className = "fixed top-20 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-full text-sm shadow-lg animate-bounce z-50";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  const sendMediaSignal = (kind, isEnabled) => {
    if (pusherRef.current) {
      const channel = pusherRef.current.channels.find(c => c.name.startsWith('private-'));
      if (channel) {
        channel.trigger('client-signal', {
          type: 'media-toggle',
          senderId: myId,
          kind: kind,
          enabled: isEnabled
        });
      }
    }
  }

  const toggleMic = () => {
    if (!localStreamRef.current) return;
    const newState = !isMuted;
    localStreamRef.current.getAudioTracks()[0].enabled = !newState;
    setIsMuted(newState);
    sendMediaSignal('audio', newState);
  };

  const toggleCam = () => {
    if (!localStreamRef.current) return;
    const newState = !isCameraOff;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) videoTrack.enabled = !newState;
    setIsCameraOff(newState);
    sendMediaSignal('video', newState);
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      stopScreenShare(); return;
    }
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: false });
      const screenTrack = screenStream.getVideoTracks()[0];
      screenTrackRef.current = screenTrack;

      if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;

      Object.values(peersRef.current).forEach((peer) => {
        const sender = peer.getSenders().find(s => s.track.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
      });

      setIsScreenSharing(true);
      setIsCameraOff(false);
      sendMediaSignal('video', false);

      screenTrack.onended = () => stopScreenShare();
    } catch (err) { }
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
    } catch (err) { }
  };

  if (!joined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white p-4 font-sans">
        <div className="w-full max-w-md bg-gray-900 p-8 rounded-3xl shadow-2xl border border-gray-800">
          <h1 className="text-3xl font-bold text-center text-blue-500 mb-6">LiteMeet v3</h1>
          <div className="space-y-4">
            <input className="w-full p-4 rounded-xl bg-gray-800 border border-gray-700" placeholder="Nama Ruangan" onChange={(e) => setRoomId(e.target.value)} value={roomId} />
            <input className="w-full p-4 rounded-xl bg-gray-800 border border-gray-700" placeholder="Nama Kamu" onChange={(e) => setUsername(e.target.value)} value={username} />
            <button onClick={joinRoom} className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-xl font-bold transition">Mulai Rapat</button>
            {statusMessage && <p className="text-center text-yellow-400 text-sm animate-pulse">{statusMessage}</p>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <main className="h-[100dvh] bg-gray-950 text-white flex flex-col overflow-hidden">
      <header className="flex justify-between items-center px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
          <h1 className="font-bold text-gray-100">LiteMeet</h1>
        </div>
        <code className="text-xs bg-gray-800 px-2 py-1 rounded text-blue-300">{roomId}</code>
      </header>

      <div id="video-grid" className="flex-grow grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 content-center justify-items-center overflow-y-auto">
        <div className="relative group w-full h-full min-h-[150px] bg-black rounded-xl overflow-hidden shadow-md ring-1 ring-white/10 flex items-center justify-center">
          <video
            ref={localVideoRef}
            autoPlay playsInline muted
            className={`w-full h-full object-cover bg-gray-900 ${isScreenSharing ? '' : 'transform -scale-x-100'} ${isCameraOff ? 'opacity-30' : 'opacity-100'}`}
          ></video>

          <div className="absolute bottom-2 left-2 flex items-center gap-1.5 z-10">
            <div className="bg-black/50 backdrop-blur-sm text-white px-2 py-1 rounded text-xs font-medium border border-white/5">
              {username} (Anda)
            </div>
            {isMuted && <div className="bg-red-500/80 p-1 rounded text-xs">🔇</div>}
          </div>
        </div>
      </div>

      <div className="shrink-0 flex justify-center items-center gap-4 pb-6 pt-3 bg-gray-950">
        <button onClick={toggleMic} className={`p-4 rounded-full transition shadow-lg ${isMuted ? 'bg-red-500' : 'bg-gray-800 hover:bg-gray-700'}`}>
          {isMuted ? '🔇' : '🎤'}
        </button>
        <button onClick={toggleCam} disabled={isScreenSharing} className={`p-4 rounded-full transition shadow-lg ${isCameraOff ? 'bg-red-500' : 'bg-gray-800 hover:bg-gray-700'} ${isScreenSharing ? 'opacity-50' : ''}`}>
          {isCameraOff ? '🚫' : '📷'}
        </button>
        {!isMobile && (
          <button onClick={toggleScreenShare} className={`p-4 rounded-full transition shadow-lg ${isScreenSharing ? 'bg-green-500' : 'bg-gray-800 hover:bg-gray-700'}`}>
            🖥️
          </button>
        )}
        <button onClick={() => window.location.reload()} className="p-4 rounded-full bg-red-600 hover:bg-red-700 shadow-lg">
          📞
        </button>
      </div>
    </main>
  );
}