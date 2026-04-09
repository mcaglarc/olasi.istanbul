(() => {
  const ADSENSE_CLIENT = "ca-pub-9036855632049616";
  const ADSENSE_SLOT = "";
  const MIN_AD_WIDTH = 240;

  if (!document.body || !document.body.classList.contains("content-body")) return;

  function ensureAdsenseScript() {
    if (!ADSENSE_SLOT) return;
    if (document.querySelector('script[data-content-adsense="true"]')) return;

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
    script.crossOrigin = "anonymous";
    script.dataset.contentAdsense = "true";
    document.head.appendChild(script);
  }

  function createDock() {
    const dock = document.createElement("aside");
    dock.className = "content-ad-dock";
    dock.innerHTML = `
      <button class="content-ad-toggle" type="button" aria-expanded="true" aria-label="Sponsorlu alanı gizle">Sponsorlu alanı gizle</button>
      <div class="content-ad-shell">
        <span class="content-ad-label">Sponsorlu</span>
        <div class="content-ad-body"></div>
      </div>
    `;

    const toggle = dock.querySelector(".content-ad-toggle");
    const shell = dock.querySelector(".content-ad-shell");
    const body = dock.querySelector(".content-ad-body");
    let collapsed = false;

    function renderBody() {
      const dockWidth = Math.round(shell.getBoundingClientRect().width || 0);
      const canRenderAd = ADSENSE_SLOT && dockWidth >= MIN_AD_WIDTH;

      body.innerHTML = "";

      if (canRenderAd) {
        const ins = document.createElement("ins");
        ins.className = "adsbygoogle content-adsense-unit";
        ins.style.display = "block";
        ins.dataset.adClient = ADSENSE_CLIENT;
        ins.dataset.adSlot = ADSENSE_SLOT;
        ins.dataset.adFormat = "auto";
        ins.dataset.fullWidthResponsive = "true";
        body.appendChild(ins);
        if (window.adsbygoogle && !ins.dataset.loaded) {
          try {
            window.adsbygoogle.push({});
            ins.dataset.loaded = "true";
          } catch (error) {
            console.error("Content Adsense init failed", error);
          }
        }
        return;
      }

      const note = document.createElement("p");
      note.className = "content-ad-note";
      note.textContent = ADSENSE_SLOT
        ? "Sponsorlu alan bu genişlikte gösterilmiyor."
        : "AdSense slot tanımlandığında bu alan içerik sayfalarında sabit reklam olarak gösterilecek.";
      body.appendChild(note);
    }

    toggle.addEventListener("click", () => {
      collapsed = !collapsed;
      dock.classList.toggle("is-collapsed", collapsed);
      shell.hidden = collapsed;
      toggle.textContent = collapsed ? "Sponsorlu alanı göster" : "Sponsorlu alanı gizle";
      toggle.setAttribute("aria-expanded", String(!collapsed));
      toggle.setAttribute("aria-label", collapsed ? "Sponsorlu alanı göster" : "Sponsorlu alanı gizle");
      if (!collapsed) renderBody();
    });

    const observer = new ResizeObserver(() => {
      if (!collapsed) renderBody();
    });

    observer.observe(shell);
    renderBody();
    document.body.appendChild(dock);
  }

  ensureAdsenseScript();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createDock, { once: true });
  } else {
    createDock();
  }
})();
