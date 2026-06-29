# Mermaid AWS logos in yzane "Markdown PDF" exports

The architecture docs (`docs/Architecture-Design.md`, `demo/docs/Demo-Architecture.md`,
`v3/docs/Architecture-V3.md`, and `v3/README.md`)
use Mermaid `flowchart` nodes whose icons come from the iconify **`logos`** pack
(`id@{ icon: "logos:aws-…" }`). The VS Code markdown preview registers that pack, so
the logos show. The yzane **Markdown PDF** extension loads a plain mermaid build that
**never calls `registerIconPacks`**, so on export those icons become blue `?` boxes.

## Fix: a path-independent CDN shim in `.vscode/settings.json`

The extension's only JS-injection seam is `markdown-pdf.mermaidServer` (the
`<script src>` it puts in the export). We set it to a `data:text/javascript;base64,…`
URI — a tiny shim that `document.write`s two tags: mermaid 11 from jsDelivr, then
`registerIconPacks` for the `logos` pack.

Decoded shim:

```js
document.write('<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"><\/script>');
document.write('<script>mermaid.registerIconPacks([{name:"logos",loader:function(){return fetch("https://cdn.jsdelivr.net/npm/@iconify-json/logos@1/icons.json").then(function(r){return r.json();});}}]);<\/script>');
```

**Why a data: URI and not a local file:** the export embeds the setting value verbatim.
A `file:///home/...` path is a *Linux* path — it fails to load when the HTML is opened in
a **Windows** browser (the default on WSL), so nothing renders. The data: URI carries no
path, so the export opens the same in a Windows browser, a Linux browser, or a copy sent
to someone else. It needs internet at view time (CDN), same as the extension's old default.

To change the CDN-loaded mermaid/icon versions, edit the shim above and re-encode:

```bash
printf '%s' '<shim one-liner>' | base64 -w0
```

then paste `data:text/javascript;base64,<output>` back into the setting.

## After changing the setting

Reload the VS Code window, then re-run *Markdown PDF: Export (html)*. Re-export any
existing `.html` files so they pick up the new mermaid source.
