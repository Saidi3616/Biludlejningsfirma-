// Genererer app-ikonerne (PWA, Apple, favicon) ud fra ét SVG-logo. Kør: node scripts/generate-icons.mjs
// Logoet er en pladsholder (bil-ikonet fra headeren) indtil virksomheden leverer sit eget.
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const BRAND = "#114853"; // --color-brand-700
const CAR = `
  <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
  <circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>`;

/** `inset` = hvor stor en del af fladen bilen fylder; `radius` = afrundede hjørner (0 = fuld flade). */
function logo({ inset, radius }) {
  const size = 512;
  const scale = (size * inset) / 24;
  const offset = (size - 24 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${BRAND}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${CAR}
  </g>
</svg>
`;
}

const rounded = logo({ inset: 0.68, radius: 96 });
// Maskable/Apple: fuld flade; styresystemet beskærer selv, så bilen holdes inden for midten.
const fullBleed = logo({ inset: 0.56, radius: 0 });

async function png(svg, size, file) {
  await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
}

/** ICO-fil med ét indlejret PNG-billede (understøttet af alle nuværende browsere). */
async function ico(svg, size, file) {
  const data = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(size, 6);
  header.writeUInt8(size, 7);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(data.length, 14);
  header.writeUInt32LE(22, 18);
  await writeFile(file, Buffer.concat([header, data]));
}

await mkdir("public/icons", { recursive: true });
await writeFile("src/app/icon.svg", rounded);
await png(rounded, 192, "public/icons/icon-192.png");
await png(rounded, 512, "public/icons/icon-512.png");
await png(fullBleed, 512, "public/icons/icon-maskable-512.png");
await png(fullBleed, 180, "public/icons/apple-touch-icon.png");
await ico(rounded, 32, "src/app/favicon.ico");
console.log("Ikoner genereret.");
