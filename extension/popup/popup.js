(() => {
  "use strict";

  const cache = globalThis.LgsCache;
  const cloudCache = globalThis.LgsCloudCache;
  const toggle = document.getElementById("cache-toggle");
  const cloudToggle = document.getElementById("cloud-toggle");
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
    } else {
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

    if (!cloudCache) {
      cloudToggle.disabled = true;
      return;
    }
    cloudToggle.checked = await cloudCache.getCloudCacheEnabled();
    cloudToggle.addEventListener("change", async () => {
      await cloudCache.setCloudCacheEnabled(cloudToggle.checked);
    });
  }

  init();
})();
