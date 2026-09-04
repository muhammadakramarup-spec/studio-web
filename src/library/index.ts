// S3 — <LibraryPanel>. Plain DOM, no framework (none is installed).
// Renders the manifest as a filterable grid; emits the picked asset and
// touches nothing else — it never imports from src/viewer, per
// src/library/SPEC.md:94-104. Whoever wires onAssetPicked (Assembly's
// src/app/) is responsible for calling studio.loadModel(asset.fileUrl).
import type { AssetKind, LibraryAsset, LibraryManifest } from "./manifest";

export interface LibraryPanelFilter {
  kind?: AssetKind | "all";
  category?: string | "all";
  query?: string;
}

export interface LibraryPanelOptions {
  /** Provide a pre-fetched manifest to skip the internal fetch (useful for tests). */
  manifest?: LibraryManifest;
  /** Default "/assets/manifest.json" — ignored if `manifest` is provided. */
  manifestUrl?: string;
  onAssetPicked: (asset: LibraryAsset) => void;
}

export interface LibraryPanelHandle {
  setFilter(filter: LibraryPanelFilter): void;
  getManifest(): LibraryManifest | null;
  refresh(): Promise<void>;
  dispose(): void;
}

const DEFAULT_MANIFEST_URL = "/assets/manifest.json";
const MAX_VISIBLE_TILES = 96;

export function mountLibraryPanel(container: HTMLElement, options: LibraryPanelOptions): LibraryPanelHandle {
  let manifest: LibraryManifest | null = options.manifest ?? null;
  let filter: LibraryPanelFilter = { kind: "all", category: "all", query: "" };
  let disposed = false;

  container.innerHTML = "";
  container.classList.add("library-panel");

  const controls = document.createElement("div");
  controls.className = "library-panel__controls";

  const kindSelect = document.createElement("select");
  kindSelect.className = "library-panel__kind";
  kindSelect.setAttribute("aria-label", "Asset type");
  for (const k of ["all", "model", "hdri", "material"]) {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = k === "all" ? "All kinds" : k;
    kindSelect.appendChild(opt);
  }

  const categorySelect = document.createElement("select");
  categorySelect.className = "library-panel__category";
  categorySelect.setAttribute("aria-label", "Asset category");

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search…";
  searchInput.className = "library-panel__search";
  searchInput.setAttribute("aria-label", "Search assets");

  controls.appendChild(kindSelect);
  controls.appendChild(categorySelect);
  controls.appendChild(searchInput);

  const grid = document.createElement("div");
  grid.className = "library-panel__grid";
  grid.setAttribute("role", "grid");
  grid.setAttribute("aria-label", "3D asset library");

  const status = document.createElement("div");
  status.className = "library-panel__status";
  status.textContent = "Loading library…";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  container.appendChild(controls);
  container.appendChild(status);
  container.appendChild(grid);

  function populateCategoryOptions() {
    categorySelect.innerHTML = "";
    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "All categories";
    categorySelect.appendChild(allOpt);
    if (!manifest) return;
    const categories = Array.from(new Set(manifest.assets.map((a) => a.category))).sort();
    for (const c of categories) {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      categorySelect.appendChild(opt);
    }
  }

  function matchesFilter(asset: LibraryAsset): boolean {
    if (filter.kind && filter.kind !== "all" && asset.kind !== filter.kind) return false;
    if (filter.category && filter.category !== "all" && asset.category !== filter.category) return false;
    if (filter.query) {
      const q = filter.query.trim().toLowerCase();
      if (q && !asset.name.toLowerCase().includes(q) && !asset.id.toLowerCase().includes(q)) return false;
    }
    return true;
  }

  function render() {
    grid.innerHTML = "";
    if (!manifest) {
      status.textContent = "Loading library…";
      return;
    }
    const filtered = manifest.assets.filter(matchesFilter);
    const visible = filtered.slice(0, MAX_VISIBLE_TILES);
    status.textContent = filtered.length > MAX_VISIBLE_TILES
      ? `Showing ${visible.length} of ${filtered.length} matches — narrow the search to see more`
      : `${filtered.length} of ${manifest.assets.length} assets`;

    const frag = document.createDocumentFragment();
    for (const [index, asset] of visible.entries()) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "library-panel__tile";
      tile.dataset.assetId = asset.id;
      tile.setAttribute("role", "gridcell");
      tile.setAttribute("aria-label", `${asset.name}, ${asset.category}, ${asset.licence}`);
      tile.tabIndex = index === 0 ? 0 : -1;

      const img = document.createElement("img");
      img.className = "library-panel__thumb";
      img.loading = "lazy";
      img.width = 96;
      img.height = 96;
      // Keep the static studio private by default: never make a visitor's browser contact an
      // upstream thumbnail CDN. Bundled/same-origin thumbnails are safe to render.
      if (asset.thumbnailUrl.startsWith("/")) img.src = asset.thumbnailUrl;
      img.alt = "";

      const label = document.createElement("div");
      label.className = "library-panel__label";
      label.textContent = asset.name;

      const badge = document.createElement("span");
      badge.className = "library-panel__licence-badge";
      badge.textContent = asset.licence;

      tile.appendChild(img);
      tile.appendChild(label);
      tile.appendChild(badge);
      tile.addEventListener("click", () => {
        options.onAssetPicked(asset);
      });
      tile.addEventListener("keydown", (event) => {
        if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const tiles = Array.from(grid.querySelectorAll<HTMLButtonElement>(".library-panel__tile"));
        const current = tiles.indexOf(tile);
        const columns = 2;
        const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? -columns : columns;
        const next = tiles[Math.max(0, Math.min(tiles.length - 1, current + delta))];
        if (!next) return;
        for (const item of tiles) item.tabIndex = item === next ? 0 : -1;
        next.focus();
      });

      frag.appendChild(tile);
    }
    grid.appendChild(frag);
  }

  async function load() {
    if (options.manifest) {
      manifest = options.manifest;
      populateCategoryOptions();
      render();
      return;
    }
    const url = options.manifestUrl ?? DEFAULT_MANIFEST_URL;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`LibraryPanel: failed to fetch ${url} (HTTP ${res.status})`);
    manifest = (await res.json()) as LibraryManifest;
    if (disposed) return;
    populateCategoryOptions();
    render();
  }

  kindSelect.addEventListener("change", () => {
    filter.kind = kindSelect.value as AssetKind | "all";
    render();
  });
  categorySelect.addEventListener("change", () => {
    filter.category = categorySelect.value;
    render();
  });
  searchInput.addEventListener("input", () => {
    filter.query = searchInput.value;
    render();
  });

  const initialLoad = load().catch((err) => {
    status.textContent = `Failed to load library: ${(err as Error).message}`;
    status.setAttribute("role", "alert");
  });
  void initialLoad;

  return {
    setFilter(next: LibraryPanelFilter) {
      filter = { ...filter, ...next };
      if (next.kind !== undefined) kindSelect.value = String(next.kind);
      if (next.category !== undefined) categorySelect.value = String(next.category);
      if (next.query !== undefined) searchInput.value = next.query;
      render();
    },
    getManifest() {
      return manifest;
    },
    async refresh() {
      await load();
    },
    dispose() {
      disposed = true;
      container.innerHTML = "";
    },
  };
}
