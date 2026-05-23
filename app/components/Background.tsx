"use client";

import { useEffect, useState } from "react";

export default function Background() {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const check = () => setIsLight(document.documentElement.classList.contains("light"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  if (isLight) {
    return (
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#f5f7fb]" />
        <div className="absolute top-[-30%] left-[-15%] h-[80%] w-[80%] rounded-full bg-sky-400/8 blur-[150px]" />
        <div className="absolute bottom-[-20%] right-[-15%] h-[70%] w-[70%] rounded-full bg-blue-500/10 blur-[140px]" />
        <div className="absolute top-[40%] left-[30%] h-[40%] w-[40%] rounded-full bg-cyan-400/5 blur-[100px]" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[#0a0a0f]" />
      <div className="absolute top-[-20%] left-[-10%] h-[60%] w-[60%] rounded-full bg-sky-500/3 blur-[120px] animate-drift-slow" />
      <div className="absolute bottom-[-15%] right-[-10%] h-[50%] w-[50%] rounded-full bg-violet-500/3 blur-[100px] animate-drift-slower" />
      <div className="absolute top-[30%] right-[20%] h-[30%] w-[30%] rounded-full bg-cyan-400/2 blur-[80px] animate-drift-slowest" />
      <div className="absolute top-[-5%] right-[40%] h-[20%] w-[20%] rounded-full bg-amber-500/2 blur-[60px] animate-drift-slow" />
    </div>
  );
}
