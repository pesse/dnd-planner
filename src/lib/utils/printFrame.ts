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
  setTimeout(() => {
    const prev = document.title;
    document.title = title;
    iframe.contentWindow!.focus();
    iframe.contentWindow!.print();
    document.title = prev;
    setTimeout(() => document.body.removeChild(iframe), 2000);
  }, 0);
}
