/** Fixed, data-independent scripts allowed by hash only on their preview routes. */
export const STATEMENT_TOGGLE_SCRIPT = `
(function () {
  window.toggleLayer = function (whichLayer) {
    var elem = document.getElementById(whichLayer);
    if (!elem) return false;
    var currentDisplay = elem.style.display || window.getComputedStyle(elem).display;
    elem.style.display = currentDisplay === "none" ? "block" : "none";
    return false;
  };

  document.addEventListener("click", function (event) {
    var target = event.target;
    var link = target && target.closest ? target.closest("a[href^='javascript:toggleLayer']") : null;
    if (!link) return;

    var href = link.getAttribute("href") || "";
    var match = href.match(/toggleLayer\\((?:'|")?([^'")]+)(?:'|")?\\)/);
    if (!match || !match[1]) return;

    event.preventDefault();
    window.toggleLayer(match[1]);
  });
})();
`;

export const SCENARIO_FIT_SCRIPT = `function fit(){const s=Math.max(0.01,Math.min(1,(innerWidth-24)/794)),c=document.querySelector('.preview-scale'),h=document.querySelector('.preview-holder');if(!c||!h)return;c.style.transform='scale('+s+')';h.style.width=794*s+'px';h.style.height=c.scrollHeight*s+'px'}fit();addEventListener('load',fit);addEventListener('resize',fit);`;
