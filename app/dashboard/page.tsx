export default function Dashboard() {
	return (
		<div className="min-h-screen flex items-center justify-center p-4">
			<div className="text-center space-y-4">
				<div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
					<svg
						className="w-8 h-8 text-primary"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M5 13l4 4L19 7"
						/>
					</svg>
				</div>
				<h1 className="text-4xl font-bold tracking-tight">
					Welcome to your Dashboard
				</h1>
				<p className="text-muted-foreground max-w-md">
					You have successfully authenticated and can now access your secure workspace.
				</p>
			</div>
		</div>
	);
}
