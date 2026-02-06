"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";

export default function Home() {
	const [isLogin, setIsLogin] = useState(true);
	const [isLoading, setIsLoading] = useState(false);
	const [registrationStep, setRegistrationStep] = useState<"token" | "credentials">("token");
	const [verifiedToken, setVerifiedToken] = useState("");
	const [error, setError] = useState("");
	
	const router = useRouter();
	const { signIn } = useAuthActions();

	const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setIsLoading(true);
		setError("");

		const formData = new FormData(e.currentTarget);
		const email = formData.get("email") as string;
		const password = formData.get("password") as string;

		if (isLogin) {
			// --- LOGIN LOGIK ---
			try {
				await signIn("password", { email, password, flow: "signIn" });
				router.push("/dashboard");
			} catch (err) {
				console.error("Login Error:", err);
				setError("Ungültige E-Mail oder Passwort.");
				setIsLoading(false);
			}
		} else {
			// --- REGISTRIERUNGS LOGIK (wird von deinem Kollegen vervollständigt) ---
			if (registrationStep === "token") {
				const token = formData.get("token") as string;
				// Simulierter Token-Check (hier könntest du SC-2026 prüfen)
				setTimeout(() => {
					setIsLoading(false);
					setVerifiedToken(token);
					setRegistrationStep("credentials");
				}, 1000);
			} else {
				// Finaler Registrierungsschritt (Platzhalter für deinen Kollegen)
				setTimeout(() => {
					setIsLoading(false);
					alert("Registrierung wird vom Kollegen implementiert (inkl. Krypto-Keys)!");
				}, 1000);
			}
		}
	};

	const handleModeSwitch = () => {
		setIsLogin(!isLogin);
		setRegistrationStep("token");
		setVerifiedToken("");
		setError("");
	};

	return (
		<div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
			{/* Subtle background pattern */}
			<div className="absolute inset-0 bg-[radial-gradient(hsl(var(--muted))_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
			
			{/* Floating orbs for depth */}
			<div className="absolute top-20 left-20 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: "8s" }} />
			<div className="absolute bottom-20 right-20 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: "12s", animationDelay: "2s" }} />

			<div className="w-full max-w-md relative z-10">
				{/* Card container */}
				<div className="bg-card border border-border rounded-lg shadow-2xl overflow-hidden backdrop-blur-sm transition-all duration-500 hover:shadow-[0_20px_70px_-15px_rgba(0,0,0,0.3)]">
					{/* Header with toggle */}
					<div className="border-b border-border bg-muted/30 p-6">
						<div className="flex items-center justify-between mb-2">
							<h1 className="text-2xl font-semibold tracking-tight">
								{isLogin ? "Welcome back" : registrationStep === "token" ? "Create account" : "Complete registration"}
							</h1>
							<div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
								{registrationStep === "credentials" && !isLogin ? (
									<svg
										className="w-5 h-5 text-primary"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
								) : (
									<svg
										className="w-5 h-5 text-primary"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
										/>
									</svg>
								)}
							</div>
						</div>
						<p className="text-sm text-muted-foreground">
							{isLogin
								? "Enter your credentials to access your account"
								: registrationStep === "token"
								? "Register with your invitation token"
								: "Create your account credentials"}
						</p>
						{/* Progress indicator for registration */}
						{!isLogin && (
							<div className="flex items-center gap-2 mt-4">
								<div className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${registrationStep === "token" ? "bg-primary" : "bg-primary/30"}`} />
								<div className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${registrationStep === "credentials" ? "bg-primary" : "bg-muted"}`} />
							</div>
						)}
					</div>

					{/* Form */}
					<form onSubmit={handleSubmit} className="p-6 space-y-4">
						{isLogin ? (
							<>
								{/* Email field */}
								<div className="space-y-2">
									<label
										htmlFor="email"
										className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
									>
										Email
									</label>
									<input
										id="email"
										name="email"
										type="email"
										placeholder="name@example.com"
										required
										className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
									/>
								</div>

								{/* Password field */}
								<div className="space-y-2">
									<label
										htmlFor="password"
										className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
									>
										Password
									</label>
									<input
										id="password"
										name="password"
										type="password"
										placeholder="••••••••"
										required
										className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
									/>
								</div>
							</>
						) : registrationStep === "token" ? (
							<>
								{/* Token field for registration - Step 1 */}
								<div className="space-y-2">
									<label
										htmlFor="token"
										className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
									>
										Invitation Token
									</label>
									<input
										id="token"
										name="token"
										type="text"
										placeholder="Enter your invitation token"
										required
										className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all font-mono"
										autoFocus
									/>
								</div>
								<div className="bg-muted/50 border border-border/50 rounded-md p-3 text-xs text-muted-foreground">
									<p>Enter the invitation token you received to begin registration.</p>
								</div>
							</>
						) : (
							<>
								{/* Credentials form for registration - Step 2 */}
								<div className="bg-primary/5 border border-primary/20 rounded-md p-3 mb-4">
									<p className="text-xs text-muted-foreground">
										Token verified: <span className="font-mono text-primary">{verifiedToken}</span>
									</p>
								</div>

								{/* Email field */}
								<div className="space-y-2">
									<label
										htmlFor="register-email"
										className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
									>
										Email
									</label>
									<input
										id="register-email"
										name="email"
										type="email"
										placeholder="name@example.com"
										required
										className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
										autoFocus
									/>
								</div>

								{/* Password field */}
								<div className="space-y-2">
									<label
										htmlFor="register-password"
										className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
									>
										Password
									</label>
									<input
										id="register-password"
										name="password"
										type="password"
										placeholder="Create a strong password"
										required
										minLength={8}
										className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
									/>
								</div>

								{/* Confirm Password field */}
								<div className="space-y-2">
									<label
										htmlFor="confirm-password"
										className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
									>
										Confirm Password
									</label>
									<input
										id="confirm-password"
										name="confirmPassword"
										type="password"
										placeholder="Re-enter your password"
										required
										minLength={8}
										className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
									/>
								</div>
							</>
						)}

						{/* Submit button */}
						<button
							type="submit"
							disabled={isLoading}
							className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full mt-2 active:scale-[0.98]"
						>
							{isLoading ? (
								<>
									<svg
										className="animate-spin -ml-1 mr-2 h-4 w-4 text-primary-foreground"
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
									>
										<circle
											className="opacity-25"
											cx="12"
											cy="12"
											r="10"
											stroke="currentColor"
											strokeWidth="4"
										></circle>
										<path
											className="opacity-75"
											fill="currentColor"
											d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
										></path>
									</svg>
									{registrationStep === "token" && !isLogin ? "Verifying token..." : "Processing..."}
								</>
							) : isLogin ? (
								"Sign in"
							) : registrationStep === "token" ? (
								"Verify token"
							) : (
								"Complete registration"
							)}
						</button>

						{/* Back button for registration step 2 */}
						{!isLogin && registrationStep === "credentials" && (
							<button
								type="button"
								onClick={() => {
									setRegistrationStep("token");
									setVerifiedToken("");
								}}
								className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 w-full"
							>
								<svg
									className="w-4 h-4 mr-2"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M10 19l-7-7m0 0l7-7m-7 7h18"
									/>
								</svg>
								Back to token verification
							</button>
						)}

						{/* Toggle link */}
						<div className="text-center pt-4 border-t border-border">
							<button
								type="button"
								onClick={handleModeSwitch}
								className="text-sm text-muted-foreground hover:text-primary transition-colors underline-offset-4 hover:underline"
							>
								{isLogin
									? "Need an account? Register with token"
									: "Already have an account? Sign in"}
							</button>
						</div>
					</form>
				</div>

				{/* Footer note */}
				<p className="text-center text-xs text-muted-foreground mt-6 animate-pulse" style={{ animationDuration: "3s" }}>
					Secure authentication powered by next-gen encryption
				</p>
			</div>
		</div>
	);
}
