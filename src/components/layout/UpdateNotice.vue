<template>
  <div
    v-if="visible"
    class="update-notice"
    :class="[
      `update-notice--${placement}`,
      `update-notice--${phase}`,
      { 'update-notice--critical': critical },
    ]"
    role="status"
  >
    <component :is="icon" :size="placement === 'sidebar' ? 14 : 15" class="un-icon" aria-hidden="true" />
    <div class="un-body">
      <span class="un-text">{{ text }}</span>
      <div
        v-if="store.updateDownloading"
        class="un-bar"
        :aria-label="`Downloading ${store.downloadProgress}%`"
      >
        <div class="un-bar-fill" :style="{ width: store.downloadProgress + '%' }"></div>
      </div>
      <a
        v-else-if="isGreeting && store.releaseNotesUrl"
        class="un-link"
        href="#"
        @click.prevent="store.openReleaseNotes()"
      >Release notes ↗</a>
      <a
        v-else-if="critical && store.advisoryUrl"
        class="un-link"
        href="#"
        @click.prevent="store.openAdvisory()"
      >Advisory ↗</a>
    </div>
    <button v-if="showDownload" class="un-action" @click="store.downloadUpdate()">
      Download
    </button>
    <button v-else-if="store.updateReady" class="un-action" @click="store.installUpdate()">
      Restart
    </button>
    <button v-if="dismissible" class="un-dismiss" aria-label="Dismiss" @click="dismiss">
      <X :size="13" />
    </button>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useAppStore } from "../../store";
import {
  ArrowUpCircle,
  Download,
  CheckCircle2,
  ShieldAlert,
  X,
} from "lucide-vue-next";

// placement: 'editor' = floating banner over the editor (live state, not
// dismissible while an update is in flight; shows the post-update greeting).
// 'sidebar' = persistent widget in the left panel, closable.
const props = defineProps({
  placement: { type: String, default: "editor" },
});
const store = useAppStore();

// The "Updated to vX" greeting only lives in the editor banner.
const isGreeting = computed(
  () => props.placement === "editor" && store.recentlyUpdated,
);
const isActive = computed(
  () => store.updateAvailable || store.updateDownloading || store.updateReady,
);

// Severity axis: a manifest-flagged critical update can't be dismissed on
// either surface, and the editor banner shows it from the 'available' state
// too (no waiting for the legacy nudge).
const critical = computed(() => store.updateMandatory && isActive.value);

const visible = computed(() => {
  if (isGreeting.value) return true;
  if (critical.value) return true;
  if (props.placement === "editor") {
    // The 'available' nudge over the editor is the legacy update-prompt; this
    // banner adds the in-flight + ready states (progress, restart) on top.
    return store.updateDownloading || store.updateReady;
  }
  // Sidebar carries the full lifecycle, persistent until the user closes it.
  return isActive.value && !store.updateNoticeDismissed;
});

// Lifecycle phase (what's happening), orthogonal to severity (how urgent).
const phase = computed(() => {
  if (isGreeting.value) return "updated";
  if (store.updateReady) return "ready";
  if (store.updateDownloading) return "downloading";
  return "available";
});

const icon = computed(() => {
  if (phase.value === "updated") return CheckCircle2;
  if (critical.value) return ShieldAlert;
  return phase.value === "available" ? Download : ArrowUpCircle;
});

const text = computed(() => {
  if (phase.value === "updated") return `Updated to v${store.recentlyUpdatedVersion}`;
  const noun = critical.value ? "Security update" : "Update";
  const v = store.updateInfo?.version;
  switch (phase.value) {
    case "ready":
      return critical.value
        ? "Security update ready — restart to patch"
        : "Update ready to install";
    case "downloading":
      return `${noun} · downloading… ${store.downloadProgress}%`;
    default:
      if (critical.value)
        return v ? `Security update required · v${v}` : "Security update required";
      return v ? `Update available · v${v}` : "Update available";
  }
});

// Download button before the download starts.
const showDownload = computed(() => phase.value === "available");

// Editor banner is dismissible only for the greeting; the sidebar widget is
// closable while an update is in flight — but never when it's mandatory.
const dismissible = computed(() => {
  if (critical.value) return false;
  return isGreeting.value || (props.placement === "sidebar" && isActive.value);
});

function dismiss() {
  if (isGreeting.value) store.dismissRecentlyUpdated();
  else store.dismissUpdateNotice();
}
</script>

<style scoped>
.update-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.8rem;
  color: var(--text, #ddd);
  background: var(--surface, #1a1a2e);
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 8px;
}

.un-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.un-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.un-icon {
  flex-shrink: 0;
  color: var(--accent, #7c8cf8);
}

/* Download progress bar */
.un-bar {
  height: 4px;
  border-radius: 2px;
  background: var(--border, #2a2a4a);
  overflow: hidden;
}
.un-bar-fill {
  height: 100%;
  background: var(--accent, #7c8cf8);
  transition: width 0.2s ease;
}

.un-link {
  color: var(--accent, #7c8cf8);
  text-decoration: none;
  font-size: 0.75rem;
}
.un-link:hover {
  text-decoration: underline;
}

.un-action {
  flex-shrink: 0;
  padding: 4px 10px;
  background: var(--accent, #7c8cf8);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
}
.un-action:hover {
  filter: brightness(1.08);
}

.un-dismiss {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  background: none;
  border: none;
  color: var(--text-muted, #888);
  cursor: pointer;
  padding: 2px;
}
.un-dismiss:hover {
  color: var(--text, #ddd);
}

/* Variant accents */
.update-notice--updated {
  border-left: 3px solid var(--success, #3fb950);
}
.update-notice--updated .un-icon {
  color: var(--success, #3fb950);
}

/* Critical / security-mandatory update */
.update-notice--critical {
  border-color: var(--danger, #f85149);
  border-left: 3px solid var(--danger, #f85149);
}
.update-notice--critical .un-icon,
.update-notice--critical .un-link {
  color: var(--danger, #f85149);
}
.update-notice--critical .un-action {
  background: var(--danger, #f85149);
}
.update-notice--critical .un-bar-fill {
  background: var(--danger, #f85149);
}

/* Floating banner over the editor */
.update-notice--editor {
  position: fixed;
  top: 52px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
  min-width: 280px;
  max-width: 440px;
  padding: 8px 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

/* Persistent widget pinned to the bottom of the left sidebar */
.update-notice--sidebar {
  margin: 8px;
  padding: 8px 10px;
}
.update-notice--sidebar .un-body {
  font-size: 0.78rem;
}
</style>
