<template>
    <div class="modal-backdrop" @click.self="$emit('close')">
        <div class="modal">
            <aside class="modal-sidebar">
                <div class="sidebar-header">
                    <span class="app-name"
                        >canonic<span class="accent">.ai</span></span
                    >
                    <h3 class="modal-title">Settings</h3>
                </div>
                <nav class="sidebar-tabs">
                    <button
                        v-for="(label, tab) in navItems"
                        :key="tab"
                        :class="[
                            'sidebar-tab',
                            activeTab === tab && 'active',
                            tab === 'danger' && 'sidebar-tab--danger',
                        ]"
                        @click="activeTab = tab"
                    >
                        <component :is="navIcons[tab]" :size="16" />
                        <span>{{ label }}</span>
                    </button>
                    <div class="sidebar-spacer" />
                </nav>
            </aside>

            <main class="modal-main">
                <header class="modal-content-header">
                    <h4 class="tab-title">{{ activeTabLabel }}</h4>
                    <button
                        class="close-btn"
                        @click="$emit('close')"
                        title="Close settings"
                    >
                        ✕
                    </button>
                </header>

                <div class="tab-scroll-area">
                    <!-- Global Search (All Settings) -->
                    <div v-if="activeTab === 'all'" class="tab-content">
                        <div class="field search-field">
                            <div class="search-input-wrapper">
                                <Search :size="16" class="search-icon" />
                                <input
                                    v-model="searchQuery"
                                    class="field-input search-input"
                                    placeholder="Search all settings..."
                                    autofocus
                                />
                            </div>
                        </div>
                    </div>

                    <!-- Profile tab -->
                    <div
                        v-if="activeTab === 'profile' || activeTab === 'all'"
                        v-show="anyVisibleInTab('profile')"
                        class="tab-content"
                    >
                        <h3 v-if="activeTab === 'all'" class="all-tab-heading">
                            {{ navItems.profile }}
                        </h3>
                        <div
                            v-show="shouldShow('displayName', 'profile')"
                            id="setting-displayName"
                            class="field"
                        >
                            <label class="field-label">Display name</label>
                            <input
                                v-model="form.displayName"
                                class="field-input"
                                placeholder="Your Name"
                            />
                            <p class="field-hint">
                                Used in git commits and comments.
                            </p>
                        </div>
                        <div
                            v-show="shouldShow('defaultEditor', 'profile')"
                            id="setting-defaultEditor"
                            class="field"
                        >
                            <label class="field-label">Default editor</label>
                            <button
                                class="default-editor-btn"
                                :class="{
                                    'default-editor-btn--done': isDefaultEditor,
                                }"
                                :disabled="isDefaultEditor"
                                @click="toggleDefaultEditor"
                            >
                                {{
                                    isDefaultEditor
                                        ? "Canonic is already default for .md"
                                        : "Set as Default for .md"
                                }}
                            </button>
                        </div>
                        <div
                            v-show="shouldShow('hints', 'profile')"
                            id="setting-hints"
                            class="field"
                        >
                            <div
                                class="settings-card"
                                :class="{ active: hintsEnabled }"
                                @click="hintsEnabled = !hintsEnabled"
                            >
                                <div class="card-header">
                                    <span class="card-label"
                                        >Show feature hints</span
                                    >
                                    <div
                                        class="toggle"
                                        :class="{ on: hintsEnabled }"
                                    >
                                        <div class="toggle-thumb"></div>
                                    </div>
                                </div>
                                <p class="card-desc">
                                    Tips shown at the bottom of the sidebar.
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- AI tab -->
                    <div
                        v-if="activeTab === 'providers' || activeTab === 'all'"
                        v-show="anyVisibleInTab('providers')"
                        class="tab-content"
                    >
                        <h3 v-if="activeTab === 'all'" class="all-tab-heading">
                            {{ navItems.providers }}
                        </h3>
                        <p
                            v-show="shouldShow('providers', 'providers')"
                            class="section-heading"
                        >
                            Providers
                        </p>
                        <div
                            v-show="shouldShow('providers', 'providers')"
                            id="setting-providers"
                            class="providers-list"
                        >
                            <div
                                v-for="(provider, idx) in form.providers"
                                :key="provider.id"
                                class="provider-row"
                            >
                                <template
                                    v-if="editingProviderId !== provider.id"
                                >
                                    <div class="provider-info">
                                        <span class="provider-label">{{
                                            provider.label
                                        }}</span>
                                        <span class="provider-url">{{
                                            provider.baseUrl
                                        }}</span>
                                        <span class="provider-key-mask">{{
                                            provider.apiKey
                                                ? "••••" +
                                                  provider.apiKey.slice(-4)
                                                : "no key"
                                        }}</span>
                                    </div>
                                    <div class="provider-actions">
                                        <button
                                            class="provider-btn"
                                            @click="
                                                editingProviderId = provider.id
                                            "
                                        >
                                            Edit
                                        </button>
                                        <button
                                            class="provider-btn danger"
                                            @click="deleteProvider(idx)"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </template>
                                <template v-else>
                                    <ProviderForm
                                        :initial="provider"
                                        :existing-ids="
                                            form.providers
                                                .map((p) => p.id)
                                                .filter(
                                                    (id) => id !== provider.id,
                                                )
                                        "
                                        @save="updateProvider(idx, $event)"
                                        @cancel="editingProviderId = null"
                                    />
                                </template>
                            </div>
                        </div>
                        <template v-if="addingProvider">
                            <ProviderForm
                                :existing-ids="form.providers.map((p) => p.id)"
                                @save="addProvider($event)"
                                @cancel="addingProvider = false"
                            />
                        </template>
                        <button
                            v-else
                            class="add-provider-btn"
                            @click="addingProvider = true"
                        >
                            + Add provider
                        </button>
                        <p class="field-hint" style="margin-top: 8px">
                            ⚠ API keys stored as plain text in
                            <code>~/.config/canonic/config.json</code>.
                        </p>

                        <p
                            v-show="shouldShow('assistantName', 'providers')"
                            class="section-heading"
                        >
                            AI Assistant
                        </p>
                        <div
                            v-show="shouldShow('assistantName', 'providers')"
                            id="setting-assistantName"
                            class="field"
                        >
                            <label class="field-label">Name</label>
                            <input
                                v-model="form.assistant.name"
                                class="field-input"
                                placeholder="Spark"
                            />
                            <p class="field-hint">
                                How the assistant introduces itself.
                            </p>
                        </div>
                        <div
                            v-show="shouldShow('assistantModel', 'providers')"
                            id="setting-assistantModel"
                            class="field"
                        >
                            <label class="field-label">Provider</label>
                            <select
                                v-model="form.assistant.providerId"
                                class="field-select"
                            >
                                <option value="">— None —</option>
                                <option
                                    v-for="p in form.providers"
                                    :key="p.id"
                                    :value="p.id"
                                >
                                    {{ p.label }}
                                </option>
                            </select>
                        </div>
                        <div
                            v-show="shouldShow('assistantModel', 'providers')"
                            class="field"
                        >
                            <label class="field-label">Model</label>
                            <input
                                v-model="form.assistant.model"
                                class="field-input"
                                placeholder="e.g. anthropic/claude-sonnet-4-5"
                            />
                            <p class="field-hint">
                                Any model ID supported by the selected provider.
                            </p>
                        </div>
                        <div
                            v-show="shouldShow('assistantModel', 'providers')"
                            class="field"
                        >
                            <label class="field-label"
                                >Extra instructions</label
                            >
                            <textarea
                                v-model="form.assistant.extraInstructions"
                                class="field-input field-textarea"
                                placeholder="e.g. Focus on B2B SaaS context..."
                                rows="3"
                            />
                            <p class="field-hint">
                                Appended to the base system prompt.
                            </p>
                        </div>

                        <p
                            v-show="
                                shouldShow('completionEnabled', 'providers')
                            "
                            class="section-heading"
                        >
                            Inline Completions
                        </p>
                        <div
                            v-show="
                                shouldShow('completionEnabled', 'providers')
                            "
                            id="setting-completionEnabled"
                            class="field"
                        >
                            <div
                                class="settings-card"
                                :class="{ active: form.completion.enabled }"
                                @click="
                                    form.completion.enabled =
                                        !form.completion.enabled
                                "
                            >
                                <div class="card-header">
                                    <span class="card-label"
                                        >Enable inline completions</span
                                    >
                                    <div
                                        class="toggle"
                                        :class="{ on: form.completion.enabled }"
                                    >
                                        <div class="toggle-thumb"></div>
                                    </div>
                                </div>
                                <p class="card-desc">
                                    Ghost text suggestions as you type.
                                    <kbd class="kbd">Tab</kbd> accept ·
                                    <kbd class="kbd">Esc</kbd> dismiss.
                                </p>
                            </div>
                        </div>
                        <div
                            v-show="
                                shouldShow('completionEnabled', 'providers')
                            "
                            class="field"
                        >
                            <label class="field-label">Provider</label>
                            <select
                                v-model="form.completion.providerId"
                                class="field-select"
                            >
                                <option value="">— None —</option>
                                <option
                                    v-for="p in form.providers"
                                    :key="p.id"
                                    :value="p.id"
                                >
                                    {{ p.label }}
                                </option>
                            </select>
                        </div>
                        <div
                            v-show="
                                shouldShow('completionEnabled', 'providers')
                            "
                            class="field"
                        >
                            <label class="field-label">Model</label>
                            <input
                                v-model="form.completion.model"
                                class="field-input"
                                placeholder="codestral-latest"
                            />
                        </div>
                    </div>

                    <!-- Hotkeys tab -->
                    <div
                        v-if="activeTab === 'hotkeys' || activeTab === 'all'"
                        v-show="anyVisibleInTab('hotkeys')"
                        class="tab-content"
                    >
                        <h3 v-if="activeTab === 'all'" class="all-tab-heading">
                            {{ navItems.hotkeys }}
                        </h3>
                        <div v-show="shouldShow('hotkeys', 'hotkeys')">
                            <p class="section-heading">Editor Shortcuts</p>
                            <p class="field-hint" style="margin-bottom: 24px">
                                Customize your keyboard shortcuts. Use
                                <code>Mod</code> for Cmd (macOS) or Ctrl
                                (Windows/Linux).
                            </p>
                            <div class="field">
                                <label class="field-label"
                                    >Select line/block</label
                                >
                                <input
                                    v-model="form.hotkeys.selectLine"
                                    class="field-input kbd-input"
                                />
                            </div>
                            <div class="field">
                                <label class="field-label">Move block up</label>
                                <input
                                    v-model="form.hotkeys.moveUp"
                                    class="field-input kbd-input"
                                />
                            </div>
                            <div class="field">
                                <label class="field-label"
                                    >Move block down</label
                                >
                                <input
                                    v-model="form.hotkeys.moveDown"
                                    class="field-input kbd-input"
                                />
                            </div>

                            <p class="section-heading">Find & Replace</p>
                            <div class="field">
                                <label class="field-label"
                                    >Find in document</label
                                >
                                <input
                                    v-model="form.hotkeys.findInDoc"
                                    class="field-input kbd-input"
                                    placeholder="Mod-f"
                                />
                            </div>
                            <div class="field">
                                <label class="field-label"
                                    >Find in workspace</label
                                >
                                <input
                                    v-model="form.hotkeys.findInWorkspace"
                                    class="field-input kbd-input"
                                    placeholder="Mod-Shift-f"
                                />
                            </div>
                            <div class="field">
                                <label class="field-label">Find next</label>
                                <input
                                    v-model="form.hotkeys.findNext"
                                    class="field-input kbd-input"
                                    placeholder="Mod-g"
                                />
                            </div>
                            <div class="field">
                                <label class="field-label">Find previous</label>
                                <input
                                    v-model="form.hotkeys.findPrev"
                                    class="field-input kbd-input"
                                    placeholder="Mod-Shift-g"
                                />
                            </div>
                        </div>
                    </div>

                    <!-- Appearance tab -->
                    <div
                        v-if="activeTab === 'appearance' || activeTab === 'all'"
                        v-show="anyVisibleInTab('appearance')"
                        class="tab-content"
                    >
                        <h3 v-if="activeTab === 'all'" class="all-tab-heading">
                            {{ navItems.appearance }}
                        </h3>
                        <p
                            v-show="shouldShow('transparency', 'appearance')"
                            class="section-heading"
                        >
                            Glass & Transparency
                        </p>
                        <div
                            v-show="shouldShow('transparency', 'appearance')"
                            id="setting-transparency"
                            class="field"
                        >
                            <div
                                class="settings-card"
                                :class="{ active: form.windowTransparency }"
                                @click="
                                    form.windowTransparency =
                                        !form.windowTransparency
                                "
                            >
                                <div class="card-header">
                                    <span class="card-label"
                                        >Window transparency</span
                                    >
                                    <div
                                        class="toggle"
                                        :class="{ on: form.windowTransparency }"
                                    >
                                        <div class="toggle-thumb"></div>
                                    </div>
                                </div>
                                <p class="card-desc">
                                    Semi-transparent panel backgrounds. Desktop
                                    shows through.
                                </p>
                            </div>
                        </div>
                        <div
                            v-show="
                                shouldShow('transparencyOpacity', 'appearance')
                            "
                            v-if="form.windowTransparency"
                            id="setting-transparencyOpacity"
                            class="field"
                        >
                            <label class="field-label">
                                Transparency opacity
                            </label>
                            <div class="opacity-control-row">
                                <input
                                    type="range"
                                    v-model.number="
                                        form.windowTransparencyOpacity
                                    "
                                    min="0.1"
                                    max="0.99"
                                    step="0.01"
                                    class="opacity-slider"
                                />
                                <div class="opacity-input-wrapper">
                                    <input
                                        type="number"
                                        :value="
                                            Math.round(
                                                form.windowTransparencyOpacity *
                                                    100,
                                            )
                                        "
                                        @input="
                                            form.windowTransparencyOpacity =
                                                $event.target.value / 100
                                        "
                                        min="10"
                                        max="99"
                                        class="field-input opacity-number-input"
                                    />
                                    <span class="opacity-percent-symbol"
                                        >%</span
                                    >
                                </div>
                            </div>
                            <p class="field-hint">
                                Lower = more see-through. Up to 99% supported.
                            </p>
                        </div>
                        <div
                            v-show="shouldShow('blur', 'appearance')"
                            id="setting-blur"
                            class="field"
                        >
                            <div
                                class="settings-card"
                                :class="{ active: form.windowBlur }"
                                @click="form.windowBlur = !form.windowBlur"
                            >
                                <div class="card-header">
                                    <span class="card-label">Window blur</span>
                                    <div
                                        class="toggle"
                                        :class="{ on: form.windowBlur }"
                                    >
                                        <div class="toggle-thumb"></div>
                                    </div>
                                </div>
                                <p class="card-desc">
                                    Native frosted-glass blur behind window.
                                    macOS only.
                                </p>
                            </div>
                        </div>

                        <p
                            v-show="shouldShow('grain', 'appearance')"
                            class="section-heading"
                        >
                            Organic Grain
                        </p>
                        <div
                            v-show="shouldShow('grain', 'appearance')"
                            id="setting-grain"
                            class="field"
                        >
                            <div
                                class="settings-card"
                                :class="{ active: form.grainEnabled }"
                                @click="form.grainEnabled = !form.grainEnabled"
                            >
                                <div class="card-header">
                                    <span class="card-label"
                                        >Enable grain overlay</span
                                    >
                                    <div
                                        class="toggle"
                                        :class="{ on: form.grainEnabled }"
                                    >
                                        <div class="toggle-thumb"></div>
                                    </div>
                                </div>
                                <p class="card-desc">
                                    Add a subtle, analog photo grain pattern to
                                    the interface.
                                </p>
                            </div>
                        </div>
                        <div
                            v-show="shouldShow('grainOpacity', 'appearance')"
                            id="setting-grainOpacity"
                            v-if="form.grainEnabled"
                            class="field"
                        >
                            <label class="field-label"> Grain intensity </label>
                            <div class="opacity-control-row">
                                <input
                                    type="range"
                                    v-model.number="form.grainOpacity"
                                    min="0.01"
                                    max="0.15"
                                    step="0.01"
                                    class="opacity-slider"
                                />
                                <div class="opacity-input-wrapper">
                                    <input
                                        type="number"
                                        :value="
                                            Math.round(form.grainOpacity * 100)
                                        "
                                        @input="
                                            form.grainOpacity =
                                                $event.target.value / 100
                                        "
                                        min="1"
                                        max="15"
                                        class="field-input opacity-number-input"
                                    />
                                    <span class="opacity-percent-symbol"
                                        >%</span
                                    >
                                </div>
                            </div>
                        </div>

                        <p
                            v-show="
                                shouldShow('paragraphSpacing', 'appearance')
                            "
                            class="section-heading"
                        >
                            Editor
                        </p>
                        <div
                            v-show="
                                shouldShow('paragraphSpacing', 'appearance')
                            "
                            id="setting-paragraphSpacing"
                            class="field"
                        >
                            <div
                                class="settings-card"
                                :class="{ active: form.editorParagraphSpacing }"
                                @click="
                                    form.editorParagraphSpacing =
                                        !form.editorParagraphSpacing
                                "
                            >
                                <div class="card-header">
                                    <span class="card-label"
                                        >Paragraph spacing</span
                                    >
                                    <div
                                        class="toggle"
                                        :class="{
                                            on: form.editorParagraphSpacing,
                                        }"
                                    >
                                        <div class="toggle-thumb"></div>
                                    </div>
                                </div>
                                <p class="card-desc">
                                    Add margin between paragraphs for better
                                    readability.
                                </p>
                            </div>
                        </div>

                        <div
                            v-show="shouldShow('editorTabs', 'appearance')"
                            id="setting-editorTabs"
                            class="field"
                        >
                            <div
                                class="settings-card"
                                :class="{ active: form.tabsEnabled }"
                                @click="form.tabsEnabled = !form.tabsEnabled"
                            >
                                <div class="card-header">
                                    <span class="card-label">Editor tabs</span>
                                    <div
                                        class="toggle"
                                        :class="{ on: form.tabsEnabled }"
                                    >
                                        <div class="toggle-thumb"></div>
                                    </div>
                                </div>
                                <p class="card-desc">
                                    Show a strip of tabs for files opened this
                                    session.
                                </p>
                            </div>
                        </div>
                        <div
                            v-show="
                                shouldShow('editorTabsPosition', 'appearance')
                            "
                            v-if="form.tabsEnabled"
                            id="setting-editorTabsPosition"
                            class="field"
                        >
                            <label class="field-label">Tab position</label>
                            <div class="scope-options">
                                <label
                                    v-for="opt in tabsPositionOptions"
                                    :key="opt.value"
                                    :class="[
                                        'scope-option',
                                        form.tabsPosition === opt.value &&
                                            'selected',
                                    ]"
                                >
                                    <input
                                        type="radio"
                                        v-model="form.tabsPosition"
                                        :value="opt.value"
                                    />
                                    <div class="scope-content">
                                        <span class="scope-name">{{
                                            opt.label
                                        }}</span>
                                        <span class="scope-desc">{{
                                            opt.desc
                                        }}</span>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <p
                            v-show="shouldShow('copyOnSelect', 'appearance')"
                            class="section-heading"
                        >
                            Clipboard & Selection
                        </p>
                        <div
                            v-show="shouldShow('copyOnSelect', 'appearance')"
                            id="setting-copyOnSelect"
                            class="field"
                        >
                            <div
                                class="settings-card"
                                :class="{ active: form.clipboard.copyOnSelect }"
                                @click="
                                    form.clipboard.copyOnSelect =
                                        !form.clipboard.copyOnSelect
                                "
                            >
                                <div class="card-header">
                                    <span class="card-label"
                                        >Copy on select</span
                                    >
                                    <div
                                        class="toggle"
                                        :class="{
                                            on: form.clipboard.copyOnSelect,
                                        }"
                                    >
                                        <div class="toggle-thumb"></div>
                                    </div>
                                </div>
                                <p class="card-desc">
                                    Automatically copy text to clipboard when
                                    selected.
                                </p>
                            </div>
                        </div>

                        <div
                            v-show="
                                shouldShow('middleClickPaste', 'appearance')
                            "
                            id="setting-middleClickPaste"
                            class="field"
                        >
                            <div
                                class="settings-card"
                                :class="{
                                    active: form.clipboard.middleClickPaste,
                                }"
                                @click="
                                    form.clipboard.middleClickPaste =
                                        !form.clipboard.middleClickPaste
                                "
                            >
                                <div class="card-header">
                                    <span class="card-label"
                                        >Middle-click paste</span
                                    >
                                    <div
                                        class="toggle"
                                        :class="{
                                            on: form.clipboard.middleClickPaste,
                                        }"
                                    >
                                        <div class="toggle-thumb"></div>
                                    </div>
                                </div>
                                <p class="card-desc">
                                    Paste clipboard content with the middle
                                    mouse button.
                                </p>
                            </div>
                        </div>

                        <div
                            v-show="shouldShow('ctrlClickPaste', 'appearance')"
                            id="setting-ctrlClickPaste"
                            class="field"
                        >
                            <div
                                class="settings-card"
                                :class="{
                                    active: form.clipboard.ctrlClickPaste,
                                }"
                                @click="
                                    form.clipboard.ctrlClickPaste =
                                        !form.clipboard.ctrlClickPaste
                                "
                            >
                                <div class="card-header">
                                    <span class="card-label"
                                        >Ctrl-click paste</span
                                    >
                                    <div
                                        class="toggle"
                                        :class="{
                                            on: form.clipboard.ctrlClickPaste,
                                        }"
                                    >
                                        <div class="toggle-thumb"></div>
                                    </div>
                                </div>
                                <p class="card-desc">
                                    Paste clipboard content with Ctrl + Click.
                                </p>
                            </div>
                        </div>

                        <p v-show="activeTab !== 'all'" class="section-heading">
                            Theming
                        </p>
                        <div v-show="activeTab !== 'all'" class="field">
                            <p class="field-hint">
                                Theming and theme importing settings are coming
                                soon. You can currently switch themes via the
                                palette icon in the titlebar.
                            </p>
                        </div>
                    </div>

                    <!-- Sharing tab -->
                    <div
                        v-if="activeTab === 'sharing' || activeTab === 'all'"
                        v-show="anyVisibleInTab('sharing')"
                        class="tab-content"
                    >
                        <h3 v-if="activeTab === 'all'" class="all-tab-heading">
                            {{ navItems.sharing }}
                        </h3>
                        <div
                            v-show="shouldShow('shareScope', 'sharing')"
                            id="setting-shareScope"
                            class="field"
                        >
                            <label class="field-label"
                                >Default share scope</label
                            >
                            <p class="field-hint" style="margin-bottom: 12px">
                                What gets shared when you click "Share
                                document."
                            </p>
                            <div class="scope-options">
                                <label
                                    v-for="opt in scopeOptions"
                                    :key="opt.value"
                                    :class="[
                                        'scope-option',
                                        form.sharingDefaults.scope ===
                                            opt.value && 'selected',
                                    ]"
                                >
                                    <input
                                        type="radio"
                                        v-model="form.sharingDefaults.scope"
                                        :value="opt.value"
                                    />
                                    <div class="scope-content">
                                        <span class="scope-name">{{
                                            opt.label
                                        }}</span>
                                        <span class="scope-desc">{{
                                            opt.desc
                                        }}</span>
                                    </div>
                                </label>
                            </div>
                        </div>
                        <div
                            v-show="shouldShow('sharePermission', 'sharing')"
                            id="setting-sharePermission"
                            class="field"
                        >
                            <label class="field-label"
                                >Default access level</label
                            >
                            <select
                                v-model="form.sharingDefaults.permission"
                                class="field-select"
                            >
                                <option value="view">Read only</option>
                                <option value="comment">Can comment</option>
                            </select>
                        </div>

                        <p
                            v-show="shouldShow('autoShareWorkspace', 'sharing')"
                            class="section-heading"
                        >
                            Workspace Sharing
                        </p>
                        <div
                            v-show="shouldShow('autoShareWorkspace', 'sharing')"
                            id="setting-autoShareWorkspace"
                            class="field"
                        >
                            <div
                                class="settings-card"
                                :class="{ active: form.autoShareWorkspace }"
                                @click="
                                    form.autoShareWorkspace =
                                        !form.autoShareWorkspace
                                "
                            >
                                <div class="card-header">
                                    <span class="card-label"
                                        >Auto-share current workspace</span
                                    >
                                    <div
                                        class="toggle"
                                        :class="{ on: form.autoShareWorkspace }"
                                    >
                                        <div class="toggle-thumb"></div>
                                    </div>
                                </div>
                                <p class="card-desc">
                                    Start sharing your active workspace when the
                                    app opens.
                                </p>
                            </div>
                            <div
                                v-if="store.workspaceShareInfo"
                                class="sharing-live-status"
                            >
                                <div class="status-pulse-group">
                                    <span class="status-dot-pulse"></span>
                                    <span class="status-text-live"
                                        >Workspace sharing active</span
                                    >
                                </div>
                                <div class="sharing-stats-row">
                                    <span class="sharing-stat"
                                        ><b>{{
                                            store.workspaceShareStats.connected
                                        }}</b>
                                        live</span
                                    >
                                    <span class="sharing-stat"
                                        ><b>{{
                                            store.workspaceShareStats.reads
                                        }}</b>
                                        reads</span
                                    >
                                </div>
                            </div>
                        </div>

                        <div
                            v-show="
                                shouldShow('autoShareAllWorkspaces', 'sharing')
                            "
                            id="setting-autoShareAllWorkspaces"
                            class="field"
                        >
                            <div
                                class="settings-card"
                                :class="{
                                    active: form.autoShareAllWorkspaces,
                                }"
                                @click="
                                    form.autoShareAllWorkspaces =
                                        !form.autoShareAllWorkspaces
                                "
                            >
                                <div class="card-header">
                                    <span class="card-label"
                                        >Auto-share all workspaces</span
                                    >
                                    <div
                                        class="toggle"
                                        :class="{
                                            on: form.autoShareAllWorkspaces,
                                        }"
                                    >
                                        <div class="toggle-thumb"></div>
                                    </div>
                                </div>
                                <p class="card-desc">
                                    Automatically share your
                                    {{ store.recentWorkspaces.length }} recent
                                    workspaces on startup.
                                </p>
                            </div>
                            <div
                                v-if="store.sharesByFile['__all_workspaces__']"
                                class="sharing-live-status"
                            >
                                <div class="status-pulse-group">
                                    <span class="status-dot-pulse"></span>
                                    <span class="status-text-live"
                                        >All-workspace sharing active</span
                                    >
                                </div>
                                <div class="sharing-stats-row">
                                    <span class="sharing-stat"
                                        ><b>{{
                                            store.shareStatsByFile[
                                                "__all_workspaces__"
                                            ]?.connected || 0
                                        }}</b>
                                        live</span
                                    >
                                    <span class="sharing-stat"
                                        ><b>{{
                                            store.shareStatsByFile[
                                                "__all_workspaces__"
                                            ]?.reads || 0
                                        }}</b>
                                        reads</span
                                    >
                                </div>
                            </div>
                        </div>

                        <div
                            v-show="
                                shouldShow('sharingExcludedPaths', 'sharing')
                            "
                            id="setting-sharingExcludedPaths"
                            class="field"
                        >
                            <label class="field-label"
                                >Exclude directories from sharing</label
                            >
                            <p class="field-hint" style="margin-bottom: 12px">
                                These folders will never be visible to peers,
                                even if workspace sharing is on.
                            </p>
                            <div class="excluded-paths-list">
                                <div
                                    v-for="(
                                        path, idx
                                    ) in form.sharingExcludedPaths"
                                    :key="idx"
                                    class="excluded-path-row"
                                >
                                    <span class="path-text">{{ path }}</span>
                                    <button
                                        class="remove-path-btn"
                                        @click="
                                            form.sharingExcludedPaths.splice(
                                                idx,
                                                1,
                                            )
                                        "
                                    >
                                        ✕
                                    </button>
                                </div>
                                <div class="add-path-row">
                                    <input
                                        v-model="newExcludedPath"
                                        class="field-input"
                                        placeholder="e.g. Private/ or Finance/"
                                        @keydown.enter="addExcludedPath"
                                    />
                                    <button
                                        class="add-path-btn"
                                        @click="addExcludedPath"
                                        :disabled="!newExcludedPath.trim()"
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div v-show="activeTab !== 'all'" class="field">
                            <label class="field-label">Ignored paths</label>
                            <p class="field-hint" style="margin-bottom: 8px">
                                Create a <code>.canonicignore</code> file in a
                                workspace to exclude directories. Same syntax as
                                <code>.gitignore</code>.
                            </p>
                            <div class="code-example">
                                # Example .canonicignore<br />Monitoring/<br />Implementation/technical-spec.md
                            </div>
                        </div>
                    </div>

                    <!-- Workspace tab -->
                    <div
                        v-if="activeTab === 'workspace' || activeTab === 'all'"
                        v-show="anyVisibleInTab('workspace')"
                        class="tab-content"
                    >
                        <h3 v-if="activeTab === 'all'" class="all-tab-heading">
                            {{ navItems.workspace }}
                        </h3>
                        <div
                            v-show="shouldShow('workspacePath', 'workspace')"
                            id="setting-workspacePath"
                            class="field"
                        >
                            <label class="field-label"
                                >Default workspace location</label
                            >
                            <div class="path-input">
                                <input
                                    v-model="form.defaultWorkspacePath"
                                    class="field-input"
                                />
                                <button class="browse-btn" @click="openDialog">
                                    Browse
                                </button>
                            </div>
                            <p class="field-hint">
                                New workspaces created here by default.
                            </p>
                        </div>
                        <div
                            v-show="activeTab !== 'all'"
                            v-if="store.workspacePath"
                            class="workspace-info"
                        >
                            <p class="info-label">Current workspace</p>
                            <p class="info-path">{{ store.workspacePath }}</p>
                            <button class="switch-btn" @click="switchWorkspace">
                                Switch workspace
                            </button>
                        </div>
                    </div>

                    <!-- Privacy tab -->
                    <div
                        v-if="activeTab === 'privacy' || activeTab === 'all'"
                        v-show="anyVisibleInTab('privacy')"
                        class="tab-content"
                    >
                        <h3 v-if="activeTab === 'all'" class="all-tab-heading">
                            {{ navItems.privacy }}
                        </h3>
                        <div
                            v-show="shouldShow('telemetry', 'privacy')"
                            id="setting-telemetry"
                            class="field"
                        >
                            <label class="field-label">Usage Logging</label>
                            <p class="field-hint" style="margin-bottom: 12px">
                                Help improve Canonic by sharing anonymous usage
                                data.
                            </p>
                            <div
                                class="settings-card"
                                :class="{ active: form.telemetryEnabled }"
                                @click="
                                    form.telemetryEnabled =
                                        !form.telemetryEnabled
                                "
                            >
                                <div class="telemetry-header">
                                    <span class="card-label"
                                        >Enable usage logging</span
                                    >
                                    <div
                                        class="toggle"
                                        :class="{ on: form.telemetryEnabled }"
                                    >
                                        <div class="toggle-thumb"></div>
                                    </div>
                                </div>
                                <p class="card-desc">
                                    We track feature usage (e.g. "AI chat
                                    started", "Version saved") to understand how
                                    Canonic is being used.
                                    <strong
                                        >We never collect your API keys or
                                        document content.</strong
                                    >
                                </p>
                            </div>
                            <p class="field-hint" style="margin-top: 12px">
                                Logs are stored locally in
                                <code>~/.config/canonic/usage.log</code>.
                            </p>
                        </div>
                    </div>

                    <!-- Updates tab -->
                    <div
                        v-if="activeTab === 'updates' || activeTab === 'all'"
                        v-show="anyVisibleInTab('updates')"
                        class="tab-content"
                    >
                        <h3 v-if="activeTab === 'all'" class="all-tab-heading">
                            {{ navItems.updates }}
                        </h3>
                        <div class="field">
                            <div
                                v-show="shouldShow('autoUpdate', 'updates')"
                                id="setting-autoUpdate"
                                class="settings-card"
                                :class="{ active: form.autoUpdate }"
                                @click="form.autoUpdate = !form.autoUpdate"
                            >
                                <div class="card-header">
                                    <span class="card-label"
                                        >Download updates automatically</span
                                    >
                                    <div
                                        class="toggle"
                                        :class="{ on: form.autoUpdate }"
                                    >
                                        <div class="toggle-thumb"></div>
                                    </div>
                                </div>
                                <p class="card-desc">
                                    Canonic downloads updates in the background
                                    and notifies you when ready.
                                </p>
                            </div>
                        </div>
                        <div v-show="activeTab !== 'all'" class="field">
                            <button
                                class="btn-secondary"
                                @click="checkUpdates"
                                :disabled="
                                    checkingUpdates || store.updateDownloading
                                "
                            >
                                {{
                                    checkingUpdates ? "Checking…" : "Check now"
                                }}
                            </button>
                            <span v-if="updateStatus" class="update-status">{{
                                updateStatus
                            }}</span>
                        </div>

                        <div
                            v-if="store.updateReady"
                            v-show="activeTab !== 'all'"
                            class="field"
                        >
                            <button
                                class="btn-primary"
                                @click="store.installUpdate()"
                            >
                                Restart to update — v{{
                                    store.updateInfo?.version
                                }}
                            </button>
                        </div>
                        <div
                            v-else-if="store.updateDownloading"
                            v-show="activeTab !== 'all'"
                            class="field"
                        >
                            <span class="update-status"
                                >Downloading…
                                {{ store.downloadProgress }}%</span
                            >
                        </div>
                        <div
                            v-else-if="store.updateAvailable"
                            v-show="activeTab !== 'all'"
                            class="field"
                        >
                            <button
                                class="btn-primary"
                                @click="store.downloadUpdate()"
                            >
                                Download v{{ store.updateInfo?.version }}
                            </button>
                        </div>

                        <div
                            v-show="activeTab !== 'all'"
                            class="field"
                            style="margin-top: 32px; opacity: 0.6"
                        >
                            <p class="field-hint">
                                Current version: v{{ store.appVersion }}
                            </p>
                        </div>
                    </div>

                    <!-- Reset tab -->
                    <div v-if="activeTab === 'danger'" class="tab-content">
                        <div class="danger-zone-card">
                            <p class="danger-title">Reset configuration</p>
                            <p class="danger-desc">
                                Deletes settings and API keys. Documents are
                                safe. Irreversible.
                            </p>
                            <button
                                class="btn-danger-outline"
                                @click="confirmReset"
                                :disabled="dangerBusy"
                            >
                                Delete and reset
                            </button>
                        </div>
                        <div
                            class="danger-zone-card"
                            style="
                                margin-top: 16px;
                                background: none;
                                border-color: var(--border);
                            "
                        >
                            <p
                                class="danger-title"
                                style="color: var(--text-primary)"
                            >
                                Uninstall script
                            </p>
                            <p class="danger-desc">
                                Run this in your terminal to remove all data:
                            </p>
                            <div class="code-block">
                                <pre>rm -rf ~/.config/canonic</pre>
                                <button
                                    class="btn-icon-sm"
                                    @click="copyUninstall"
                                    title="Copy script"
                                >
                                    📋
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <footer class="modal-footer">
                    <span v-if="isDirty" class="dirty-hint"
                        >Settings apply automatically</span
                    >
                    <div class="footer-actions">
                        <button
                            v-if="isDirty"
                            class="btn-text"
                            @click="revertChanges"
                        >
                            Discard changes
                        </button>
                        <button class="btn-primary" @click="$emit('close')">
                            Done
                        </button>
                    </div>
                </footer>
            </main>
        </div>
    </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch, toRaw } from "vue";
import { useRouter } from "vue-router";
import { useAppStore } from "../../store";
import {
    useHints,
    markDefaultEditorActive,
} from "../../composables/useHints.js";
import ProviderForm from "./ProviderForm.vue";
import {
    User,
    Bot,
    Search,
    Keyboard,
    Share2,
    Palette,
    FolderTree,
    Shield,
    RefreshCw,
    Trash2,
} from "lucide-vue-next";

const props = defineProps({ initialTab: { type: String, default: "profile" } });
const emit = defineEmits(["close"]);
const router = useRouter();
const store = useAppStore();

const buildInfo = `build ${__BUILD_COMMIT__} · ${__BUILD_BRANCH__}`;
const activeTab = ref(props.initialTab);
const { enabled: hintsEnabled } = useHints();

const navItems = {
    all: "All Settings",
    profile: "Profile",
    providers: "AI",
    hotkeys: "Hotkeys",
    appearance: "Appearance",
    sharing: "Sharing",
    workspace: "Workspace",
    privacy: "Privacy",
    updates: "Updates",
    danger: "Reset",
};
const navIcons = {
    all: Search,
    profile: User,
    providers: Bot,
    hotkeys: Keyboard,
    appearance: Palette,
    sharing: Share2,
    workspace: FolderTree,
    privacy: Shield,
    updates: RefreshCw,
    danger: Trash2,
};
const activeTabLabel = computed(() => navItems[activeTab.value]);

let initialState = null;
const isDirty = ref(false);

const form = reactive({
    displayName: "",
    defaultWorkspacePath: "",
    telemetryEnabled: false,
    autoUpdate: true,
    updateChannel: "stable",
    windowBlur: false,
    windowTransparency: true,
    windowTransparencyOpacity: 0.88,
    editorParagraphSpacing: false,
    grainEnabled: false,
    grainOpacity: 0.02,
    tabsEnabled: true,
    tabsPosition: "bottom",
    clipboard: {
        copyOnSelect: false,
        middleClickPaste: false,
        ctrlClickPaste: false,
    },
    autoShareWorkspace: false,
    autoShareAllWorkspaces: false,
    sharingExcludedPaths: [],
    sharingDefaults: { scope: "file", permission: "view" },
    providers: [],
    assistant: {
        providerId: "",
        model: "",
        name: "Spark",
        extraInstructions: "",
    },
    completion: {
        enabled: false,
        providerId: "",
        model: "codestral-latest",
        debounceMs: 350,
        maxTokens: 25,
        wordBoundaryOnly: true,
        extraInstructions: "",
    },
    hotkeys: {
        selectLine: "Mod-l",
        moveUp: "Shift-ArrowUp",
        moveDown: "Shift-ArrowDown",
        findInDoc: "Mod-f",
        findInWorkspace: "Mod-Shift-f",
        findNext: "Mod-g",
        findPrev: "Mod-Shift-g",
    },
});

const newExcludedPath = ref("");
const isDefaultEditor = ref(false);

async function checkDefaultEditor() {
    isDefaultEditor.value = await window.canonic.app.isDefaultEditor();
    if (isDefaultEditor.value) markDefaultEditorActive();
}

async function toggleDefaultEditor() {
    await window.canonic.app.setDefaultEditor(!isDefaultEditor.value);
    await checkDefaultEditor();
}
function addExcludedPath() {
    const p = newExcludedPath.value.trim();
    if (!p) return;
    if (!form.sharingExcludedPaths.includes(p)) {
        form.sharingExcludedPaths.push(p);
    }
    newExcludedPath.value = "";
}

watch(
    form,
    (newVal) => {
        if (!initialState) return;
        isDirty.value = JSON.stringify(newVal) !== JSON.stringify(initialState);
        store.saveConfig(JSON.parse(JSON.stringify(newVal)));
    },
    { deep: true },
);

function revertChanges() {
    if (!initialState) return;
    Object.assign(form, JSON.parse(JSON.stringify(initialState)));
    isDirty.value = false;
}

function addProvider(p) {
    form.providers.push(p);
    addingProvider.value = false;
}
function updateProvider(idx, p) {
    form.providers.splice(idx, 1, p);
    editingProviderId.value = null;
}
function deleteProvider(idx) {
    form.providers.splice(idx, 1);
}

const editingProviderId = ref(null);
const addingProvider = ref(false);
const dangerBusy = ref(false);
const checkingUpdates = ref(false);
const updateStatus = ref("");
const wsShareLoading = ref(false);
const wsShareError = ref("");
const wsShareCopied = ref(false);

const tabsPositionOptions = [
    {
        value: "bottom",
        label: "Bottom",
        desc: "Tabs sit below the editor and any split panes.",
    },
    {
        value: "top",
        label: "Top",
        desc: "Tabs sit above the editor and any split panes.",
    },
];

const scopeOptions = [
    { value: "none", label: "Nothing", desc: "Sharing disabled by default" },
    {
        value: "file",
        label: "Current file",
        desc: "Share only the open document",
    },
    {
        value: "directory",
        label: "Directory",
        desc: "Share all docs in the same folder",
    },
    {
        value: "workspace",
        label: "Whole workspace",
        desc: "Share all documents in the workspace",
    },
];

const searchQuery = ref("");
const allSettingsMetadata = [
    {
        id: "displayName",
        label: "Display name",
        desc: "Used in git commits and comments.",
        tab: "profile",
    },
    {
        id: "defaultEditor",
        label: "Default editor",
        desc: "Set Canonic as the default for .md files.",
        tab: "profile",
    },
    {
        id: "hints",
        label: "Show feature hints",
        desc: "Tips shown at the bottom of the sidebar.",
        tab: "profile",
    },
    {
        id: "providers",
        label: "AI Providers",
        desc: "Configure custom AI backend endpoints and keys.",
        tab: "providers",
    },
    {
        id: "assistantName",
        label: "Assistant name",
        desc: "How the AI introduced itself.",
        tab: "providers",
    },
    {
        id: "assistantModel",
        label: "Assistant model",
        desc: "Main assistant provider and model.",
        tab: "providers",
    },
    {
        id: "completionEnabled",
        label: "Inline completions",
        desc: "Enable/disable ghost-text code suggestions.",
        tab: "providers",
    },
    {
        id: "transparency",
        label: "Window transparency",
        desc: "Semi-transparent backgrounds for the main window.",
        tab: "appearance",
    },
    {
        id: "transparencyOpacity",
        label: "Transparency opacity",
        desc: "Control how see-through the window is.",
        tab: "appearance",
    },
    {
        id: "blur",
        label: "Window blur",
        desc: "Native frosted-glass blur (macOS).",
        tab: "appearance",
    },
    {
        id: "grain",
        label: "Organic grain",
        desc: "Subtle analog photo grain pattern overlay.",
        tab: "appearance",
    },
    {
        id: "grainOpacity",
        label: "Grain intensity",
        desc: "How visible the grain texture is.",
        tab: "appearance",
    },
    {
        id: "paragraphSpacing",
        label: "Paragraph spacing",
        desc: "Add margin between paragraphs for better readability.",
        tab: "appearance",
    },
    {
        id: "editorTabs",
        label: "Editor tabs",
        desc: "Show a strip of tabs for files opened this session.",
        tab: "appearance",
    },
    {
        id: "editorTabsPosition",
        label: "Tab position",
        desc: "Show editor tabs on the top or bottom of the editor.",
        tab: "appearance",
    },
    {
        id: "copyOnSelect",
        label: "Copy on select",
        desc: "Automatically copy text to clipboard when selected.",
        tab: "appearance",
    },
    {
        id: "middleClickPaste",
        label: "Middle-click paste",
        desc: "Paste clipboard content with the middle mouse button.",
        tab: "appearance",
    },
    {
        id: "ctrlClickPaste",
        label: "Ctrl-click paste",
        desc: "Paste clipboard content with Ctrl + Click.",
        tab: "appearance",
    },
    {
        id: "shareScope",
        label: "Default share scope",
        desc: "What gets shared when you click 'Share'.",
        tab: "sharing",
    },
    {
        id: "sharePermission",
        label: "Default permission",
        desc: "View vs Comment permissions for peers.",
        tab: "sharing",
    },
    {
        id: "autoShareWorkspace",
        label: "Auto-share workspace",
        desc: "Share active workspace on startup.",
        tab: "sharing",
    },
    {
        id: "autoShareAllWorkspaces",
        label: "Auto-share all workspaces",
        desc: "Automatically share all recent workspaces on startup.",
        tab: "sharing",
    },
    {
        id: "sharingExcludedPaths",
        label: "Excluded paths",
        desc: "Paths that will never be shared.",
        tab: "sharing",
    },
    {
        id: "workspacePath",
        label: "Default workspace location",
        desc: "Where new projects are created by default.",
        tab: "workspace",
    },
    {
        id: "telemetry",
        label: "Usage logging",
        desc: "Share anonymous feature usage data.",
        tab: "privacy",
    },
    {
        id: "autoUpdate",
        label: "Auto-update",
        desc: "Download and install updates in background.",
        tab: "updates",
    },
    {
        id: "hotkeys",
        label: "Keyboard Shortcuts",
        desc: "Customize global and editor hotkeys.",
        tab: "hotkeys",
    },
];

function shouldShow(id, tab) {
    if (activeTab.value !== "all") {
        return activeTab.value === tab;
    }
    const query = searchQuery.value.toLowerCase().trim();
    if (!query) return true;
    const item = allSettingsMetadata.find((i) => i.id === id);
    if (!item) return false;
    return (
        item.label.toLowerCase().includes(query) ||
        item.desc.toLowerCase().includes(query)
    );
}

function anyVisibleInTab(tabKey) {
    if (activeTab.value !== "all") return activeTab.value === tabKey;
    const query = searchQuery.value.toLowerCase().trim();
    if (!query) return true;
    return allSettingsMetadata.some(
        (i) =>
            i.tab === tabKey &&
            (i.label.toLowerCase().includes(query) ||
                i.desc.toLowerCase().includes(query)),
    );
}

onMounted(async () => {
    checkDefaultEditor();
    const cfg = store.config || (await store.loadConfig());
    if (cfg) {
        const loaded = {
            displayName: cfg.displayName || "",
            defaultWorkspacePath: cfg.defaultWorkspacePath || "",
            telemetryEnabled: !!cfg.telemetryEnabled,
            autoUpdate: cfg.autoUpdate !== false,
            updateChannel: cfg.updateChannel || "stable",
            autoShareWorkspace: !!cfg.autoShareWorkspace,
            autoShareAllWorkspaces: !!cfg.autoShareAllWorkspaces,
            sharingExcludedPaths: JSON.parse(
                JSON.stringify(cfg.sharingExcludedPaths || []),
            ),
            sharingDefaults: {
                ...form.sharingDefaults,
                ...(cfg.sharingDefaults || {}),
            },
            providers: JSON.parse(JSON.stringify(cfg.providers || [])),
            assistant: { ...form.assistant, ...(cfg.assistant || {}) },
            completion: { ...form.completion, ...(cfg.completion || {}) },
            hotkeys: { ...form.hotkeys, ...(cfg.hotkeys || {}) },
            windowBlur: cfg.windowBlur === true,
            windowTransparency: cfg.windowTransparency !== false,
            windowTransparencyOpacity: cfg.windowTransparencyOpacity ?? 0.88,
            editorParagraphSpacing: cfg.editorParagraphSpacing === true,
            grainEnabled: !!cfg.grainEnabled,
            grainOpacity: cfg.grainOpacity ?? 0.02,
            tabsEnabled: cfg.tabsEnabled !== false,
            tabsPosition: cfg.tabsPosition === "top" ? "top" : "bottom",
            clipboard: {
                copyOnSelect: !!cfg.clipboard?.copyOnSelect,
                middleClickPaste: !!cfg.clipboard?.middleClickPaste,
                ctrlClickPaste: !!cfg.clipboard?.ctrlClickPaste,
            },
        };
        Object.assign(form, loaded);
        initialState = JSON.parse(JSON.stringify(loaded));
    }
});

async function browsePath() {
    const chosen = await window.canonic.workspace.openDirectoryDialog();
    if (chosen) form.defaultWorkspacePath = chosen;
}

function switchWorkspace() {
    emit("close");
    router.push("/");
}

async function checkUpdates() {
    checkingUpdates.value = true;
    try {
        const result = await window.canonic.update.check();
        updateStatus.value = result?.updateInfo
            ? `New version: ${result.updateInfo.version}`
            : "You are on the latest version.";
    } catch {
        updateStatus.value = "Error checking for updates.";
    } finally {
        checkingUpdates.value = false;
    }
}

async function startWsShare() {
    wsShareLoading.value = true;
    const result = await store.startWorkspaceShare();
    if (!result?.success)
        wsShareError.value = result?.error || "Failed to start";
    wsShareLoading.value = false;
}

async function stopWsShare() {
    await store.stopWorkspaceShare();
}
async function copyWsLink() {
    await navigator.clipboard.writeText(store.workspaceShareInfo.localUrl);
    wsShareCopied.value = true;
    setTimeout(() => {
        wsShareCopied.value = false;
    }, 2000);
}
function openWsInBrowser() {
    if (store.workspaceShareInfo?.localUrl)
        window.canonic.share.openLink(store.workspaceShareInfo.localUrl);
}
async function copyUninstall() {
    await navigator.clipboard.writeText("rm -rf ~/.config/canonic");
}
async function confirmReset() {
    if (!confirm("Delete all settings? This is irreversible.")) return;
    dangerBusy.value = true;
    const result = await window.canonic.cleanup.resetConfig();
    if (result.success) router.push("/");
    dangerBusy.value = false;
}
</script>

<style scoped>
/* ── Variables & Resets ── */
:where(.modal, .modal-sidebar, .modal-main) {
    font-family:
        ui-sans-serif,
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Roboto,
        "Helvetica Neue",
        Arial,
        sans-serif;
    -webkit-font-smoothing: antialiased;
}

.modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
}

.modal {
    background: var(--bg-surface);
    border: 1px solid var(--border-mid);
    border-radius: 10px;
    width: 820px;
    height: 580px;
    max-width: 95vw;
    max-height: 85vh;
    display: flex;
    overflow: hidden;
    box-shadow: 0 16px 32px rgba(0, 0, 0, 0.4);
}

/* ── Sidebar ── */
.modal-sidebar {
    width: 200px;
    background: var(--bg-surface);
    border-right: 1px solid var(--border-mid);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
}

.sidebar-header {
    padding: 20px 16px;
    border-bottom: 1px solid var(--border-mid);
}

.app-name {
    display: block;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 4px;
    color: var(--text-muted);
}
.app-name .accent {
    color: var(--accent);
}

.modal-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
}

.sidebar-tabs {
    flex: 1;
    padding: 8px 6px;
    display: flex;
    flex-direction: column;
    gap: 1px;
    overflow-y: auto;
}

.sidebar-tab {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.15s;
    text-align: left;
    width: 100%;
}
.sidebar-tab:hover:not(.active) {
    background: var(--bg-hover);
    color: var(--text-primary);
}
.sidebar-tab.active {
    background: var(--accent-muted);
    color: var(--accent-light);
}

.sidebar-tab--danger {
    margin-top: auto;
    color: var(--error);
    opacity: 0.7;
}
.sidebar-tab--danger:hover {
    background: rgba(231, 76, 60, 0.08) !important;
    opacity: 1;
}

.sidebar-spacer {
    flex: 1;
}

/* ── Main Content ── */
.modal-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--bg-surface);
    min-width: 0;
}

.modal-content-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    border-bottom: 1px solid var(--border-mid);
    flex-shrink: 0;
}

.tab-title {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
}

.close-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 1.25rem;
    padding: 4px;
    line-height: 1;
}
.close-btn:hover {
    color: var(--text-primary);
}

.tab-scroll-area {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
}

.tab-content {
    max-width: 560px;
}

/* ── Fields & Inputs ── */
.field {
    margin-bottom: 24px;
}

.field-label {
    display: block;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 8px;
    letter-spacing: 0.02em;
}

.field-input,
.field-select,
.field-textarea {
    width: 100%;
    background: var(--bg-base);
    border: 1px solid var(--border-mid);
    border-radius: 8px;
    padding: 10px 14px;
    color: var(--text-primary);
    font-size: 0.9375rem;
    font-family: inherit;
    outline: none;
    transition: all 0.15s;
    box-sizing: border-box;
}
.field-input:focus,
.field-select:focus,
.field-textarea:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-muted);
}

.field-textarea {
    resize: vertical;
    min-height: 80px;
    line-height: 1.5;
}

.field-hint {
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin-top: 8px;
    line-height: 1.5;
}

.field-badge {
    font-weight: 400;
    font-size: 0.75rem;
    color: var(--accent);
    margin-left: 8px;
}

.opacity-slider {
    flex: 1;
    accent-color: var(--accent);
    cursor: pointer;
}

.opacity-control-row {
    display: flex;
    align-items: center;
    gap: 16px;
}

.opacity-input-wrapper {
    position: relative;
    width: 80px;
    flex-shrink: 0;
}

.opacity-number-input {
    padding-right: 24px !important;
    text-align: right;
    font-variant-numeric: tabular-nums;
    -moz-appearance: textfield;
}

.opacity-number-input::-webkit-outer-spin-button,
.opacity-number-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

.opacity-percent-symbol {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.8125rem;
    color: var(--text-muted);
    pointer-events: none;
}

.section-heading {
    font-size: 0.8125rem;
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0;
    color: var(--text-secondary);
    margin: 20px 0 10px;
    border-bottom: 1px solid var(--border-mid);
    padding-bottom: 6px;
}
.section-heading:first-child {
    margin-top: 0;
}

/* ── Settings Cards ── */
.settings-card {
    padding: 16px 20px;
    background: var(--bg-base);
    border: 1px solid var(--border-mid);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.15s;
}
.settings-card:hover {
    border-color: var(--accent-muted);
}
.settings-card.active {
    border-color: var(--accent);
    background: var(--bg-active);
}

/* ── All Settings Tab ── */
.search-field {
    position: sticky;
    top: -24px;
    background: var(--bg-surface);
    margin-bottom: 24px;
    padding: 24px 0 12px;
    z-index: 5;
    margin-top: -24px;
}

.search-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
}

.search-icon {
    position: absolute;
    left: 14px;
    color: var(--text-muted);
}

.search-input {
    padding-left: 40px !important;
    font-size: 1rem !important;
}

.no-results {
    padding: 40px;
    text-align: center;
    color: var(--text-muted);
    font-style: italic;
}

.all-settings-item {
    margin-bottom: 12px;
}

.card-tab-badge {
    font-size: 0.7rem;
    padding: 2px 8px;
    border-radius: 10px;
    background: var(--accent-muted);
    color: var(--accent);
    font-weight: 600;
}

.all-tab-heading {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 40px 0 16px;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--border-mid);
    position: sticky;
    top: 36px;
    background: var(--bg-surface);
    z-index: 4;
}
.all-tab-heading:first-child {
    margin-top: 0;
}

.card-header,
.telemetry-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.card-label {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
}
.card-desc {
    font-size: 0.875rem;
    color: var(--text-muted);
    margin-top: 8px;
    line-height: 1.5;
}

/* ── Default Editor Button ── */
.default-editor-btn {
    display: inline-flex;
    align-items: center;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    border: 1px solid var(--accent);
    background: var(--accent);
    color: #fff;
}
.default-editor-btn:hover:not(:disabled) {
    opacity: 0.88;
}
.default-editor-btn--done {
    background: var(--bg-base);
    border-color: var(--border-mid);
    color: var(--text-muted);
    cursor: default;
}

/* ── UI Elements ── */
.toggle {
    width: 36px;
    height: 20px;
    background: var(--border-mid);
    border-radius: 10px;
    position: relative;
    transition: background 0.2s;
    flex-shrink: 0;
}
.toggle.on {
    background: var(--accent);
}
.toggle-thumb {
    width: 16px;
    height: 16px;
    background: white;
    border-radius: 50%;
    position: absolute;
    top: 2px;
    left: 2px;
    transition: transform 0.2s;
}
.toggle.on .toggle-thumb {
    transform: translateX(16px);
}

.kbd {
    display: inline-block;
    padding: 1px 5px;
    border: 1px solid var(--border-mid);
    border-radius: 4px;
    font-size: 0.75rem;
    font-family:
        ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    background: var(--bg-hover);
    color: var(--text-secondary);
}

.code-example {
    font-family:
        ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.8125rem;
    color: var(--text-muted);
    background: var(--bg-base);
    border: 1px solid var(--border-mid);
    border-radius: 8px;
    padding: 16px;
    line-height: 1.6;
}

/* ── Footer ── */
.modal-footer {
    padding: 12px 24px;
    border-top: 1px solid var(--border-mid);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-surface);
    flex-shrink: 0;
}

.dirty-hint {
    font-size: 0.8125rem;
    color: var(--text-muted);
    font-style: italic;
}

.footer-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
}

/* ── Buttons ── */
.btn-primary {
    padding: 10px 24px;
    border-radius: 8px;
    border: none;
    background: var(--accent);
    color: white;
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
}
.btn-primary:hover {
    opacity: 0.9;
}

.btn-secondary {
    padding: 9px 18px;
    border-radius: 8px;
    border: 1px solid var(--border-mid);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
}
.btn-secondary:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
    border-color: var(--border-mid);
}

.btn-ghost {
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.875rem;
    padding: 8px 12px;
}
.btn-ghost:hover {
    color: var(--text-primary);
}

.btn-text {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 0.875rem;
    cursor: pointer;
    text-decoration: none;
    padding: 9px 14px;
    border-radius: 8px;
}
.btn-text:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
}

/* ── Sharing ── */
.scope-options {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.scope-option {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border: 1px solid var(--border-mid);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
}
.scope-option input {
    display: none;
}
.scope-option.selected {
    border-color: var(--accent);
    background: var(--bg-active);
    box-shadow: 0 0 0 1px var(--accent);
}
.scope-option:hover:not(.selected) {
    border-color: var(--accent-muted);
    background: var(--bg-hover);
}
.scope-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.scope-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
}
.scope-desc {
    font-size: 0.775rem;
    color: var(--text-muted);
    line-height: 1.3;
}

/* ── Excluded Paths ── */
.excluded-paths-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--bg-base);
    border: 1px solid var(--border-mid);
    border-radius: 12px;
    padding: 12px;
}
.excluded-path-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    background: var(--bg-surface);
    border: 1px solid var(--border-mid);
    border-radius: 6px;
}
.path-text {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    font-family:
        ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.remove-path-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.75rem;
    padding: 2px 6px;
    border-radius: 4px;
}
.remove-path-btn:hover {
    background: rgba(231, 76, 60, 0.1);
    color: var(--error);
}
.add-path-row {
    display: flex;
    gap: 8px;
    margin-top: 4px;
}
.add-path-btn {
    padding: 6px 14px;
    border-radius: 6px;
    border: none;
    background: var(--accent);
    color: white;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
}
.add-path-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* ── Live Sharing Status ── */
.sharing-live-status {
    margin-top: 12px;
    padding: 12px;
    background: rgba(34, 197, 94, 0.05);
    border: 1px solid rgba(34, 197, 94, 0.2);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.status-pulse-group {
    display: flex;
    align-items: center;
    gap: 8px;
}
.status-dot-pulse {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 0 rgba(34, 197, 94, 0.4);
    animation: pulse-green 2s infinite;
}
.status-text-live {
    font-size: 0.75rem;
    font-weight: 600;
    color: #22c55e;
    text-transform: uppercase;
    letter-spacing: 0.02em;
}
.sharing-stats-row {
    display: flex;
    gap: 16px;
}
.sharing-stat {
    font-size: 0.8125rem;
    color: var(--text-secondary);
}
.sharing-stat b {
    color: var(--text-primary);
}

@keyframes pulse-green {
    0% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7);
    }
    70% {
        transform: scale(1);
        box-shadow: 0 0 0 10px rgba(34, 197, 94, 0);
    }
    100% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
    }
}

/* ── Providers ── */
.providers-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 20px;
}
.provider-row {
    background: var(--bg-base);
    border: 1px solid var(--border-mid);
    border-radius: 10px;
    padding: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.provider-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
}
.provider-label {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
}
.provider-url {
    font-size: 0.8125rem;
    color: var(--text-muted);
    font-family:
        ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.provider-key-mask {
    font-size: 0.75rem;
    color: var(--text-muted);
    opacity: 0.6;
}
.provider-actions {
    display: flex;
    gap: 8px;
    margin-left: 16px;
}
.provider-btn {
    padding: 6px 14px;
    border-radius: 6px;
    border: 1px solid var(--border-mid);
    background: var(--bg-surface);
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s;
}
.provider-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}
.provider-btn.danger {
    color: var(--error);
}
.provider-btn.danger:hover {
    background: rgba(231, 76, 60, 0.08);
    border-color: rgba(231, 76, 60, 0.3);
}

.add-provider-btn {
    padding: 12px;
    border-radius: 10px;
    border: 2px dashed var(--border-mid);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    width: 100%;
    transition: all 0.15s;
}
.add-provider-btn:hover {
    border-color: var(--accent-muted);
    background: var(--bg-hover);
    color: var(--text-primary);
}

/* ── Workspace ── */
.path-input {
    display: flex;
    gap: 10px;
}
.browse-btn {
    padding: 0 18px;
    border-radius: 8px;
    border: 1px solid var(--border-mid);
    background: var(--bg-base);
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
}
.browse-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.workspace-info {
    padding: 20px;
    background: var(--bg-base);
    border: 1px solid var(--border-mid);
    border-radius: 12px;
    margin-top: 16px;
}
.info-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: 6px;
}
.info-path {
    font-size: 0.875rem;
    color: var(--text-primary);
    font-family:
        ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    margin-bottom: 16px;
    word-break: break-all;
}
.switch-btn {
    padding: 8px 16px;
    border-radius: 6px;
    border: 1px solid var(--border-mid);
    background: var(--bg-surface);
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
}

.ws-share-section {
    margin-top: 32px;
    padding-top: 32px;
    border-top: 1px solid var(--border);
}
.ws-share-active {
    display: flex;
    flex-direction: column;
    gap: 16px;
}
.ws-stat-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.ws-status-live {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--success);
}
.status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--success);
    animation: pulse 2s infinite;
}
@keyframes pulse {
    0%,
    100% {
        opacity: 1;
        transform: scale(1);
    }
    50% {
        opacity: 0.5;
        transform: scale(0.9);
    }
}
.ws-pills {
    display: flex;
    gap: 8px;
}
.ws-pill {
    font-size: 0.75rem;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: 20px;
    border: 1px solid var(--border-mid);
    color: var(--text-muted);
}

.ws-link-row {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--bg-base);
    border: 1px solid var(--border-mid);
    border-radius: 10px;
    padding: 10px 16px;
}
.ws-link-text {
    flex: 1;
    font-family:
        ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ws-copy-btn {
    flex-shrink: 0;
    padding: 4px 12px;
    border-radius: 6px;
    border: 1px solid var(--border-mid);
    background: var(--bg-surface);
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
}
.ws-copy-btn.copied {
    color: var(--success);
    border-color: var(--success);
}
.ws-actions {
    display: flex;
    gap: 10px;
}

/* ── Danger & Technical ── */
.danger-zone-card {
    border: 1px solid rgba(231, 76, 60, 0.3);
    border-radius: 12px;
    padding: 24px;
    background: rgba(231, 76, 60, 0.02);
}
.danger-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 8px;
}
.danger-desc {
    font-size: 0.875rem;
    color: var(--text-muted);
    margin-bottom: 20px;
    line-height: 1.5;
}
.btn-danger-outline {
    padding: 10px 24px;
    border-radius: 8px;
    border: 1px solid var(--error);
    background: transparent;
    color: var(--error);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
}
.btn-danger-outline:hover {
    background: var(--error);
    color: white;
}

.code-block {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: var(--bg-base);
    border: 1px solid var(--border-mid);
    border-radius: 10px;
    padding: 12px 16px;
}
.code-block pre {
    font-family:
        ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0;
}

.kbd-input {
    font-family:
        ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-weight: 600;
    color: var(--accent-light);
    letter-spacing: 0.05em;
}

.update-status {
    font-size: 0.875rem;
    color: var(--text-muted);
    margin-left: 16px;
}

.btn-icon-sm {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    border: 1px solid var(--border-mid);
    background: var(--bg-surface);
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
}
.btn-icon-sm:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
}
</style>
