
// Clear the document background before the embedded viewer's first paint.
if (new URLSearchParams(location.search).get('bg') === 'transparent') {
 document.documentElement.classList.add('transparent');
 // Match the host iframe's scheme so Chrome keeps its composited background clear.
 document.querySelector('meta[name="color-scheme"]').content = 'light';
}
