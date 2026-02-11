
"use client";

import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useRef, useState, useEffect } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";


export default function VideoCallPage() {
	const [isConnecting, setIsConnecting] = useState(false);
	const [isConnected, setIsConnected] = useState(false);
	const [isAudioMuted, setIsAudioMuted] = useState(false);
	const [isVideoOff, setIsVideoOff] = useState(false);
	const [connectionStatus, setConnectionStatus] = useState("Disconnected");
	const [error, setError] = useState("");
	const [isCaller, setIsCaller] = useState<boolean | null>(null);
	const [showUserDropdown, setShowUserDropdown] = useState(false);
	const data = useQuery(api.users.currentUser);
	const { signOut } = useAuthActions();
	const router = useRouter();
	const allUsers = useQuery(api.users.getAllUsers);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setShowUserDropdown(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const handleUserSelect = (userEmail: string | undefined) => {
		setShowUserDropdown(false);
		if (userEmail) {
			initiateCall(userEmail);
		}
	};
	console.log("Current User Data:", data);

	// Refs for video elements and WebRTC
	const localVideoRef = useRef<HTMLVideoElement>(null);
	const remoteVideoRef = useRef<HTMLVideoElement>(null);
	const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
	const localStreamRef = useRef<MediaStream | null>(null);

	// TODO: Initialize local media stream
	const initializeLocalStream = async () => {
		// Implement: Get user media (camera/microphone)
		// Set localStreamRef.current and localVideoRef.current.srcObject
	};

	// TODO: Create RTCPeerConnection
	const createPeerConnection = () => {
		// Implement: Create new RTCPeerConnection with your ICE servers
		// Add local tracks to peer connection
		// Set up event handlers: ontrack, onicecandidate, onconnectionstatechange
	};

	// TODO: Create and send offer (caller side)
	const createOffer = async () => {
		// Implement: Create offer, set local description
		// Send offer to remote peer via your signaling server
	};

	// TODO: Handle received offer and create answer (receiver side)
	const handleOffer = async (offer: RTCSessionDescriptionInit) => {
		// Implement: Set remote description, create answer, set local description
		// Send answer to remote peer via your signaling server
	};

	// TODO: Handle received answer (caller side)
	const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
		// Implement: Set remote description with received answer
	};

	// TODO: Add ICE candidate received from remote peer

	const addIceCandidate = async (candidate: RTCIceCandidateInit) => {
		// Implement: Add ICE candidate to peer connection
	};


	// Initiate a call (as caller)
	const initiateCall = async (targetUserEmail?: string) => {
		setIsConnecting(true);
		setIsCaller(true);
		setError("");
		setConnectionStatus(targetUserEmail ? `Calling ${targetUserEmail}...` : "Calling...");
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: true,
				audio: true
			});
			console.log(stream);
			localStreamRef.current = stream;
			if (stream.active && localVideoRef.current) {
				setIsConnected(true);
				setConnectionStatus("Connected");
				localVideoRef.current.srcObject = stream;
			}
		} catch (err) {
			console.error("Error initiating call:", err);
			setError("Failed to access camera/microphone");
			setIsConnecting(false);
			setConnectionStatus("Disconnected");
		}
	};

	// Respond to a call (as receiver)
	const respondToCall = async () => {
		setIsConnecting(true);
		setIsCaller(false);
		setError("");
		setConnectionStatus("Accepting call...");
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: true,
				audio: true
			});
			console.log(stream);
			localStreamRef.current = stream;
			if (stream.active && localVideoRef.current) {
				setIsConnected(true);
				setConnectionStatus("Connected");
				localVideoRef.current.srcObject = stream;
			}
		} catch (err) {
			console.error("Error responding to call:", err);
			setError("Failed to access camera/microphone");
			setIsConnecting(false);
			setConnectionStatus("Disconnected");
		}
	};

	// Toggle audio mute
	const toggleAudio = () => {
		// TODO: Implement audio mute/unmute logic
		setIsAudioMuted(!isAudioMuted);
	};

	// Toggle video
	const toggleVideo = () => {
		// TODO: Implement video on/off logic
		setIsVideoOff(!isVideoOff);
	};

	// End call
	const endCall = () => {
		// TODO: Implement cleanup logic
		// Stop all tracks, close peer connection, reset state
		setIsConnected(false);
		setIsConnecting(false);
		setConnectionStatus("Disconnected");
	};

	// Logout Handler
	const handleLogout = async () => {
		try {
			// Cleanup: Stop all media tracks
			if (localStreamRef.current) {
				localStreamRef.current.getTracks().forEach(track => track.stop());
			}
			// Close peer connection
			if (peerConnectionRef.current) {
				peerConnectionRef.current.close();
			}
			// Logout und zurück zur Login-Seite
			await signOut();
			router.push("/");
		} catch (err) {
			console.error("Logout Error:", err);
		}
	};

	return (
		<div className="min-h-screen flex flex-col p-4 relative overflow-hidden">
			{/* Subtle background pattern */}
			<div className="absolute inset-0 bg-[radial-gradient(hsl(var(--muted))_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />

			{/* Floating orbs for depth */}
			<div className="absolute top-20 left-20 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: "8s" }} />
			<div className="absolute bottom-20 right-20 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: "12s", animationDelay: "2s" }} />

			{/* Header */}
			<div className="relative z-30 mb-6">
				<div className="max-w-7xl mx-auto">
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-3xl font-bold tracking-tight mb-2">Secure Video Call</h1>
							<p className="text-sm text-muted-foreground">
								Status: <span className="font-medium text-foreground">{connectionStatus}</span>
							</p>
						</div>
						<div className="flex items-center gap-3">						{/* Logout Button */}
						<button
							onClick={handleLogout}
							className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 active:scale-[0.98]"
						>
							<svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
							</svg>
							Logout
						</button>							{!isConnected && !isConnecting && (
								<>
									<div className="relative" ref={dropdownRef}>
										<button
											onClick={() => setShowUserDropdown(!showUserDropdown)}
											className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-6 py-2 active:scale-[0.98]"
										>
											<svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
											</svg>
											Call
										</button>
										{showUserDropdown && allUsers && (
											<div className="absolute top-full right-0 mt-2 w-64 bg-card border border-border rounded-lg shadow-2xl overflow-hidden backdrop-blur-sm z-[100]">
												<div className="p-3 border-b border-border bg-muted/30">
													<p className="text-sm font-medium">Select a user to call</p>
												</div>
												<div className="max-h-60 overflow-y-auto">
													{allUsers
														.filter(user => user._id !== data?._id)
														.map(user => (
															<button
																key={user._id}
																onClick={() => handleUserSelect(user.email)}
																className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0"
															>
																<div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
																	<span className="text-xs font-medium text-primary">
																		{user.email?.charAt(0).toUpperCase() || "U"}
																	</span>
																</div>
																<div className="flex-1 min-w-0">
																	<p className="text-sm font-medium truncate">{user.email}</p>
																</div>
																<svg className="w-4 h-4 text-muted-foreground flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
																	<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
																</svg>
															</button>
														))}
													{allUsers.filter(user => user._id !== data?._id).length === 0 && (
														<div className="px-4 py-6 text-center">
															<p className="text-sm text-muted-foreground">No other users available</p>
														</div>
													)}
												</div>
											</div>
										)}
									</div>
									<button
										onClick={respondToCall}
										className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-green-600 text-white hover:bg-green-700 h-10 px-6 py-2 active:scale-[0.98]"
									>
										<svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
										</svg>
										Respond
									</button>
								</>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* Error message */}
			{error && (
				<div className="relative z-10 max-w-7xl mx-auto w-full mb-4">
					<div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm text-destructive">
						{error}
					</div>
				</div>
			)}

			{/* Video container */}
			<div className="relative z-10 flex-1 max-w-7xl mx-auto w-full">
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
					{/* Local video */}
					<div className="relative bg-card border border-border rounded-lg shadow-2xl overflow-hidden backdrop-blur-sm transition-all duration-500 hover:shadow-[0_20px_70px_-15px_rgba(0,0,0,0.3)]">
						<div className="absolute top-4 left-4 z-10 bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-md border border-border">
							<p className="text-xs font-medium">You</p>
						</div>
						<video
							ref={localVideoRef}
							autoPlay
							playsInline
							muted
							className="w-full h-full object-cover bg-muted"
						/>
						{isVideoOff && (
							<div className="absolute inset-0 flex items-center justify-center bg-muted">
								<div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
									<svg className="w-12 h-12 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
									</svg>
								</div>
							</div>
						)}
					</div>

					{/* Remote video */}
					<div className="relative bg-card border border-border rounded-lg shadow-2xl overflow-hidden backdrop-blur-sm transition-all duration-500 hover:shadow-[0_20px_70px_-15px_rgba(0,0,0,0.3)]">
						<div className="absolute top-4 left-4 z-10 bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-md border border-border">
							<p className="text-xs font-medium">Remote Peer</p>
						</div>
						<video
							ref={remoteVideoRef}
							autoPlay
							playsInline
							className="w-full h-full object-cover bg-muted"
						/>
						{!isConnected && (
							<div className="absolute inset-0 flex items-center justify-center bg-muted">
								<div className="text-center space-y-4">
									<div className="w-24 h-24 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
										<svg className="w-12 h-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
										</svg>
									</div>
									<p className="text-sm text-muted-foreground">Waiting for remote peer...</p>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Controls */}
			<div className="relative z-10 mt-6 max-w-7xl mx-auto w-full">
				<div className="bg-card border border-border rounded-lg shadow-2xl p-6 backdrop-blur-sm">
					<div className="flex items-center justify-center gap-4">
						{/* Mute/Unmute */}
						<button
							onClick={toggleAudio}
							disabled={!localStreamRef.current}
							className={`inline-flex items-center justify-center rounded-full text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-14 w-14 ${isAudioMuted
								? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
								: "bg-secondary text-secondary-foreground hover:bg-secondary/80"
								}`}
						>
							{isAudioMuted ? (
								<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
								</svg>
							) : (
								<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
								</svg>
							)}
						</button>

						{/* Video on/off */}
						<button
							onClick={toggleVideo}
							disabled={!localStreamRef.current}
							className={`inline-flex items-center justify-center rounded-full text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-14 w-14 ${isVideoOff
								? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
								: "bg-secondary text-secondary-foreground hover:bg-secondary/80"
								}`}
						>
							{isVideoOff ? (
								<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
								</svg>
							) : (
								<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
								</svg>
							)}
						</button>

						{/* End call */}
						<button
							onClick={endCall}
							disabled={!localStreamRef.current}
							className="inline-flex items-center justify-center rounded-full text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground hover:bg-destructive/90 h-14 w-14"
						>
							<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
							</svg>
						</button>
					</div>

					{/* Debug info */}
					<div className="mt-4 pt-4 border-t border-border">
						<p className="text-xs text-muted-foreground text-center">
							WebRTC Demo • Local peer connection established
						</p>
					</div>
				</div>
			</div>

			{/* Footer note */}
			<p className="relative z-10 text-center text-xs text-muted-foreground mt-6 animate-pulse" style={{ animationDuration: "3s" }}>
				End-to-end encrypted video communication
			</p>
		</div>
	);
}
