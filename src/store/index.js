import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAppStore = defineStore('app', () => {
  const workspacePath = ref(null)
  const files = ref([])
  const currentFile = ref(null)
  const currentContent = ref('')
  const branches = ref([])
  const currentBranch = ref('main')
  const commitLog = ref([])
  const comments = ref([])
  const isDirty = ref(false)
  const isLoading = ref(false)
  const shareInfo = ref(null)
  const searchResults = ref([])
  const sidebarTab = ref('files') // 'files' | 'search' | 'peers'
  const rightPanelTab = ref('comments') // 'comments' | 'ai' | 'history'

  const api = window.canonic

  async function openWorkspace(chosenPath) {
    isLoading.value = true
    const result = await api.workspace.init(chosenPath)
    workspacePath.value = result.path
    await refreshFiles()
    await refreshBranches()
    isLoading.value = false
  }

  async function refreshFiles() {
    if (!workspacePath.value) return
    files.value = await api.files.list(workspacePath.value)
  }

  async function openFile(filePath) {
    if (!workspacePath.value) return
    const content = await api.files.read(workspacePath.value, filePath)
    currentFile.value = filePath
    currentContent.value = content || ''
    isDirty.value = false
    await loadComments()
    await loadCommitLog()
    // Index for search
    if (content) {
      api.search.index(workspacePath.value, filePath, content)
    }
  }

  async function saveFile(content) {
    if (!workspacePath.value || !currentFile.value) return
    await api.files.write(workspacePath.value, currentFile.value, content)
    currentContent.value = content
    isDirty.value = false
    api.search.index(workspacePath.value, currentFile.value, content)
  }

  async function createFile(name) {
    if (!workspacePath.value) return
    const filePath = await api.files.newDoc(workspacePath.value, name)
    await refreshFiles()
    await openFile(filePath)
    return filePath
  }

  async function commitFile(message) {
    if (!workspacePath.value || !currentFile.value) return
    const result = await api.git.commit(workspacePath.value, currentFile.value, message)
    if (result.success) {
      await loadCommitLog()
    }
    return result
  }

  async function refreshBranches() {
    if (!workspacePath.value) return
    const result = await api.git.branches(workspacePath.value)
    branches.value = result.branches || []
    currentBranch.value = result.current || 'main'
  }

  async function createBranch(name) {
    if (!workspacePath.value) return
    const result = await api.git.createBranch(workspacePath.value, name)
    if (result.success) {
      await refreshBranches()
      if (currentFile.value) await openFile(currentFile.value)
    }
    return result
  }

  async function checkoutBranch(name) {
    if (!workspacePath.value) return
    const result = await api.git.checkout(workspacePath.value, name)
    if (result.success) {
      currentBranch.value = name
      if (currentFile.value) await openFile(currentFile.value)
    }
    return result
  }

  async function mergeBranch(fromBranch, message) {
    if (!workspacePath.value) return
    const result = await api.git.merge(workspacePath.value, fromBranch, message)
    if (result.success) {
      await refreshBranches()
      await refreshFiles()
    }
    return result
  }

  async function loadCommitLog() {
    if (!workspacePath.value || !currentFile.value) return
    commitLog.value = await api.git.log(workspacePath.value, currentFile.value)
  }

  async function loadComments() {
    if (!currentFile.value) return
    const docId = currentFile.value.replace(/\//g, '_')
    comments.value = await api.comments.get(docId) || []
  }

  async function addComment(comment) {
    comments.value.push(comment)
    await persistComments()
  }

  async function resolveComment(commentId) {
    const c = comments.value.find(c => c.id === commentId)
    if (c) c.resolved = true
    await persistComments()
  }

  async function deleteComment(commentId) {
    comments.value = comments.value.filter(c => c.id !== commentId)
    await persistComments()
  }

  async function persistComments() {
    if (!currentFile.value) return
    const docId = currentFile.value.replace(/\//g, '_')
    await api.comments.save(docId, comments.value)
  }

  async function startShare(options) {
    if (!workspacePath.value || !currentFile.value) return
    const result = await api.share.start(workspacePath.value, currentFile.value, options)
    if (result.success) shareInfo.value = result
    return result
  }

  async function stopShare() {
    if (!currentFile.value) return
    await api.share.stop(currentFile.value)
    shareInfo.value = null
  }

  async function searchDocs(query) {
    const results = await api.search.query(query, workspacePath.value)
    searchResults.value = results
    return results
  }

  return {
    workspacePath, files, currentFile, currentContent, branches, currentBranch,
    commitLog, comments, isDirty, isLoading, shareInfo, searchResults,
    sidebarTab, rightPanelTab,
    openWorkspace, refreshFiles, openFile, saveFile, createFile,
    commitFile, refreshBranches, createBranch, checkoutBranch, mergeBranch,
    loadCommitLog, loadComments, addComment, resolveComment, deleteComment,
    startShare, stopShare, searchDocs
  }
})
