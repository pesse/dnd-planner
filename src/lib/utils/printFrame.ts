/**
 * Druckt ein fertiges HTML-Dokument. Der unsichtbare Iframe umgeht Sveltes CSS-Scoping,
 * `document.title` ist der Dateiname, den der PDF-Druck vorschlägt.
 */
export function printHtmlDocument(html: string, title: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open(); doc.write(html); doc.close();
  void imagesSettled(doc).then(() => {
    const prev = document.title;
    document.title = title;
    iframe.contentWindow!.focus();
    iframe.contentWindow!.print();
    document.title = prev;
    setTimeout(() => document.body.removeChild(iframe), 2000);
  });
}

// Sonst druckt der Dialog, bevor Kartenbilder und Porträt geladen sind.
function imagesSettled(doc: Document): Promise<unknown> {
  return Promise.all(
    Array.from(doc.images, (img) =>
      img.complete
        ? null
        : new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          }),
    ),
  );
}
