"use client";

import { ReactNode } from "react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient("https://peaceful-fox-437.convex.cloud");

export function ConvexClientProvider({ children }: { children: ReactNode }) {
	return (
		<ConvexAuthProvider client={convex}>
			{children}
		</ConvexAuthProvider>
	);
}
