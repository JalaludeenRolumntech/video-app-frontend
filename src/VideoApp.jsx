import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Button, TextField, IconButton } from "@mui/material";
import VideoCallIcon from "@mui/icons-material/VideoCall";
import MicOffIcon from "@mui/icons-material/MicOff";
import MicIcon from "@mui/icons-material/Mic";
import VideocamIcon from "@mui/icons-material/Videocam";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import ScreenShareIcon from "@mui/icons-material/ScreenShare";
import StopScreenShareIcon from "@mui/icons-material/StopScreenShare";
import ChatIcon from "@mui/icons-material/Chat";

const socket = io("https://video-app-backend-python.vercel.app/");

const VideoApp = () => {
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const [peers, setPeers] = useState({});
  const [roomId, setRoomId] = useState("");
  const [userId] = useState(() => `user_${Math.floor(Math.random() * 10000)}`);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [step, setStep] = useState("welcome");
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

  const configuration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

  const createRoom = async () => {
    const newRoomId = `room_${Math.floor(Math.random() * 10000)}`;
    setRoomId(newRoomId);
    setStep("meeting");
  
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideoRef.current.srcObject = stream;
      localStreamRef.current = stream;
      setIsCameraOn(true);
  
      const roomLink = `${window.location.origin}?room=${newRoomId}`;
      alert(`Room created! Share this link with others to join: ${roomLink}`);
      navigator.clipboard.writeText(roomLink);
  
      socket.emit("create-room", { room: newRoomId, user_id: userId });
      setupSocketListeners();
    } catch (error) {
      console.error("Error accessing media devices:", error);
      alert("Could not access camera/microphone.");
    }
  };
  
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (room) {
      setRoomId(room);
      alert(`You've been invited to join Room: ${room}. Click "Join Room" to proceed.`);
    }
  }, []);

  socket.on("room-error", (data) => {
    alert(data.error);
  });
  

  const joinRoom = async () => {
    if (!roomId.trim()) {
      alert("Please enter a valid Room ID.");
      return;
    }

    try {
      setStep("meeting");
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideoRef.current.srcObject = stream;
      localStreamRef.current = stream;
      setIsCameraOn(true);

      socket.emit("join-room", { room: roomId, user_id: userId });
      setupSocketListeners();
    } catch (error) {
      console.error("Error accessing media devices:", error);
      alert("Could not access camera/microphone.");
    }
  };

  const setupSocketListeners = () => {
    socket.on("user-joined", handleUserJoined);
    socket.on("user-left", handleUserLeft);
    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("ice-candidate", handleIceCandidate);
    socket.on("chat-message", (data) => {
      setMessages((prev) => [...prev, data]);
    });
  };

  const handleUserJoined = ({ user_id }) => {
    if (user_id !== userId && !peers[user_id]) {
      setPeers((prev) => ({ ...prev, [user_id]: {} }));
      createPeerConnection(user_id, true);
    }
  };

  const handleUserLeft = ({ user_id }) => {
    if (peers[user_id]) {
      peers[user_id].close();
      setPeers((prev) => {
        const updatedPeers = { ...prev };
        delete updatedPeers[user_id];
        return updatedPeers;
      });
      const videoElement = document.getElementById(`video-${user_id}`);
      if (videoElement) videoElement.remove();
    }
  };

  const handleOffer = async ({ offer, sender }) => {
    const peerConnection = createPeerConnection(sender, false);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit("answer", { answer, target: sender });
  };

  const handleAnswer = async ({ answer, sender }) => {
    await peers[sender]?.setRemoteDescription(new RTCSessionDescription(answer));
  };

  const handleIceCandidate = ({ candidate, sender }) => {
    peers[sender]?.addIceCandidate(new RTCIceCandidate(candidate));
  };

  const createPeerConnection = (targetUserId, isCaller) => {
    const peerConnection = new RTCPeerConnection(configuration);

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", { candidate: event.candidate, target: targetUserId });
      }
    };

    peerConnection.ontrack = (event) => {
      const remoteVideo = document.createElement("video");
      const remoteContainer = document.getElementById("remote-videos");

      remoteVideo.srcObject = event.streams[0];
      remoteVideo.autoplay = true;
      remoteVideo.playsInline = true;
      remoteVideo.id = `video-${targetUserId}`;

      const remoteWrapper = document.createElement("div");
      remoteWrapper.appendChild(remoteVideo);

      if (remoteContainer) {
        remoteContainer.appendChild(remoteWrapper);
      }
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStreamRef.current);
      });
    }

    if (isCaller) {
      peerConnection.createOffer().then((offer) => {
        peerConnection.setLocalDescription(offer);
        socket.emit("offer", { offer, target: targetUserId });
      });
    }

    setPeers((prev) => ({ ...prev, [targetUserId]: peerConnection }));
    return peerConnection;
  };

  const toggleCamera = () => {
    const videoTracks = localStreamRef.current?.getVideoTracks();
    if (videoTracks) {
      videoTracks[0].enabled = !videoTracks[0].enabled;
      setIsCameraOn(videoTracks[0].enabled);
    }
  };

  const toggleAudio = () => {
    const audioTracks = localStreamRef.current?.getAudioTracks();
    if (audioTracks) {
      audioTracks[0].enabled = !audioTracks[0].enabled;
      setIsAudioOn(audioTracks[0].enabled);
    }
  };

  const startScreenShare = async () => {
    if (isScreenSharing) {
      const videoTrack = localStreamRef.current?.getVideoTracks()[0];
      const sender = Object.values(peers)[0]?.getSenders()?.find((s) => s.track.kind === "video");
      if (videoTrack && sender) {
        sender.replaceTrack(videoTrack);
      }
      localVideoRef.current.srcObject = localStreamRef.current;
      setIsScreenSharing(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });

        const screenTrack = screenStream.getVideoTracks()[0];
        const sender = Object.values(peers)[0]?.getSenders()?.find((s) => s.track.kind === "video");
        if (sender) {
          sender.replaceTrack(screenTrack);
        }

        screenTrack.onended = () => {
          const videoTrack = localStreamRef.current?.getVideoTracks()[0];
          if (videoTrack && sender) {
            sender.replaceTrack(videoTrack);
          }
          localVideoRef.current.srcObject = localStreamRef.current;
          setIsScreenSharing(false);
        };

        localVideoRef.current.srcObject = screenStream;
        setIsScreenSharing(true);
      } catch (error) {
        console.error("Error accessing screen share:", error);
        alert("Could not share the screen.");
      }
    }
  };

  const toggleChat = () => {
    setIsChatOpen((prev) => !prev);
  };

  const sendMessage = () => {
    if (newMessage.trim()) {
      socket.emit("chat-message", { roomId, userId, message: newMessage });
      setMessages((prev) => [...prev, { userId, message: newMessage }]);
      setNewMessage("");
    }
  };

  if (step === "welcome") {
    return (
      <div className="h-screen bg-gradient-to-r from-blue-500 to-indigo-600 text-white flex flex-col justify-center items-center">
        <header className="text-center space-y-8">
          <h1 className="text-5xl font-extrabold tracking-wide drop-shadow-md">
            Welcome to Video Conferencing
          </h1>
          <Button
            onClick={createRoom}
            variant="contained"
            startIcon={<VideoCallIcon />}
            className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg transform transition duration-300 hover:scale-105"
          >
            Create Meeting
          </Button>
          <div className="mt-6 flex flex-col items-center space-y-4">
            <TextField
              variant="outlined"
              size="small"
              placeholder="Enter Room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-64 bg-white rounded-md shadow-md focus:ring-2 focus:ring-indigo-500"
              InputProps={{
                style: { padding: "10px", fontSize: "16px" },
              }}
            />
            <Button
              onClick={joinRoom}
              variant="contained"
              className="bg-yellow-500 hover:bg-yellow-600 text-white px-6 py-3 rounded-lg shadow-lg transform transition duration-300 hover:scale-105"
            >
              Join Room
            </Button>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-800 text-white">
      <header className="h-[10%] py-4 px-6 bg-gray-900 shadow-lg flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Room ID: {roomId}</h1>
        <Button
          onClick={() => {
            setStep("welcome");
            socket.emit("leave-room", { roomId, userId });
          }}
          variant="contained"
          className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg shadow"
        >
          Cancel Meeting
        </Button>
      </header>
      <div
        className={`flex-grow h-[70%] ${
          Object.keys(peers).length === 0 ? "flex justify-center items-center" : "grid grid-cols-3 gap-4"
        } p-4`}
      >
        <div className={Object.keys(peers).length === 0 ? "w-1/2" : "w-full"}>
          <video ref={localVideoRef} autoPlay muted className="rounded-md shadow-md w-full" />
          <p className="text-center mt-2 text-sm font-semibold text-white">You</p>
        </div>
        {Object.keys(peers).map((peerId) => (
          <div key={peerId} className="rounded-md shadow-md">
            <video id={`video-${peerId}`} autoPlay playsInline className="w-full h-full rounded-md" />
          </div>
        ))}
      </div>
      <footer className="h-[10%] py-4 bg-gray-900 text-center flex justify-center items-center space-x-4">
        <IconButton
          onClick={toggleCamera}
          className="mx-2 hover:text-green-400"
          sx={{ color: "white" }}
        >
          {isCameraOn ? (
            <VideocamOffIcon fontSize="large" sx={{ color: "red" }} />
          ) : (
            <VideocamIcon fontSize="large" sx={{ color: "white" }} />
          )}
        </IconButton>
        <IconButton
          onClick={toggleAudio}
          className="mx-2 hover:text-red-400"
          sx={{ color: "white" }}
        >
          {isAudioOn ? (
            <MicIcon fontSize="large" sx={{ color: "white" }} />
          ) : (
            <MicOffIcon fontSize="large" sx={{ color: "red" }} />
          )}
        </IconButton>
        <IconButton
          onClick={startScreenShare}
          className={`mx-2 hover:text-blue-400 ${isScreenSharing ? "text-red-400" : ""}`}
          sx={{ color: "white" }}
        >
          {isScreenSharing ? (
            <StopScreenShareIcon fontSize="large" sx={{ color: "red" }} />
          ) : (
            <ScreenShareIcon fontSize="large" sx={{ color: "white" }} />
          )}
        </IconButton>
        <IconButton
          onClick={toggleChat}
          className="hover:text-yellow-400"
          sx={{ color: "white" }}
        >
          <ChatIcon fontSize="large" sx={{ color: "white" }} />
        </IconButton>
      </footer>
      {isChatOpen && (
        <div className="absolute top-0 right-0 h-full bg-white shadow-lg transition-transform duration-300 w-80 z-10 border-l border-gray-300">
          <div className="p-4 flex flex-col h-full">
            <h2 className="text-lg font-bold text-gray-800 border-b pb-2 mb-4">Chat</h2>
            <div className="flex-grow overflow-y-auto space-y-2">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg shadow-sm ${
                    msg.userId === userId
                      ? "bg-blue-100 text-blue-900 self-end"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  <strong className="block text-sm font-semibold">
                    {msg.userId === userId ? "You" : msg.userId}
                  </strong>
                  <p className="text-sm">{msg.message}</p>
                </div>
              ))}
            </div>
            <div className="flex mt-4 items-center">
              <TextField
                variant="outlined"
                size="small"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-grow"
                InputProps={{
                  style: { color: "#4B5563", background: "#F9FAFB", fontSize: "14px" },
                }}
              />
              <Button
                onClick={sendMessage}
                variant="contained"
                className="ml-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg shadow"
              >
                Send
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoApp;
