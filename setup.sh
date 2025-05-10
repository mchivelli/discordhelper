#!/bin/bash
# Interactive setup script for Discord Task Bot
# This will prompt for environment variables and set up the bot to run seamlessly

# Terminal colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Function to check if command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Clear screen and show header
clear
echo -e "${BLUE}${BOLD}========================================${NC}"
echo -e "${BLUE}${BOLD}   Discord Task Bot - Setup Wizard     ${NC}"
echo -e "${BLUE}${BOLD}========================================${NC}"
echo ""

# Check for Ubuntu
if [ -f /etc/os-release ]; then
  . /etc/os-release
  if [[ "$ID" == "ubuntu" ]]; then
    echo -e "${GREEN}✅ Ubuntu detected: $PRETTY_NAME${NC}"
  else
    echo -e "${YELLOW}⚠️ Non-Ubuntu system detected: $PRETTY_NAME${NC}"
    echo -e "This script is optimized for Ubuntu, but we'll try to make it work."
  fi
else
  echo -e "${YELLOW}⚠️ Could not determine OS${NC}"
fi

# Check Docker and Docker Compose
echo -e "\n${BOLD}Checking dependencies...${NC}"
if command_exists docker; then
  echo -e "${GREEN}✅ Docker is installed${NC}"
else
  echo -e "${RED}❌ Docker is not installed${NC}"
  echo -e "Install Docker with:"
  echo -e "  ${CYAN}curl -fsSL https://get.docker.com | sh${NC}"
  echo -e "  ${CYAN}sudo usermod -aG docker $USER${NC}"
  exit 1
fi

if command_exists docker-compose || command_exists "docker compose"; then
  echo -e "${GREEN}✅ Docker Compose is installed${NC}"
else
  echo -e "${RED}❌ Docker Compose is not installed${NC}"
  echo -e "Install Docker Compose with:"
  echo -e "  ${CYAN}sudo apt-get install docker-compose-plugin${NC}"
  exit 1
fi

# Ensure we're in the project directory
cd "$(dirname "$0")"
PROJECT_DIR=$(pwd)
echo -e "\n${BOLD}Project directory: ${PROJECT_DIR}${NC}"

# Create .env file from user input
echo -e "\n${BOLD}Setting up environment variables...${NC}"
echo -e "${YELLOW}These will be saved in .env file and used by Docker${NC}"

# Discord Token
echo -e "\n${CYAN}${BOLD}Discord Bot Token${NC}"
read -p "Enter your Discord bot token: " DISCORD_TOKEN
while [ -z "$DISCORD_TOKEN" ]; do
  echo -e "${RED}Discord token is required${NC}"
  read -p "Enter your Discord bot token: " DISCORD_TOKEN
done

# OpenRouter API Key (optional)
echo -e "\n${CYAN}${BOLD}OpenRouter API Key${NC}"
echo -e "${YELLOW}Required for AI-enhanced features${NC}"
read -p "Enter your OpenRouter API key (leave blank to use fallbacks): " OPENROUTER_API_KEY

# AI Model Selection (if API key is provided)
if [ -n "$OPENROUTER_API_KEY" ]; then
  echo -e "\n${CYAN}${BOLD}AI Model Selection${NC}"
  echo -e "1) openai/gpt-3.5-turbo (Fast, cost-effective)"
  echo -e "2) anthropic/claude-3-haiku (Balanced performance)"
  echo -e "3) openai/gpt-4o (Most capable, but more expensive)"
  read -p "Choose a model (1-3, default: 1): " MODEL_CHOICE
  
  case $MODEL_CHOICE in
    2) MODEL_NAME="anthropic/claude-3-haiku" ;;
    3) MODEL_NAME="openai/gpt-4o" ;;
    *) MODEL_NAME="openai/gpt-3.5-turbo" ;;
  esac
  
  echo -e "Selected model: ${MAGENTA}${MODEL_NAME}${NC}"
else
  MODEL_NAME="openai/gpt-3.5-turbo"
fi

# Guild ID (optional)
echo -e "\n${CYAN}${BOLD}Discord Guild ID${NC}"
echo -e "${YELLOW}Optional: For faster command updates during development${NC}"
read -p "Enter your development Discord server ID (optional): " GUILD_ID

# Timezone selection
echo -e "\n${CYAN}${BOLD}Timezone${NC}"
if command_exists tzselect; then
  echo -e "Your current timezone appears to be: $(cat /etc/timezone 2>/dev/null || date +%Z)"
else
  echo -e "Your current timezone appears to be: $(date +%Z)"
fi
read -p "Enter your timezone (e.g., UTC, America/New_York, Europe/Berlin) [UTC]: " TZ
TZ=${TZ:-UTC}

# Data directory
echo -e "\n${CYAN}${BOLD}Data Directory${NC}"
read -p "Enter path for data storage [./data]: " DATA_DIR
DATA_DIR=${DATA_DIR:-./data}
mkdir -p "$DATA_DIR"
echo -e "${GREEN}✅ Data directory created at ${DATA_DIR}${NC}"

# Create .env file
echo -e "\n${BOLD}Creating .env file...${NC}"
cat > .env << EOF
# Discord Bot Configuration
DISCORD_TOKEN=${DISCORD_TOKEN}
GUILD_ID=${GUILD_ID}

# OpenRouter AI Configuration
OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
MODEL_NAME=${MODEL_NAME}

# Data Storage
DB_PATH=/app/data/database.sqlite

# System Configuration
NODE_ENV=production
TZ=${TZ}
HEALTH_PORT=3000
EOF

echo -e "${GREEN}✅ .env file created${NC}"

# Update docker-compose.yml to mount the correct data directory
echo -e "\n${BOLD}Updating Docker Compose configuration...${NC}"
sed -i "s|./data:/app/data|${DATA_DIR}:/app/data|g" docker-compose.yml
echo -e "${GREEN}✅ Docker Compose updated to use data directory: ${DATA_DIR}${NC}"

# Ask user if they want to start the bot now
echo -e "\n${BLUE}${BOLD}========================================${NC}"
echo -e "${GREEN}${BOLD}Setup Complete!${NC}"
echo -e "${BLUE}${BOLD}========================================${NC}"
echo -e "\nYou can now start the bot using:"
echo -e "  ${CYAN}docker-compose up -d${NC}"
echo -e "\nTo view logs:"
echo -e "  ${CYAN}docker-compose logs -f${NC}"

read -p "Would you like to start the bot now? (y/N): " START_NOW
if [[ "$START_NOW" =~ ^[Yy]$ ]]; then
  echo -e "\n${BOLD}Starting Discord Task Bot...${NC}"
  docker-compose up --build -d
  
  echo -e "\n${YELLOW}Waiting for bot to initialize...${NC}"
  sleep 10
  
  echo -e "\n${BOLD}Bot logs:${NC}"
  docker-compose logs --tail 20
  
  echo -e "\n${GREEN}${BOLD}Discord Task Bot is now running!${NC}"
  echo -e "You can view logs at any time with: ${CYAN}docker-compose logs -f${NC}"
  echo -e "To stop the bot: ${CYAN}docker-compose down${NC}"
else
  echo -e "\n${YELLOW}Bot not started.${NC}"
  echo -e "Start manually with: ${CYAN}docker-compose up -d${NC}"
fi

echo -e "\n${BOLD}Thank you for using Discord Task Bot!${NC}"
