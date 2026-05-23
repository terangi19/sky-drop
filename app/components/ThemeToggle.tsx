"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [lightMode, setLightMode] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");

    if (savedTheme === "light") {
      document.documentElement.classList.add("light");
      setLightMode(true);
    } else {
      document.documentElement.classList.remove("light");
      setLightMode(false);
    }
  }, []);

  function toggleTheme() {
    if (lightMode) {
      document.documentElement.classList.remove("light");
      localStorage.setItem("theme", "dark");
      setLightMode(false);
    } else {
      document.documentElement.classList.add("light");
      localStorage.setItem("theme", "light");
      setLightMode(true);
    }
  }

  return (
    <button
      onClick={toggleTheme}
      className={`fixed right-5 bottom-24 md:right-5 md:top-1/2 md:-translate-y-1/2 z-40 rounded-full px-4 py-3 md:px-5 md:py-4 text-lg md:text-xl shadow-2xl backdrop-blur-xl transition hover:scale-105 ${
        lightMode
          ? "border border-black/10 bg-white text-black"
          : "border border-white/10 bg-black/60 text-white"
      }`}
    >
      {lightMode ? "🌙" : "☀️"}
    </button>
  );
}