<template>
  <div class="layout">
    <!-- Titlebar -->
    <div class="titlebar">
      <div class="titlebar-left">
        <span class="app-name">canonic<span class="accent">.ai</span></span>
        <div class="branch-selector" @click.stop="showBranchMenu = !showBranchMenu" v-if="store.workspacePath">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 019 8.5H7a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 017 7h2a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25z"/>
          </svg>
          <span>{{ store.currentBranch }}</span>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z"/>
          </svg>
          <BranchMenu v-if="showBranchMenu" @close="showBranchMenu = false" />
        </div>
      </div>
      <div class="titlebar-right">
        <button class="icon-btn" title="Share document" @click="showShare = true" v-if="store.currentFile">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.13 2.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm-7.75 2a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm7.75 5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"/>
            <path d="M6.128 7.851a2.5 2.5 0 010-1.702L4.53 5.127a3.5 3.5 0 000 5.746l1.598-1.022a2.5 2.5 0 010-2zm1.744-5.098a3.5 3.5 0 015.252 2.247H15a5 5 0 00-8.75-3.03l1.622 1.038a3.5 3.5 0 01-.002-.255zm-.002 8.494a3.5 3.5 0 000-.494H6.248A5 5 0 0015 13.5h-1.876a3.5 3.5 0 01-5.254 2.247L6.248 16.784A5 5 0 006.128 11.247z"/>
          </svg>
        </button>
        <button class="icon-btn" title="Commit checkpoint" @click="showCommit = true" v-if="store.currentFile">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10.5 7.75a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm1.43.75a4.002 4.002 0 01-7.86 0H.75a.75.75 0 110-1.5h3.32a4.001 4.001 0 017.86 0h3.32a.75.75 0 110 1.5h-3.32z"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Main content -->
    <div class="content">
      <!-- Left sidebar -->
      <aside class="sidebar">
        <div class="sidebar-tabs">
          <button :class="['tab', store.sidebarTab === 'files' && 'active']" @click="store.sidebarTab = 'files'" title="Files">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0113.25 16h-9.5A1.75 1.75 0 012 14.25V1.75zm1.75-.25a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 00.25-.25V6h-2.75A1.75 1.75 0 019 4.25V1.5H3.75zm6.75.062V4.25c0 .138.112.25.25.25h2.688a.252.252 0 00-.011-.013L10.5 1.573a.254.254 0 00-.013-.011z"/>
            </svg>
          </button>
          <button :class="['tab', store.sidebarTab === 'search' && 'active']" @click="store.sidebarTab = 'search'" title="Search">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M10.68 11.74a6 6 0 01-7.922-8.982 6 6 0 018.982 7.922l3.04 3.04a.749.749 0 11-1.06 1.06l-3.04-3.04zm-5.42-1.617a4.5 4.5 0 006.344-6.344 4.5 4.5 0 00-6.344 6.344z"/>
            </svg>
          </button>
        </div>

        <FileTree v-if="store.sidebarTab === 'files'" />
        <SearchPanel v-else-if="store.sidebarTab === 'search'" />
      </aside>

      <!-- Editor -->
      <main class="editor-area">
        <Editor v-if="store.currentFile" />
        <div v-else class="empty-state">
          <p>Open a document or create a new one</p>
          <button class="btn-primary" @click="newDoc">New Document</button>
        </div>
      </main>

      <!-- Right panel -->
      <aside class="right-panel" v-if="store.currentFile">
        <div class="panel-tabs">
          <button :class="['tab', store.rightPanelTab === 'comments' && 'active']" @click="store.rightPanelTab = 'comments'">Comments</button>
          <button :class="['tab', store.rightPanelTab === 'ai' && 'active']" @click="store.rightPanelTab = 'ai'">AI</button>
          <button :class="['tab', store.rightPanelTab === 'history' && 'active']" @click="store.rightPanelTab = 'history'">History</button>
        </div>
        <CommentsPanel v-if="store.rightPanelTab === 'comments'" />
        <AIChat v-else-if="store.rightPanelTab === 'ai'" />
        <HistoryPanel v-else-if="store.rightPanelTab === 'history'" />
      </aside>
    </div>

    <!-- Click-outside backdrop for branch menu -->
    <div v-if="showBranchMenu" class="menu-backdrop" @click="showBranchMenu = false" />

    <!-- Modals -->
    <CommitModal v-if="showCommit" @close="showCommit = false" />
    <ShareModal v-if="showShare" @close="showShare = false" />
    <NewDocModal v-if="showNewDoc" @close="showNewDoc = false" />
  </div>
</template>

<script setup>
import { ref, provide } from 'vue'
import { useAppStore } from '../store'
import FileTree from './FileTree.vue'
import SearchPanel from './SearchPanel.vue'
import Editor from './Editor.vue'
import CommentsPanel from './CommentsPanel.vue'
import AIChat from './AIChat.vue'
import HistoryPanel from './HistoryPanel.vue'
import BranchMenu from './BranchMenu.vue'
import CommitModal from './CommitModal.vue'
import ShareModal from './ShareModal.vue'
import NewDocModal from './NewDocModal.vue'

const store = useAppStore()
const showBranchMenu = ref(false)
const showCommit = ref(false)
const showShare = ref(false)
const showNewDoc = ref(false)

provide('showNewDoc', () => { showNewDoc.value = true })

async function newDoc() {
  showNewDoc.value = true
}
</script>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-base);
  color: var(--text-primary);
}

.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 44px;
  background: var(--bg-titlebar);
  border-bottom: 1px solid var(--border);
  -webkit-app-region: drag;
  flex-shrink: 0;
  padding-left: 80px; /* room for macOS traffic lights */
}

.app-name {
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.accent { color: var(--accent); }

.branch-selector {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 16px;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--text-muted);
  -webkit-app-region: no-drag;
  position: relative;
  transition: background 0.15s;
}

.branch-selector:hover { background: var(--bg-hover); color: var(--text-primary); }

.titlebar-right {
  display: flex;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.icon-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

.content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  overflow: hidden;
}

.sidebar-tabs {
  display: flex;
  padding: 8px;
  gap: 4px;
  border-bottom: 1px solid var(--border);
}

.tab {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.tab.active { background: var(--bg-hover); color: var(--text-primary); }
.tab:hover:not(.active) { color: var(--text-secondary); }

.editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-editor);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-muted);
}

.btn-primary {
  background: var(--accent);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary:hover { opacity: 0.85; }

.right-panel {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border);
  background: var(--bg-sidebar);
  overflow: hidden;
}

.panel-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
}

.panel-tabs .tab {
  flex: 1;
  border-radius: 0;
  padding: 10px 0;
  font-size: 0.8125rem;
}

.panel-tabs .tab.active {
  background: transparent;
  color: var(--text-primary);
  border-bottom: 2px solid var(--accent);
}

.menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 199;
}
</style>
