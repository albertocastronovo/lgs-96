(() => {
  "use strict";

  const cache = globalThis.LgsCache;
  const toggle = document.getElementById("cache-toggle");
  const countLabel = document.getElementById("cache-count");
  const clearButton = document.getElementById("clear-cache");

  function formatCount(count) {
    return count === 1 ? "Cached jobs: 1" : `Cached jobs: ${count}`;
  }

  async function refreshCount() {
    countLabel.textContent = formatCount(await cache.getCacheSize());
  }

  async function init() {
    if (!cache) {
      toggle.disabled = true;
      clearButton.disabled = true;
      countLabel.textContent = "Cache unavailable";
      return;
    }

    toggle.checked = await cache.getCacheEnabled();
    await refreshCount();

    toggle.addEventListener("change", async () => {
      await cache.setCacheEnabled(toggle.checked);
      await refreshCount();
    });

    clearButton.addEventListener("click", async () => {
      clearButton.disabled = true;
      await cache.clearCache();
      await refreshCount();
      clearButton.disabled = false;
    });
  }

  init();
})();
