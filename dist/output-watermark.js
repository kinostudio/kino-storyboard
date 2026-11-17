(function () {
  "use strict";
  const defaults = Object.freeze({enabled:false,type:"text",text:"僅供審閱",image:"",color:"#24334e",opacity:15,size:40,x:50,y:50,rotation:-30});

  function html(value) {
    const mark = Object.assign({},defaults,value);
    if (!mark.enabled || !(mark.type === "image" ? mark.image : mark.text.trim())) return "";
    const layer = document.createElement("div");
    layer.className = "output-watermark";
    layer.setAttribute("aria-hidden","true");
    layer.style.opacity = String(mark.opacity / 100);
    const content = document.createElement(mark.type === "image" ? "img" : "span");
    content.className = "output-watermark-content";
    if (mark.type === "image") {
      content.classList.add("output-real-image");
      content.src = mark.image;
      content.alt = "";
      content.style.width = mark.size + "%";
    } else {
      content.textContent = mark.text;
      content.style.color = mark.color;
      content.style.fontSize = "calc(" + mark.size * .7 + "pt * var(--page-scale))";
    }
    content.style.left = mark.x + "%";
    content.style.top = mark.y + "%";
    content.style.transform = "translate(-50%,-50%) rotate(" + mark.rotation + "deg)";
    layer.appendChild(content);
    return layer.outerHTML;
  }

  async function readImage(file) {
    const policy = DirectorStoryboardPhotoImport.PHOTO_IMPORT_POLICY;
    if (!file || !file.size || file.size > policy.maxBytes) throw new Error("請選擇 20 MiB 以內的 PNG、JPEG 或 WebP 圖片。");
    DirectorStoryboardPhotoImport.validateHeader(new Uint8Array(await file.arrayBuffer()));
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      for (const limit of [1024,512]) {
        const scale = Math.min(1,limit / Math.max(image.naturalWidth,image.naturalHeight));
        canvas.width = Math.max(1,Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1,Math.round(image.naturalHeight * scale));
        canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
        const data = canvas.toDataURL("image/png");
        if (data.length <= 1024 * 1024) return data;
      }
      throw new Error("浮水印圖片過於複雜，請改用較簡單的 LOGO 圖片。");
    } finally { URL.revokeObjectURL(url); }
  }
  window.OutputWatermark = Object.freeze({defaults,html,readImage});
})();
