"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import Navbar from "../../components/Navbar";
import Background from "../../components/Background";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";

import { auth } from "../firebase";

export default function AuthPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Start in LOGIN mode
  const [isLogin, setIsLogin] = useState(true);

  const [loading, setLoading] = useState(false);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();

    if (!email || !password) {
      return; // removed alert
    }

    try {
      setLoading(true);

      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);

        // Redirect after login
        router.push("/profile");

      } else {
        await createUserWithEmailAndPassword(auth, email, password);

        // Redirect after signup
        router.push("/profile");
      }

      setEmail("");
      setPassword("");

    } catch (error: any) {
      console.error(error);
      // removed alert
    }

    setLoading(false);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <Background />
      <Navbar />

      <section className="relative z-10 mx-auto max-w-md px-6 py-20">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-8 shadow-2xl backdrop-blur">
          <h1 className="text-4xl font-black text-sky-400">
            {isLogin ? "Login" : "Create Account"}
          </h1>

          <p className="mt-3 text-zinc-400">Welcome to Sky Drop.</p>

          <form onSubmit={handleAuth} className="mt-8 space-y-5">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-sky-400"
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-sky-400"
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-sky-500 px-4 py-4 font-bold transition hover:bg-sky-400 disabled:opacity-50"
            >
              {loading
                ? "Loading..."
                : isLogin
                ? "Login"
                : "Create Account"}
            </button>
          </form>

          {/* Create Account button under Login */}
          {isLogin && (
            <button
              onClick={() => setIsLogin(false)}
              className="mt-6 w-full text-center text-sm text-sky-400 hover:underline"
            >
              Need an account? Create one
            </button>
          )}

          {/* Switch back to Login */}
          {!isLogin && (
            <button
              onClick={() => setIsLogin(true)}
              className="mt-6 w-full text-center text-sm text-sky-400 hover:underline"
            >
              Already have an account? Login
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
