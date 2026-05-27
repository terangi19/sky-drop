import sharp from "sharp";
import { writeFileSync } from "fs";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#111118" rx="64"/>
  <path d="M85 128c0 117 48 224 128 256s128-139 128-256H85z" fill="#0ea5e9"/>
  <path d="M85 128c0 117 48 224 128 256s128-139 128-256" fill="none" stroke="white" stroke-width="12" opacity="0.8"/>
  <line x1="149" y1="170" x2="213" y2="341" stroke="white" stroke-width="8" opacity="0.6"/>
  <line x1="256" y1="128" x2="256" y2="341" stroke="white" stroke-width="8" opacity="0.6"/>
  <line x1="363" y1="170" x2="299" y2="341" stroke="white" stroke-width="8" opacity="0.6"/>
</svg>`;

await sharp(Buffer.from(svg)).resize(192, 192).png().toFile("public/icon-192.png");
await sharp(Buffer.from(svg)).resize(512, 512).png().toFile("public/icon-512.png");
console.log("Icons generated");
