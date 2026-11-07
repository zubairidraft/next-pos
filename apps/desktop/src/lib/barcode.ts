// Barcode drawing for printed labels: EAN-13 for 13-digit codes with a valid
// check digit (shop and most manufacturer codes), Code 128 (set B) for anything else.
// Returns the bar pattern as a string of "1" (bar) and "0" (space) modules.

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function ean13CheckDigit(body12: string): number {
  const sum = body12.split("").reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

export function ean13Modules(code: string): string {
  const d = code.split("").map(Number);
  const parity = PARITY[d[0]];
  let m = "101";
  for (let i = 1; i <= 6; i++) m += (parity[i - 1] === "L" ? L : G)[d[i]];
  m += "01010";
  for (let i = 7; i <= 12; i++) m += R[d[i]];
  return m + "101";
}

// Code 128 bar/space widths for values 0..106 (106 = stop, 7 elements).
const C128 = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

function widthsToModules(w: string): string {
  let m = "";
  for (let i = 0; i < w.length; i++) m += (i % 2 === 0 ? "1" : "0").repeat(Number(w[i]));
  return m;
}

export function code128Modules(text: string): string {
  const values = [104]; // Start B
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) throw new Error("Barcode can only contain plain letters, digits and symbols");
    values.push(c - 32);
  }
  const check = values.reduce((s, v, i) => s + v * (i === 0 ? 1 : i), 0) % 103;
  values.push(check, 106);
  return values.map((v) => widthsToModules(C128[v])).join("");
}

export function barcodeModules(code: string): { modules: string; kind: "EAN-13" | "Code 128" } {
  return isValidEan13(code) ? { modules: ean13Modules(code), kind: "EAN-13" } : { modules: code128Modules(code), kind: "Code 128" };
}

/** SVG markup of the bars (with quiet zones), scaled to the given width in mm. */
export function barcodeSvg(code: string, widthMm: number, heightMm: number): string {
  const { modules } = barcodeModules(code);
  const quiet = 10;
  const total = modules.length + quiet * 2;
  let rects = "";
  let i = 0;
  while (i < modules.length) {
    if (modules[i] === "1") {
      let j = i;
      while (j < modules.length && modules[j] === "1") j++;
      rects += `<rect x="${i + quiet}" y="0" width="${j - i}" height="100"/>`;
      i = j;
    } else i++;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 100" width="${widthMm}mm" height="${heightMm}mm" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="${total}" height="100" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}
