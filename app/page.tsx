"use client";

import { useState, FormEvent, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery, useConvex } from "convex/react";
import { initializeDeviceCrypto, hasKeyPairForDevice } from "@/app/utils/crypto";

export default function Home() {
	const [isLogin, setIsLogin] = useState(true);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");

	// BundID Flow States
	const [showBundId, setShowBundId] = useState(false);
	const [bundIdStatus, setBundIdStatus] = useState<
		"verifying" | "generating" | "done"
	>("verifying");

	// Verhindert dass der useEffect den User weiterleitet
	// während wir gerade Keys generieren
	const [isAuthenticating, setIsAuthenticating] = useState(false);

	const router = useRouter();
	const { signIn } = useAuthActions();
	const convexClient = useConvex();
	const data = useQuery(api.users.currentUser);
	const registerDeviceMutation = useMutation(api.devices.registerDevice);

	/**
	 * Wartet bis der aktuelle User von Convex geladen ist.
	 * Wird nach signIn aufgerufen, weil die Query nicht sofort aktualisiert.
	 */
	const waitForUserId = async (maxRetries = 20): Promise<string> => {
		for (let i = 0; i < maxRetries; i++) {
			const user = await convexClient.query(api.users.currentUser);
			if (user?._id) return user._id;
			await new Promise((r) => setTimeout(r, 300));
		}
		throw new Error("User konnte nach Login nicht geladen werden");
	};

	// Guard gegen doppelte Auto-Setup-Aufrufe
	const autoSetupStartedRef = useRef(false);

	// Falls User bereits eingeloggt ist UND wir nicht gerade im Auth-Flow sind
	useEffect(() => {
		if (!data || isAuthenticating || showBundId || autoSetupStartedRef.current) return;

		const checkAndRedirect = async () => {
			const { exists } = await hasKeyPairForDevice(data._id);
			if (exists) {
				// Keys vorhanden → direkt weiter
				router.push("/videoCall");
			} else {
				// Kein Key → BundID nötig, NICHT weiterleiten
				autoSetupStartedRef.current = true;
				setIsAuthenticating(true);
				console.log("[Auth] Eingeloggt aber kein Key, BundID nötig");
				await runBundIdAndKeySetup(data._id);
			}
		};

		checkAndRedirect();
	}, [data, isAuthenticating, showBundId]);

	// ============================================================================
	// BundID Simulation + Key-Generierung
	// ============================================================================

	const runBundIdAndKeySetup = async (userId: string) => {
		setShowBundId(true);

		// Phase 1: BundID Verifikation simulieren (2 Sekunden)
		setBundIdStatus("verifying");
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Phase 2: Schlüssel generieren & Gerät registrieren
		setBundIdStatus("generating");
		try {
			const { deviceId, deviceName, publicKeyJwk } =
				await initializeDeviceCrypto(userId);

			await registerDeviceMutation({
				deviceId,
				publicKey: publicKeyJwk,
				deviceName,
			});

			console.log(`[Crypto] Gerät registriert: ${deviceId} (${deviceName})`);
		} catch (err) {
			console.error("[Crypto] Geräte-Setup fehlgeschlagen:", err);
			setShowBundId(false);
			setIsAuthenticating(false);
			setError("Schlüssel-Generierung fehlgeschlagen. Bitte erneut versuchen.");
			return;
		}

		// Phase 3: Fertig
		setBundIdStatus("done");
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Weiterleitung
		setIsAuthenticating(false);
		router.push("/videoCall");
	};

	// ============================================================================
	// Form Submit
	// ============================================================================

	const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setIsLoading(true);
		setError("");
		setIsAuthenticating(true); // Redirect blockieren bis wir fertig sind

		const formData = new FormData(e.currentTarget);
		const email = formData.get("email") as string;
		const password = formData.get("password") as string;

		if (isLogin) {
			// ---- LOGIN ----
			try {
				await signIn("password", { email, password, flow: "signIn" });

				// UserId vom Server holen (nach signIn verfügbar)
				const userId = await waitForUserId();

				// Prüfen ob Private Key für DIESEN USER auf diesem Gerät existiert
				const { exists } = await hasKeyPairForDevice(userId);

				if (exists) {
					// Key existiert lokal für diesen User → Convex-Registrierung sicherstellen
					console.log("[Auth] Bestehendes Gerät erkannt, prüfe Convex-Registrierung");
					try {
						const { deviceId, deviceName, publicKeyJwk } =
							await initializeDeviceCrypto(userId);
						await registerDeviceMutation({
							deviceId,
							publicKey: publicKeyJwk,
							deviceName,
						});
						console.log("[Auth] Gerät in Convex bestätigt, weiter");
					} catch (err) {
						console.warn("[Auth] Convex-Registrierung fehlgeschlagen, weiter trotzdem:", err);
					}
					setIsAuthenticating(false);
					router.push("/videoCall");
				} else {
					// Kein Key für diesen User → neues Gerät, BundID nötig
					console.log("[Auth] Neues Gerät für diesen User, BundID erforderlich");
					setIsLoading(false);
					await runBundIdAndKeySetup(userId);
				}
			} catch (err) {
				console.error("Login Error:", err);
				setError("Ungültige E-Mail oder Passwort.");
				setIsLoading(false);
				setIsAuthenticating(false);
			}
		} else {
			// ---- REGISTRIERUNG ----
			const confirmPassword = formData.get("confirmPassword") as string;

			if (password !== confirmPassword) {
				setError("Passwörter stimmen nicht überein.");
				setIsLoading(false);
				setIsAuthenticating(false);
				return;
			}

			try {
				await signIn("password", {
					email,
					password,
					flow: "signUp",
				});

				// UserId vom Server holen
				const userId = await waitForUserId();

				// Neuer Account → immer BundID + Key-Generierung
				setIsLoading(false);
				await runBundIdAndKeySetup(userId);
			} catch (err) {
				console.error("Registration Error:", err);
				setError(
					"Registrierung fehlgeschlagen. Diese E-Mail ist möglicherweise bereits registriert."
				);
				setIsLoading(false);
				setIsAuthenticating(false);
			}
		}
	};

	const handleModeSwitch = () => {
		setIsLogin(!isLogin);
		setError("");
	};

	// ============================================================================
	// BundID Simulations-Screen
	// ============================================================================

	if (showBundId) {
		return (
			<div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
				<div className="absolute inset-0 bg-[radial-gradient(hsl(var(--muted))_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
				<div className="absolute top-20 left-20 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: "8s" }} />
				<div className="absolute bottom-20 right-20 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: "12s", animationDelay: "2s" }} />

				<div className="w-full max-w-md relative z-10">
					<div className="bg-card border border-border rounded-lg shadow-2xl overflow-hidden backdrop-blur-sm p-12 transition-all duration-500">
						<div className="flex flex-col items-center justify-center space-y-6">
							{/* Icon */}
							{bundIdStatus === "done" ? (
								<div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
									<svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
									</svg>
								</div>
							) : (
								<div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center animate-pulse" style={{ animationDuration: "2s" }}>
									<svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
									</svg>
								</div>
							)}

							{/* Spinner (nicht bei "done") */}
							{bundIdStatus !== "done" && (
								<svg className="animate-spin h-12 w-12 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
									<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
									<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
								</svg>
							)}

							{/* Status Text */}
							<div className="text-center space-y-2">
								{bundIdStatus === "verifying" && (
									<>
										<h2 className="text-xl font-semibold tracking-tight">BundID Verifikation</h2>
										<p className="text-sm text-muted-foreground">Identität wird überprüft...</p>
									</>
								)}
								{bundIdStatus === "generating" && (
									<>
										<h2 className="text-xl font-semibold tracking-tight">Schlüssel werden generiert</h2>
										<p className="text-sm text-muted-foreground">Sicheres Schlüsselpaar wird erstellt...</p>
									</>
								)}
								{bundIdStatus === "done" && (
									<>
										<h2 className="text-xl font-semibold tracking-tight text-green-500">Verifizierung abgeschlossen</h2>
										<p className="text-sm text-muted-foreground">Weiterleitung...</p>
									</>
								)}
							</div>

							{/* Fortschritts-Schritte */}
							<div className="w-full space-y-3 pt-4">
								<div className="flex items-center gap-3">
									<div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${bundIdStatus === "verifying"
										? "bg-primary text-primary-foreground"
										: "bg-green-500 text-white"
										}`}>
										{bundIdStatus === "verifying" ? "1" : "✓"}
									</div>
									<span className="text-sm">BundID Identitätsprüfung</span>
								</div>
								<div className="flex items-center gap-3">
									<div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${bundIdStatus === "verifying"
										? "bg-muted text-muted-foreground"
										: bundIdStatus === "generating"
											? "bg-primary text-primary-foreground"
											: "bg-green-500 text-white"
										}`}>
										{bundIdStatus === "done" ? "✓" : "2"}
									</div>
									<span className={`text-sm ${bundIdStatus === "verifying" ? "text-muted-foreground" : ""}`}>
										ECDSA Schlüsselpaar generieren
									</span>
								</div>
								<div className="flex items-center gap-3">
									<div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${bundIdStatus === "done"
										? "bg-green-500 text-white"
										: "bg-muted text-muted-foreground"
										}`}>
										{bundIdStatus === "done" ? "✓" : "3"}
									</div>
									<span className={`text-sm ${bundIdStatus === "done" ? "" : "text-muted-foreground"}`}>
										Gerät registrieren
									</span>
								</div>
							</div>
						</div>
					</div>

					<p className="text-center text-xs text-muted-foreground mt-6 animate-pulse" style={{ animationDuration: "3s" }}>
						Sichere Authentifizierung wird durchgeführt
					</p>
				</div>
			</div>
		);
	}

	// ============================================================================
	// Login / Register Form
	// ============================================================================

	return (
		<div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
			<div className="absolute inset-0 bg-[radial-gradient(hsl(var(--muted))_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
			<div className="absolute top-20 left-20 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: "8s" }} />
			<div className="absolute bottom-20 right-20 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: "12s", animationDelay: "2s" }} />

			<div className="w-full max-w-md relative z-10">
				<div className="bg-card border border-border rounded-lg shadow-2xl overflow-hidden backdrop-blur-sm transition-all duration-500 hover:shadow-[0_20px_70px_-15px_rgba(0,0,0,0.3)]">
					{/* Header */}
					<div className="border-b border-border bg-muted/30 p-6">
						<div className="flex items-center justify-between mb-2">
							<h1 className="text-2xl font-semibold tracking-tight">
								{isLogin ? "Welcome back" : "Create account"}
							</h1>
							<div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
								<svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
								</svg>
							</div>
						</div>
						<p className="text-sm text-muted-foreground">
							{isLogin
								? "Enter your credentials to access your account"
								: "Create your account credentials"}
						</p>
					</div>

					{/* Form */}
					<form onSubmit={handleSubmit} className="p-6 space-y-4">
						{/* Email */}
						<div className="space-y-2">
							<label htmlFor="email" className="text-sm font-medium leading-none">
								Email
							</label>
							<input
								id="email"
								name="email"
								type="email"
								placeholder="name@example.com"
								required
								className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
							/>
						</div>

						{/* Password */}
						<div className="space-y-2">
							<label htmlFor="password" className="text-sm font-medium leading-none">
								Password
							</label>
							<input
								id="password"
								name="password"
								type="password"
								placeholder={isLogin ? "••••••••" : "Create a strong password"}
								required
								minLength={isLogin ? undefined : 8}
								className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
							/>
						</div>

						{/* Confirm Password (nur bei Registrierung) */}
						{!isLogin && (
							<div className="space-y-2">
								<label htmlFor="confirmPassword" className="text-sm font-medium leading-none">
									Confirm Password
								</label>
								<input
									id="confirmPassword"
									name="confirmPassword"
									type="password"
									placeholder="Re-enter your password"
									required
									minLength={8}
									className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
								/>
							</div>
						)}

						{/* Error */}
						{error && (
							<div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm text-destructive">
								{error}
							</div>
						)}

						{/* Submit */}
						<button
							type="submit"
							disabled={isLoading}
							className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full mt-2 active:scale-[0.98]"
						>
							{isLoading ? (
								<>
									<svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-primary-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
										<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
										<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
									</svg>
									Processing...
								</>
							) : isLogin ? (
								"Sign in"
							) : (
								"Create account"
							)}
						</button>

						{/* Toggle */}
						<div className="text-center pt-4 border-t border-border">
							<button
								type="button"
								onClick={handleModeSwitch}
								className="text-sm text-muted-foreground hover:text-primary transition-colors underline-offset-4 hover:underline"
							>
								{isLogin
									? "Need an account? Register"
									: "Already have an account? Sign in"}
							</button>
						</div>
					</form>
				</div>

				<p className="text-center text-xs text-muted-foreground mt-6 animate-pulse" style={{ animationDuration: "3s" }}>
					Secure authentication powered by ECDSA P-256
				</p>
			</div>
		</div>
	);
}