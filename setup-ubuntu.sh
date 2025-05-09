#!/bin/bash
# Automated setup script for Discord Task Bot on Ubuntu
set -e

echo "=== Discord Task Bot - Ubuntu Setup Script ==="
echo "This script will install all dependencies and prepare your environment."

# Check if running as root (sudo)
if [ "$(id -u)" -ne 0 ]; then
  echo "Please run this script with sudo: sudo ./setup-ubuntu.sh"
  exit 1
fi

echo "=== Updating system packages ==="
apt-get update

echo "=== Installing Node.js ==="
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  apt-get install -y nodejs
  echo "Node.js installed: $(node -v)"
else
  echo "Node.js already installed: $(node -v)"
fi

echo "=== Installing build dependencies for better-sqlite3 ==="
apt-get install -y python3 make g++ build-essential

echo "=== Installing project dependencies ==="
npm install

echo "=== Creating data directory ==="
mkdir -p data
chmod 755 data

# Check if .env exists, create from example if not
if [ ! -f .env ]; then
  echo "=== Setting up environment variables ==="
  cp .env.example .env
  echo "Created .env from example. Please edit it with your tokens and API keys."
else
  echo ".env file already exists, skipping creation"
fi

echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "1. Edit your .env file with your Discord token and OpenRouter API key"
echo "2. Register slash commands: npm run deploy-commands"
echo "3. Start the bot: npm start (or npm run dev for development)"
echo ""
echo "Thank you for using Discord Task Bot!"
