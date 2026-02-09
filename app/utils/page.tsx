"use client";

import { useState, useEffect } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { createVault, unlockVault, signChallenge, verifyChallenge } from "../utils/crypto";

export default function CryptoInspector() {
  const { signIn, signOut } = useAuthActions();
  const user = useQuery(api.users.currentUser);
  const storeVault = useMutation(api.users.storeVault);
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("Bereit.");
  const [localPrivateKey, setLocalPrivateKey] = useState<CryptoKey | null>(null);

  const handleCreateVaultManual = async () => {
    if (!user) {
      setStatus("❌ Fehler: Du musst eingeloggt sein, um Keys zu erstellen.");
      return;
    }
    if (!password) {
      setStatus("❌ Fehler: Bitte gib dein Passwort oben ein (wird für Verschlüsselung gebraucht).");
      return;
    }

    try {
      setStatus("Erzeuge RSA-Keys und verschlüssele Tresor...");
      const vault = await createVault(password);
      
      await storeVault({
        publicKey: vault.publicKey,
        encryptedPrivateKey: vault.encryptedPrivateKey,
        vaultSalt: vault.vaultSalt,
        vaultIv: vault.vaultIv,
      });
      
      setStatus("✅ Tresor erfolgreich in DB gespeichert!");
    } catch (e: any) {
      setStatus("❌ Krypto-Fehler: " + e.message);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto bg-white text-black min-h-screen border shadow-2xl mt-10 rounded-3xl">
      <h1 className="text-4xl font-black mb-8 text-indigo-900 text-center">🔐 SECURE-CALL INSPEKTOR</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* LOGAN & SETUP */}
        <div className="space-y-6">
          <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200">
            <h2 className="text-xl font-bold mb-4">1. Account-Steuerung</h2>
            <input className="w-full border p-3 rounded-lg mb-2 bg-white" placeholder="E-Mail" onChange={e => setEmail(e.target.value)} />
            <input className="w-full border p-3 rounded-lg mb-4 bg-white" type="password" placeholder="Passwort" onChange={e => setPassword(e.target.value)} />
            
            <div className="flex flex-wrap gap-2">
              <button onClick={() => signIn("password", {email, password, flow: "signUp"})} className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold">Registrieren</button>
              <button onClick={() => signIn("password", {email, password, flow: "signIn"})} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold">Login</button>
              <button onClick={() => signOut()} className="bg-gray-400 text-white px-4 py-2 rounded-lg font-bold">Logout</button>
            </div>
          </div>

          <div className="p-6 bg-orange-50 rounded-2xl border border-orange-200">
            <h2 className="text-xl font-bold mb-2 text-orange-800">2. Krypto-Initialisierung</h2>
            <p className="text-sm mb-4 text-orange-700">Falls in Convex die Felder (PublicKey, Salt etc.) leer sind, klicke hier nach dem Login:</p>
            <button 
                onClick={handleCreateVaultManual}
                disabled={!user}
                className="w-full bg-orange-500 text-white p-4 rounded-xl font-black shadow-lg disabled:opacity-30"
            >
                KRYPTO-TRESOR JETZT ERSTELLEN
            </button>
          </div>
        </div>

        {/* DATEN-MONITOR (RÖNTGEN) */}
        <div className="bg-gray-900 text-green-400 p-6 rounded-2xl shadow-2xl font-mono text-xs overflow-hidden">
          <h2 className="text-white text-lg font-bold mb-4 border-b border-gray-700 pb-2">📂 LIVE DB-INSPEKTOR</h2>
          
          <div className="space-y-4">
            <div>
              <p className="text-gray-500 font-bold uppercase">Status:</p>
              <p className="text-white text-sm">{status}</p>
            </div>

            {user ? (
              <>
                <div className="border-t border-gray-800 pt-2">
                  <p className="text-gray-500 font-bold">USER EMAIL:</p>
                  <p className="text-blue-400">{user.email}</p>
                </div>
                <div>
                  <p className="text-gray-500 font-bold">PUBLIC KEY:</p>
                  <p className="break-all text-[10px]">{user.publicKey || "⚠️ FEHLT (Bitte Orange Button drücken)"}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-gray-500 font-bold text-[10px]">SALT:</p>
                    <p className="break-all">{user.vaultSalt || "⚠️ FEHLT"}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 font-bold text-[10px]">IV:</p>
                    <p className="break-all">{user.vaultIv || "⚠️ FEHLT"}</p>
                  </div>
                </div>
                <div>
                  <p className="text-yellow-500 font-bold">ENCRYPTED PRIVATE KEY:</p>
                  <p className="break-all text-yellow-200 opacity-60">
                    {user.encryptedPrivateKey ? user.encryptedPrivateKey.substring(0, 100) + "..." : "⚠️ TRESOR LEER"}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-red-400 animate-pulse">Warte auf Login...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}