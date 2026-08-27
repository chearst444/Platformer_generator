// ===========================================================
// AssetScriptManager — sidebar file tree for every ingested
// asset (scripts/overlays/styles/python). Lets you toggle,
// inline-edit, re-run (Python) or delete each one without
// re-dragging the file.
// ===========================================================

import { bus } from '../state/eventBus.js';

const GROUPS = [
  { category: 'scripts', label: 'Scripts (.js)' },
  { category: 'overlays', label: 'Overlays (.html)' },
  { category: 'styles', label: 'Styles (.css)' },
  { category: 'python', label: 'Python (.py)' },
];

export class AssetScriptManager {
  constructor({ ingestionManager }) {
    this.ingestionManager = ingestionManager;
    this.root = document.getElementById('asset-tree');
    this.openEditors = new Set();

    this._render();
    bus.on('assets:list-changed', () => this._render());
  }

  _render() {
    const assets = this.ingestionManager.list();
    this.root.innerHTML = '';

    GROUPS.forEach(({ category, label }) => {
      const items = assets.filter((a) => a.category === category);
      const group = document.createElement('div');
      const heading = document.createElement('div');
      heading.className = 'asset-group-label';
      heading.textContent = label;
      group.appendChild(heading);

      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'asset-empty';
        empty.textContent = 'none ingested yet';
        group.appendChild(empty);
      } else {
        items.forEach((asset) => group.appendChild(this._buildRow(asset)));
      }
      this.root.appendChild(group);
    });
  }

  _buildRow(asset) {
    const row = document.createElement('div');
    row.className = 'asset-row' + (asset.enabled ? '' : ' disabled');

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = asset.enabled;
    toggle.title = 'Enable / disable';
    toggle.addEventListener('change', () => this.ingestionManager.toggle(asset.id));

    const name = document.createElement('span');
    name.className = 'asset-name';
    name.textContent = asset.filename;
    name.title = asset.filename;

    const editBtn = button('✎', 'Edit', () => this._toggleEditor(asset, wrap));
    const delBtn = button('✕', 'Delete', () => {
      if (confirm(`Delete "${asset.filename}"?`)) this.ingestionManager.remove(asset.id);
    });
    delBtn.classList.add('danger');

    row.append(toggle, name, editBtn);

    if (asset.category === 'python') {
      const runBtn = button('▶', 'Run script', async () => {
        runBtn.disabled = true;
        await this.ingestionManager.runPython(asset.filename);
        runBtn.disabled = false;
      });
      row.appendChild(runBtn);
    }
    row.appendChild(delBtn);

    const wrap = document.createElement('div');
    wrap.appendChild(row);
    return wrap;
  }

  _toggleEditor(asset, wrap) {
    const existing = wrap.querySelector('.asset-editor-block');
    if (existing) { existing.remove(); return; }

    const block = document.createElement('div');
    block.className = 'asset-editor-block';
    const textarea = document.createElement('textarea');
    textarea.className = 'asset-editor';
    textarea.value = asset.content;
    textarea.spellcheck = false;
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-small';
    saveBtn.textContent = 'Save + Apply';
    saveBtn.addEventListener('click', () => {
      this.ingestionManager.updateContent(asset.id, textarea.value);
      block.remove();
    });
    block.append(textarea, saveBtn);
    wrap.appendChild(block);
  }
}

function button(icon, title, onClick) {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = icon;
  el.title = title;
  el.addEventListener('click', onClick);
  return el;
}
