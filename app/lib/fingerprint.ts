export function getDeviceFingerprint(): string {
  if (typeof window === "undefined") return "server";

  const parts: string[] = [];

  try {
    const screenInfo = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
    parts.push(screenInfo);
  } catch {}

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    parts.push(tz);
  } catch {}

  try {
    parts.push(navigator.language || "");
  } catch {}

  try {
    parts.push(navigator.platform || "");
  } catch {}

  try {
    const cores = navigator.hardwareConcurrency;
    if (cores) parts.push(`cpu:${cores}`);
  } catch {}

  try {
    if ((navigator as any).deviceMemory) {
      parts.push(`mem:${(navigator as any).deviceMemory}`);
    }
  } catch {}

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillStyle = "#f60";
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("sky-drop", 2, 15);
      ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
      ctx.fillText("fp", 4, 17);
      parts.push(canvas.toDataURL());
    }
  } catch {}

  let hash = 0;
  const str = parts.join("|");
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function getClientIp(): string {
  return "client";
}
