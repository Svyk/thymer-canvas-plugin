'use strict';
/*
 * Plexus Canvas — native Thymer infinite-canvas whiteboard (from scratch, no @excalidraw).
 * Hand-written single-file plugin.js during early phases; deploys via MCP update_plugin_code
 * while small, then git -> Plugins-Manager once vendored libs push it past the MCP-push ceiling.
 *
 * Build order follows ~/plexus/CANVAS-ROADMAP.md. This file currently implements:
 *   Phase 0 — skeleton + custom panel + command + hot-reload-safe singleton dispose.
 *
 * Rules honored (thymer-plugin-dev/SKILL.md):
 *   45  primary surface = registerCustomPanelType + createPanel + navigateToCustomType (not sidebar widget)
 *   53  custom-panel content roots get a 2-class-specificity bg + CORE theme tokens only
 *   21/27 hot-reload re-runs onLoad without disposing the prior instance -> window-singleton + dispose
 *   29  Thymer editor is custom; our own <canvas>/<textarea> live only inside our panel element
 */

const PLEXUS_VERSION = '0.0.1';
const PANEL_ID = 'plexus-canvas';

/* ───────────────────────── hot-reload singleton ─────────────────────────
 * Every disposable resource (RAF, observers, listeners, intervals, events.on
 * handles) registers a disposer here. The previous instance is disposed at the
 * TOP of onLoad so a hot-reload never leaks a second RAF loop fighting one canvas.
 */
function freshRegistry() {
  return {
    disposers: [],
    add(fn) { if (typeof fn === 'function') this.disposers.push(fn); return fn; },
    dispose() { for (const d of this.disposers.splice(0)) { try { d(); } catch (_e) {} } },
  };
}

class Plugin extends AppPlugin {
  onLoad() {
    // Dispose any leaked prior instance (rules 21/27).
    try { window.__plexusCanvas && window.__plexusCanvas.dispose(); } catch (_e) {}

    const reg = freshRegistry();
    this._reg = reg;
    window.__plexusCanvas = { version: PLEXUS_VERSION, dispose: () => reg.dispose() };

    console.log(
      '%c[Plexus Canvas] v' + PLEXUS_VERSION + ' loaded',
      'color:#7c5cff;font-weight:bold',
    );

    // Base CSS injected from JS (rule 53: 2-class specificity, CORE theme tokens only).
    this.ui.injectCSS(BASE_CSS);

    // The canvas lives in ONE custom panel (rule 45).
    this.ui.registerCustomPanelType(PANEL_ID, (panel) => this._mountPanel(panel));

    // Command: open a canvas panel beside the active one.
    this.ui.addCommandPaletteCommand({
      label: 'Plexus: Open Canvas',
      icon: 'ti-pencil',
      onSelected: () => this._openCanvasPanel(),
    });
  }

  onUnload() {
    try { this._reg && this._reg.dispose(); } catch (_e) {}
    window.__plexusCanvas = undefined;
  }

  async _openCanvasPanel() {
    const here = this.ui.getActivePanel();
    const panel = await this.ui.createPanel(here ? { afterPanel: here } : undefined);
    if (panel) panel.navigateToCustomType(PANEL_ID);
  }

  _mountPanel(panel) {
    panel.setTitle('Plexus');
    const host = panel.getElement();
    host.innerHTML = '';
    host.classList.add('pxc-host');

    const root = document.createElement('div');
    root.className = 'pxc-root';
    const msg = document.createElement('div');
    msg.className = 'pxc-empty';
    msg.innerHTML =
      'Plexus Canvas<br><small>v' + PLEXUS_VERSION + ' — Phase 0 skeleton</small>';
    root.appendChild(msg);
    host.appendChild(root);
  }
}

/* CORE theme tokens only — never the SDK aliases (--bg-default etc.), which are
 * undefined on custom themes. 2-class specificity so Thymer's dark panel default loses. */
const BASE_CSS = `
.pxc-host { position: relative; }
.pxc-host .pxc-root {
  position: absolute; inset: 0;
  background: var(--color-bg-900);
  color: var(--color-text-400);
  font-family: var(--font-family, system-ui, sans-serif);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.pxc-host .pxc-empty { text-align: center; opacity: .65; font-size: 14px; line-height: 1.6; }
.pxc-host .pxc-empty small { opacity: .7; }
`;
