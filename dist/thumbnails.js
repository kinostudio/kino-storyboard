(function (root) {
  "use strict";
  const memory = new Map();
  const pending = new Map();
  let queue = Promise.resolve();
  async function build(key, load) {
    let cache;
    try { cache = await caches.open("kino-thumbnails-v1"); } catch (_) { /* Private browsing may disable persistent cache. */ }
    if (cache) {
      const hit = await cache.match(key);
      if (hit && hit.headers.get("content-type") === "image/jpeg") {
        const blob = await hit.blob();
        if (blob.size > 0 && blob.size <= 1024 * 1024) return blob;
      }
    }
    const photo = await load();
    const source = photo.originalBlob;
    root.DirectorStoryboardPhotoImport.validateHeader(new Uint8Array(await source.arrayBuffer()));
    const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
    let blob;
    try {
      const scale = Math.min(1, 960 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", .82));
      canvas.width = canvas.height = 1;
      if (!blob) throw new Error("縮圖產生失敗。");
    } finally { bitmap.close(); }
    if (cache) {
      try {
        await cache.put(key, new Response(blob, { headers: { "Content-Type": "image/jpeg" } }));
        const keys = await cache.keys();
        for (const old of keys.slice(0, Math.max(0, keys.length - 64))) await cache.delete(old);
      } catch (_) { /* A disposable cache must not prevent viewing verified assets. */ }
    }
    return blob;
  }
  root.KinoThumbnails = Object.freeze({
    get(projectId, metadata, load) {
      if (!metadata || !/^[a-f0-9]{64}$/.test(metadata.sha256)) return Promise.reject(new Error("縮圖來源無效。"));
      const key = new URL("./__thumbnail__/" + encodeURIComponent(projectId) + "/" + metadata.sha256, location.href).href;
      if (memory.has(key)) return Promise.resolve(memory.get(key));
      if (pending.has(key)) return pending.get(key);
      const task = queue.catch(() => {}).then(() => build(key, load)).then(blob => {
        memory.set(key, blob);
        while (memory.size > 24) memory.delete(memory.keys().next().value);
        return blob;
      }).finally(() => pending.delete(key));
      pending.set(key, task);
      queue = task;
      return task;
    }
  });
})(window);
