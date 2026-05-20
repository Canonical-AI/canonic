cask "canonic" do
  version "0.0.4-alpha"
  sha256 "57621e5dd681f2638ed4e95a235c305684de85b71bd3af9ad1371533c41e56ad"

  url "https://github.com/Canonical-AI/canonic/releases/download/v#{version}/Canonic-#{version}-arm64.dmg"
  name "Canonic"
  desc "Local-first markdown document editor with git versioning"
  homepage "https://github.com/Canonical-AI/canonic"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "Canonic.app"

  zap trash: [
    "~/.config/canonic",
    "~/Library/Application Support/Canonic",
    "~/Library/Preferences/ai.canonic.app.plist",
    "~/Library/Saved Application State/ai.canonic.app.savedState",
  ]
end
