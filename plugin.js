'use strict';
/*
 * Plexus Canvas — native Thymer infinite-canvas whiteboard (from scratch, no @excalidraw).
 * Hand-written single-file plugin.js during early phases; deploys via MCP update_plugin_code
 * while small, then git -> Plugins-Manager once vendored libs push it past the MCP-push ceiling.
 *
 * Build order follows ~/plexus/CANVAS-ROADMAP.md. Implemented so far:
 *   Phase 0  — skeleton + custom panel + command + hot-reload-safe singleton dispose.
 *   Phase 1a — Thymer-envelope SPIKE: verify the 4 SDK blockers + blob ceiling LIVE via
 *              window.__plexusCanvas.spike.* (driven from chrome-devtools). Removed once signed off.
 *
 * Rules honored (thymer-plugin-dev/SKILL.md): 45, 53, 21/27, 29, 1 (no invented panel-context channel).
 */

const PLEXUS_VERSION = '0.1.0';
const PANEL_ID = 'plexus-canvas';
const SPIKE_PANEL_ID = 'plexus-spike';
const SPIKE_ENABLED = true; // Phase 1a only

function freshRegistry() {
  return {
    disposers: [],
    add(fn) { if (typeof fn === 'function') this.disposers.push(fn); return fn; },
    dispose() { for (const d of this.disposers.splice(0)) { try { d(); } catch (_e) {} } },
  };
}

class Plugin extends AppPlugin {
  onLoad() {
    try { window.__plexusCanvas && window.__plexusCanvas.dispose(); } catch (_e) {}

    const reg = freshRegistry();
    this._reg = reg;
    // Plugin-instance pending-context map (Blocker #2 — NOT a property on the panel object, rule 1).
    this._pending = new Map();
    this._spikeMount = null;

    window.__plexusCanvas = {
      version: PLEXUS_VERSION,
      dispose: () => reg.dispose(),
    };

    console.log('%c[Plexus Canvas] v' + PLEXUS_VERSION + ' loaded',
      'color:#7c5cff;font-weight:bold');

    this.ui.injectCSS(BASE_CSS);
    this.ui.registerCustomPanelType(PANEL_ID, (panel) => this._mountPanel(panel));

    this.ui.addCommandPaletteCommand({
      label: 'Plexus: Open Canvas',
      icon: 'ti-pencil',
      onSelected: () => this._openCanvasPanel(),
    });

    if (SPIKE_ENABLED) this._installSpike();
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
    msg.innerHTML = 'Plexus Canvas<br><small>v' + PLEXUS_VERSION + ' — skeleton</small>';
    root.appendChild(msg);
    host.appendChild(root);
  }

  /* ───────────────────────────── PHASE 1a SPIKE ─────────────────────────────
   * Ground-truth verification of the adversarial-review blockers, run live from
   * chrome-devtools: window.__plexusCanvas.spike.{createRecord,panelContext,blob}().
   */
  _installSpike() {
    // A separate spike panel type whose mount reads the pending-context map (Blocker #2/#3).
    this.ui.registerCustomPanelType(SPIKE_PANEL_ID, (panel) => {
      const token = this._pendingToken;
      const dequeued = token != null ? this._pending.get(token) : undefined;
      let getActiveRecordInPanel = 'unsupported';
      try {
        const r = panel.getActiveRecord && panel.getActiveRecord();
        getActiveRecordInPanel = r ? (r.guid || 'has-record-no-guid') : null;
      } catch (e) { getActiveRecordInPanel = 'threw:' + e; }
      this._spikeMount = {
        tokenPresent: token != null,
        dequeuedGuid: dequeued === undefined ? null : dequeued,
        tokenStillInMap: token != null ? this._pending.has(token) : false,
        getActiveRecordInPanel,
        panelHasElement: !!(panel.getElement && panel.getElement()),
      };
      if (token != null) this._pending.delete(token);
      try {
        panel.setTitle('Plexus spike');
        panel.getElement().innerHTML =
          '<div style="padding:18px;background:var(--color-bg-900);color:var(--color-text-400)">spike mount ok</div>';
      } catch (_e) {}
    });

    const spike = {
      // Blocker #1: createNewRecord is null on a global AppPlugin; collection.createRecord works.
      createRecord: async () => {
        const out = {};
        try {
          const r = await this.data.createNewRecord('Plexus spike (delete me)');
          out.createNewRecord_returned = r === null ? 'null' : (r && r.guid) ? 'record:' + r.guid : typeof r;
        } catch (e) { out.createNewRecord_threw = String(e); }
        out.createNewRecord_isNullAsRoadmapClaims = out.createNewRecord_returned === 'null';
        let cols = [];
        try { cols = await this.data.getAllCollections(); } catch (e) { out.getAllCollections_threw = String(e); }
        out.collectionCount = Array.isArray(cols) ? cols.length : typeof cols;
        let target = null;
        try { target = (cols || []).find((c) => c.getName && c.getName() === 'Examples') || (cols || [])[0]; } catch (_e) {}
        out.targetCollection = target && target.getName ? target.getName() : null;
        let guid = null;
        try { guid = target.createRecord('Plexus spike (delete me)'); } catch (e) { out.createRecord_threw = String(e); }
        out.createRecord_returnedType = typeof guid;
        out.createRecord_guid = typeof guid === 'string' ? guid : (guid === null ? 'null' : JSON.stringify(guid));
        if (typeof guid === 'string') {
          try {
            const rec = await this.data.getRecord(guid);
            out.getRecord_ok = !!rec;
            out.getRecord_name = rec && rec.getName ? rec.getName() : null;
          } catch (e) { out.getRecord_threw = String(e); }
        }
        return out;
      },

      // Blocker #2/#3: pending-context map survives the mount; getActiveRecord is null in a custom panel.
      panelContext: async () => {
        const out = {};
        const token = 't' + Date.now().toString(36) + Math.floor(performance.now()).toString(36);
        let editorGuid = null;
        try {
          const active = this.ui.getActivePanel();
          const r = active && active.getActiveRecord && active.getActiveRecord();
          editorGuid = r ? (r.guid || 'has-record-no-guid') : null;
        } catch (e) { out.activePanel_threw = String(e); }
        out.editorActiveRecordGuid = editorGuid;
        this._pending.set(token, editorGuid || 'NO_EDITOR_RECORD');
        this._pendingToken = token;
        this._spikeMount = null;
        let panel = null;
        try {
          const here = this.ui.getActivePanel();
          panel = await this.ui.createPanel(here ? { afterPanel: here } : undefined);
        } catch (e) { out.createPanel_threw = String(e); }
        out.panelCreated = !!panel;
        if (panel) { try { panel.navigateToCustomType(SPIKE_PANEL_ID); } catch (e) { out.navigate_threw = String(e); } }
        for (let i = 0; i < 30 && this._spikeMount == null; i++) await new Promise((r) => setTimeout(r, 50));
        out.mount = this._spikeMount;
        out.pendingMapSurvived = !!(this._spikeMount && this._spikeMount.dequeuedGuid !== null);
        out.getActiveRecordNullInPanel = !!(this._spikeMount && this._spikeMount.getActiveRecordInPanel === null);
        if (panel) { try { this.ui.closePanel(panel); } catch (_e) {} }
        return out;
      },

      // Blob ceiling: upload + download round-trip timing for a given size (MB).
      blob: async (mb) => {
        const bytes = Math.round(mb * 1024 * 1024);
        const buf = new Uint8Array(bytes);
        for (let i = 0; i < bytes; i += 1024) buf[i] = i & 255;
        const file = new File([buf], 'plexus-spike-' + mb + 'mb.bin', { type: 'application/octet-stream' });
        const out = { mb };
        const t0 = performance.now();
        let blob = null;
        try { blob = await this.data.uploadBlob(file); } catch (e) { out.upload_threw = String(e); }
        out.uploadMs = Math.round(performance.now() - t0);
        out.uploaded = !!blob;
        out.blobGuid = blob && blob.guid;
        out.reportedSize = blob && blob.fileSize;
        if (blob) {
          const t1 = performance.now();
          let ab = null;
          try { ab = await blob.download(); } catch (e) { out.download_threw = String(e); }
          out.downloadMs = Math.round(performance.now() - t1);
          out.downloadedBytes = ab ? ab.byteLength : null;
          out.roundTripOk = ab ? ab.byteLength === bytes : false;
        }
        return out;
      },
    };

    window.__plexusCanvas.spike = spike;
    console.log('[Plexus Canvas] spike installed: window.__plexusCanvas.spike.{createRecord,panelContext,blob}');
  }
}

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
