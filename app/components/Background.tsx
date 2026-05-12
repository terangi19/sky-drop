"use client";

export default function Background() {

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">

      {/* BASE */}
      <div className="absolute inset-0 bg-[#0d1014]" />

      {/* SOFT TOP LIGHT */}
      <div className="absolute inset-x-0 top-0 h-[300px] bg-gradient-to-b from-sky-500/[0.03] to-transparent" />

      {/* LEFT AMBIENT */}
      <div className="absolute left-[-200px] top-[120px] h-[420px] w-[420px] rounded-full bg-sky-500/[0.025] blur-[140px]" />

      {/* RIGHT AMBIENT */}
      <div className="absolute right-[-200px] top-[260px] h-[420px] w-[420px] rounded-full bg-white/[0.015] blur-[160px]" />

      {/* SOFT NOISE */}
      <div
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.5) 0.5px, transparent 0.5px)",
          backgroundSize: "26px 26px",
        }}
      />

      {/* VIGNETTE */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_10%,rgba(0,0,0,0.45)_100%)]" />

    </div>
  );
}