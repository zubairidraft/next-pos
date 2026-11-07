// Printing one part of the screen (a receipt, a statement, a report) through
// the Windows printer driver. The part is copied into a hidden frame with the
// app's styles, so only that part is printed, not the whole window.

/** Paper for a thermal receipt roll: printable width is about 48 mm / 72 mm. */
export function receiptPage(width: "58mm" | "80mm") {
  const content = width === "80mm" ? 72 : 48;
  return {
    page: `size: ${width} auto; margin: 0;`,
    body: `body { width: ${content}mm; margin: 0 auto; padding: 2mm 0; font-size: ${width === "80mm" ? 12 : 10.5}px; }`,
  };
}

export const A4_PAGE = { page: "size: A4; margin: 12mm;", body: "body { font-size: 11px; }" };
export const A4_LANDSCAPE = { page: "size: A4 landscape; margin: 10mm;", body: "body { font-size: 10px; }" };

function copyStyles(): string {
  return Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((n) => {
      if (n instanceof HTMLLinkElement) return `<link rel="stylesheet" href="${n.href}">`;
      return n.outerHTML;
    })
    .join("\n");
}

/** Print the given HTML on its own page, with the app's styles. */
export function printHtml(html: string, opts: { page: string; body?: string; title?: string }): Promise<void> {
  return new Promise((resolve) => {
    const before = document.activeElement as HTMLElement | null;
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(`<!doctype html><html class="light"><head><meta charset="utf-8"><title>${opts.title || "Next POS"}</title>
${copyStyles()}
<style>
  @page { ${opts.page} }
  html, body { background: #fff !important; color: #000 !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-print { display: none !important; }
  ${opts.body || ""}
</style></head><body>${html}</body></html>`);
    doc.close();

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      setTimeout(() => frame.remove(), 500);
      resolve();
    };
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      const w = frame.contentWindow!;
      w.addEventListener("afterprint", cleanup);
      w.focus();
      w.print();
      // Give the keyboard back to the screen (the frame took it for printing).
      setTimeout(() => {
        window.focus();
        if (before && document.contains(before)) before.focus();
      }, 200);
      // Some systems never send "afterprint".
      setTimeout(cleanup, 60_000);
    };
    // Wait for the copied stylesheets (and fonts) before printing.
    const links = Array.from(doc.querySelectorAll("link[rel=stylesheet]")) as HTMLLinkElement[];
    const pending = links.filter((l) => !l.sheet);
    if (!pending.length) setTimeout(go, 150);
    else {
      let left = pending.length;
      const one = () => --left <= 0 && setTimeout(go, 150);
      pending.forEach((l) => {
        l.addEventListener("load", one);
        l.addEventListener("error", one);
      });
      setTimeout(go, 3000);
    }
  });
}

/** Print one element of the page. */
export function printElement(el: HTMLElement, opts: { page: string; body?: string; title?: string }) {
  return printHtml(el.outerHTML, opts);
}
