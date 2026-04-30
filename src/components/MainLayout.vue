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
            <path fill-rule="evenodd" d="M4.53 5.127a3.5 3.5 0 000 5.746l1.598-1.022a2 2 0 010-3.702L4.53 5.127zm6.94 0L9.872 6.149a2 2 0 010 3.702l1.598 1.022a3.5 3.5 0 000-5.746z"/>
          </svg>
        </button>
        <button class="icon-btn" title="Commit checkpoint" @click="showCommit = true" v-if="store.currentFile">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10.5 7.75a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm1.43.75a4.002 4.002 0 01-7.86 0H.75a.75.75 0 110-1.5h3.32a4.001 4.001 0 017.86 0h3.32a.75.75 0 110 1.5h-3.32z"/>
          </svg>
        </button>
        <button class="icon-btn" title="Settings" @click="showSettings = true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path fill-rule="evenodd" d="M7.429 1.525a6.593 6.593 0 011.142 0c.036.003.108.036.137.146l.289 1.105c.147.56.55.967.997 1.189.174.086.341.178.502.274.455.268.97.287 1.438.057l1.02-.5c.096-.047.18-.03.241.027.43.397.806.86 1.115 1.375.031.05.043.12.012.195l-.46 1.094c-.202.48-.164 1.01.082 1.46.089.16.168.327.236.499.263.675.812 1.134 1.419 1.25l1.112.213c.11.02.155.089.162.126a6.63 6.63 0 010 1.167c-.008.047-.06.11-.169.128l-1.092.208c-.614.117-1.167.567-1.43 1.249-.068.168-.148.333-.236.492-.248.45-.287.98-.085 1.46l.458 1.088c.032.078.017.15-.02.2a7.077 7.077 0 01-1.112 1.374c-.06.057-.147.073-.242.025l-1.02-.5c-.468-.23-.983-.21-1.438.057a6.57 6.57 0 01-.502.274c-.447.222-.85.629-.997 1.189l-.289 1.105c-.029.11-.1.143-.137.146a6.593 6.593 0 01-1.142 0c-.036-.003-.108-.036-.137-.146l-.289-1.105c-.147-.56-.55-.967-.997-1.189a6.57 6.57 0 01-.502-.274c-.455-.268-.97-.287-1.438-.057l-1.02.5c-.095.047-.181.03-.241-.027a7.077 7.077 0 01-1.115-1.374c-.037-.05-.05-.123-.018-.2l.458-1.088c.201-.48.163-1.01-.085-1.46a6.57 6.57 0 01-.236-.492c-.263-.682-.816-1.132-1.43-1.249L1.04 9.228c-.11-.02-.161-.08-.169-.128a6.63 6.63 0 010-1.167c.007-.037.051-.105.161-.126l1.113-.213c.607-.116 1.156-.575 1.419-1.25.068-.172.147-.339.236-.499.246-.45.284-.98.082-1.46L3.42 3.291c-.031-.074-.019-.145.012-.195.31-.515.684-.978 1.115-1.375.06-.057.145-.074.24-.027l1.021.5c.468.23.983.21 1.438-.057.161-.096.328-.188.502-.274.447-.222.85-.63.997-1.189l.289-1.105c.029-.11.1-.143.137-.146zM8 11a3 3 0 110-6 3 3 0 010 6z"/>
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
    <SettingsModal v-if="showSettings" @close="showSettings = false" />
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
import SettingsModal from './SettingsModal.vue'

const store = useAppStore()
const showBranchMenu = ref(false)
const showCommit = ref(false)
const showShare = ref(false)
const showNewDoc = ref(false)
const showSettings = ref(false)

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
