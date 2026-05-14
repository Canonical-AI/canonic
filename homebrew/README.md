# Homebrew Installation

You can install Canonic using Homebrew Cask.

## Option 1: Local Installation
If you have this repository cloned locally, you can install the cask directly:

```bash
brew install --cask homebrew/Casks/canonic.rb
```

## Option 2: Custom Tap (Recommended for distribution)
To allow others to install Canonic via `brew install Canonical-AI/tap/canonic`, you should:

1. Create a new repository named `homebrew-tap` under the `Canonical-AI` organization.
2. Move the `Casks/canonic.rb` file to that repository (specifically to a `Casks/` folder).
3. Users can then install it with:

```bash
brew tap Canonical-AI/tap
brew install --cask canonic
```

## Automation: Keeping the Cask updated
To automatically update the version and SHA256 in your tap whenever you release a new version of Canonic, you can use a GitHub Action in this repository.

Example workflow step:
```yaml
- name: Update Homebrew Cask
  uses: mislav/bump-homebrew-formula-action@v3
  with:
    formula-name: canonic
    formula-path: Casks/canonic.rb
    homebrew-tap: Canonical-AI/homebrew-tap
    download-url: https://github.com/Canonical-AI/canonic/releases/download/v${{ steps.get-version.outputs.version }}/Canonic-${{ steps.get-version.outputs.version }}-arm64.dmg
  env:
    COMMITTER_TOKEN: ${{ secrets.HOMEBREW_TAP_TOKEN }}
```

## Option 3: Official Homebrew Cask
Once Canonic is stable and meets Homebrew's requirements (stars, age, etc.), you can submit it to the official [homebrew/cask](https://github.com/Homebrew/homebrew-cask) repository.
