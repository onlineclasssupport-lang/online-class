(() => {
  // Keep protected Career Pathway document streams usable inside the app.
  // React may set `sandbox` and `src` in either order. Waiting for a
  // MutationObserver is too late because Chromium can start the PDF
  // navigation as soon as `src` is assigned. Intercept the DOM mutations
  // synchronously, then keep the observer as a safety net.
  const isProtectedStreamUrl = (value) => {
    try {
      return String(value || '').includes('/api/stream/');
    } catch {
      return false;
    }
  };

  const removeSandboxIfProtected = (iframe) => {
    if (!(iframe instanceof HTMLIFrameElement)) return;
    if (isProtectedStreamUrl(iframe.getAttribute('src'))) {
      iframe.removeAttribute('sandbox');
    }
  };

  const normalize = (root) => {
    if (!(root instanceof Element || root instanceof Document)) return;
    const frames = root.querySelectorAll
      ? root.querySelectorAll('iframe[src*="/api/stream/"]')
      : [];

    frames.forEach(removeSandboxIfProtected);
  };

  // React normally uses setAttribute/property writes for iframe attributes.
  // Handle both paths before the browser's native PDF viewer gets a chance
  // to commit to a sandboxed navigation.
  const nativeSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function setAttribute(name, value) {
    const attributeName = String(name).toLowerCase();

    if (
      this instanceof HTMLIFrameElement &&
      attributeName === 'sandbox' &&
      isProtectedStreamUrl(this.getAttribute('src'))
    ) {
      return undefined;
    }

    const result = nativeSetAttribute.call(this, name, value);

    if (this instanceof HTMLIFrameElement && attributeName === 'src') {
      removeSandboxIfProtected(this);
    }

    return result;
  };

  const iframeSrcDescriptor = Object.getOwnPropertyDescriptor(
    HTMLIFrameElement.prototype,
    'src',
  );

  if (iframeSrcDescriptor?.set && iframeSrcDescriptor?.get) {
    Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
      configurable: iframeSrcDescriptor.configurable,
      enumerable: iframeSrcDescriptor.enumerable,
      get: iframeSrcDescriptor.get,
      set(value) {
        iframeSrcDescriptor.set.call(this, value);
        removeSandboxIfProtected(this);
      },
    });
  }

  const start = () => {
    normalize(document);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== 'childList') continue;
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
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
