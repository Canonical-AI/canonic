import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useAppStore } from "../store";

// Shared definition of the app-level menu (File / Edit / Config) used by both the
// desktop titlebar hamburger (AppMenu.vue) and the compact mobile menu, so the two
// can never drift. Settings and Reload config are delegated to the host via the
// callbacks because they need MainLayout's local state (showSettings, theme reapply).
export function useAppMenu({ onOpenSettings, onReloadConfig } = {}) {
  const store = useAppStore();
  const router = useRouter();
  const isDefault = ref(false);

  async function refreshDefault() {
    try {
      isDefault.value = await window.canonic.app.isDefaultEditor();
    } catch {
      // ignore — leave the previous value
    }
  }

  // The guided new-workspace flow (name + template) lives on the Get Started
  // screen; route there rather than duplicating it.
  const newWorkspace = () => router.push("/");

  async function openWorkspace() {
    const chosen = await window.canonic.workspace.openDialog();
    if (!chosen) return;
    await store.openWorkspace(chosen, "blank");
    router.push("/workspace");
  }

  async function openFile() {
    const chosen = await window.canonic.files.openDialog();
    if (!chosen) return;
    const ok = await store.openStandaloneFile(chosen);
    if (ok) router.push("/workspace");
  }

  const edit = (action) => window.canonic.app.editAction(action);

  async function setDefault() {
    await window.canonic.app.setDefaultEditor(true);
    await refreshDefault();
  }

  const openConfig = () => window.canonic.app.openConfig();

  const groups = computed(() => [
    {
      label: "File",
      items: [
        { label: "New workspace…", run: newWorkspace },
        { label: "Open workspace…", run: openWorkspace },
        { label: "Open file…", run: openFile },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", run: () => edit("undo") },
        { label: "Redo", run: () => edit("redo") },
        { label: "Cut", run: () => edit("cut") },
        { label: "Copy", run: () => edit("copy") },
        { label: "Paste", run: () => edit("paste") },
        { label: "Select all", run: () => edit("selectAll") },
      ],
    },
    {
      label: "Config",
      items: [
        { label: "Settings", run: () => onOpenSettings?.() },
        {
          label: isDefault.value
            ? "Default editor ✓"
            : "Set as default editor",
          run: setDefault,
        },
        { label: "Open config file", run: openConfig },
        { label: "Reload config", run: () => onReloadConfig?.() },
      ],
    },
  ]);

  return { groups, isDefault, refreshDefault };
}
