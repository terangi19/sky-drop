"use client";

import React from "react";

interface AnimatedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

export default function AnimatedButton({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: AnimatedButtonProps) {
  const baseStyles = "inline-flex items-center justify-center gap-2 font-bold rounded-xl transition-all duration-300 ease-out active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent";
  
  const variantStyles = {
    primary: "bg-gradient-to-r from-sky-500 to-sky-400 text-white shadow-lg shadow-sky-500/20 hover:shadow-xl hover:shadow-sky-500/30 hover:brightness-110 hover:-translate-y-0.5",
    secondary: "border border-white/[0.10] bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06] hover:border-white/[0.15] hover:text-white hover:-translate-y-0.5",
    danger: "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20 hover:shadow-xl hover:shadow-red-500/30 hover:brightness-110 hover:-translate-y-0.5",
    ghost: "text-zinc-400 hover:text-white hover:bg-white/[0.05] hover:-translate-y-0.5",
  };
  
  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2.5 text-sm",
    lg: "px-6 py-3.5 text-base",
  };
  
  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
