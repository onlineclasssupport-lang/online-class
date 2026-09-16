(() => {
  const isProtectedCareerPathwayPdf = (iframe) => {
    if (!(iframe instanceof HTMLIFrameElement)) return false;
    const src = iframe.getAttribute('src') || '';
    const className = iframe.getAttribute('class') || '';
    return src.includes('/api/stream/') && className.includes('oc-career-pathway-pdf');
  };

  const normalize = (root) => {
    if (!(root instanceof Element || root instanceof Document)) return;
    const frames = root.querySelectorAll
      ? root.querySelectorAll('iframe.oc-career-pathway-pdf[src*="/api/stream/"]')
      : [];

    frames.forEach((iframe) => {
      // Chromium can block its built-in PDF viewer when it is loaded inside
      // a sandboxed iframe. The protected stream already has signed access,
      // so sandboxing the browser's native PDF viewer is unnecessary here.
      if (iframe.hasAttribute('sandbox')) {
        iframe.removeAttribute('sandbox');
      }
    });
  };

  const start = () => {
    normalize(document);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== 'childList') continue;
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (isProtectedCareerPathwayPdf(node)) {
            node.removeAttribute('sandbox');
          }
          normalize(node);
        });
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
