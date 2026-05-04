#!/bin/bash

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) is not installed. Install it with 'brew install gh'."
    exit 1
fi

# Check if logged in to gh
if ! gh auth status &> /dev/null; then
    echo "Error: Not logged into GitHub CLI. Run 'gh auth login' first."
    exit 1
fi

# Load .env file
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "Error: .env file not found."
    exit 1
fi

# Variables to sync
SECRETS=("APPLE_ID" "APPLE_APP_SPECIFIC_PASSWORD" "APPLE_TEAM_ID")

# Sync Apple Credentials
for secret in "${SECRETS[@]}"; do
    if [ -z "${!secret}" ]; then
        echo "Warning: $secret not found in .env, skipping..."
    else
        echo "Syncing $secret..."
        gh secret set "$secret" --body "${!secret}"
    fi
done

# Special handling for CSC_LINK (p12 certificate)
if [ -f "certificate.p12" ]; then
    echo "Syncing CSC_LINK (from certificate.p12)..."
    CSC_LINK_BASE64=$(base64 -i certificate.p12)
    gh secret set CSC_LINK --body "$CSC_LINK_BASE64"

    if [ -n "$CSC_KEY_PASSWORD" ]; then
        echo "Syncing CSC_KEY_PASSWORD..."
        gh secret set CSC_KEY_PASSWORD --body "$CSC_KEY_PASSWORD"
    else
        echo "Warning: CSC_KEY_PASSWORD not found in .env. You will need to set it manually if your p12 is encrypted."
    fi
else
    echo "Warning: certificate.p12 not found in current directory, skipping CSC_LINK sync."
fi

echo "Done! Secrets synced to GitHub."
