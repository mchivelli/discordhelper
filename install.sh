#!/bin/bash
# Quick installation script for Ubuntu systems
# Downloads and sets up the Discord Task Bot with Docker

# Terminal colors
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo -e "${BOLD}Discord Task Bot - Ubuntu Installation Script${NC}"
echo -e "${YELLOW}This script will install Docker and set up the Discord Task Bot${NC}"
echo ""

# Install Docker if not already installed
if ! command -v docker &> /dev/null; then
  echo -e "${BOLD}Installing Docker...${NC}"
  sudo apt-get update
  sudo apt-get install -y apt-transport-https ca-certificates curl software-properties-common
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker $USER
  echo -e "${GREEN}Docker installed. You may need to log out and back in for group changes to take effect.${NC}"
else
  echo -e "${GREEN}Docker already installed.${NC}"
fi

# Install Docker Compose if not already installed
if ! command -v docker-compose &> /dev/null && ! command -v "docker compose" &> /dev/null; then
  echo -e "${BOLD}Installing Docker Compose...${NC}"
  sudo apt-get update
  sudo apt-get install -y docker-compose-plugin
  echo -e "${GREEN}Docker Compose installed.${NC}"
else
  echo -e "${GREEN}Docker Compose already installed.${NC}"
fi

# Create directory and cd into it
BOT_DIR=${1:-"discord-task-bot"}
echo -e "${BOLD}Creating directory: ${BOT_DIR}${NC}"
mkdir -p "$BOT_DIR"
cd "$BOT_DIR"

# Run the setup script
echo -e "${BOLD}Running setup wizard...${NC}"
chmod +x setup.sh
./setup.sh

echo -e "\n${BOLD}Installation complete!${NC}"
echo -e "${YELLOW}If you've just installed Docker, you might need to log out and back in${NC}"
echo -e "${YELLOW}before you can run Docker commands without sudo.${NC}"
echo -e "\nRun the bot with: ${CYAN}cd $BOT_DIR && docker-compose up -d${NC}"
