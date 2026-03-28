import * as pulumi from "@pulumi/pulumi";
import * as digitalocean from "@pulumi/digitalocean";
import * as fs from "fs";
import * as path from "path";

// Read all .pub files from keys/ directory
// To add a teammate: drop their id_ed25519.pub into keys/<name>.pub and run pulumi up
const keysDir = path.join(__dirname, "keys");
const keyFiles = fs.readdirSync(keysDir).filter((f) => f.endsWith(".pub"));

const sshKeys = keyFiles.map((file) => {
  const name = path.basename(file, ".pub");
  const publicKey = fs.readFileSync(path.join(keysDir, file), "utf8").trim();
  return new digitalocean.SshKey(`orchid-${name}`, {
    name: `orchid-${name}`,
    publicKey,
  });
});

// Collect all public keys for authorized_keys
const allPubKeys = keyFiles
  .map((file) => fs.readFileSync(path.join(keysDir, file), "utf8").trim())
  .join("\n");

// Cloud-init: install everything the agent needs
const userData = `#!/bin/bash
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive

# System updates
apt-get update && apt-get -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" upgrade

# Essentials
apt-get install -y curl git build-essential unzip jq htop tmux

# Node.js 22 via fnm
export HOME=/root
curl -fsSL https://fnm.vercel.app/install | bash
export PATH="/root/.local/share/fnm:$PATH"
eval "$(fnm env --shell bash)"
fnm install 22
fnm default 22

# Make fnm available in future sessions
cat >> /root/.bashrc << 'BASHRC'
export PATH="/root/.local/share/fnm:$PATH"
eval "$(fnm env --shell bash)"
BASHRC

# pnpm
npm install -g pnpm

# uv (Python)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker

# GitHub CLI
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli-stable.list > /dev/null
apt-get update && apt-get install -y gh

# Claude Code
npm install -g @anthropic-ai/claude-code

# OpenAI Codex CLI
npm install -g @openai/codex

# Caddy (reverse proxy for web apps)
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy

echo "Orchid agent VPS setup complete" > /root/READY
`;

// Droplet — 8 CPU, 16GB RAM, good for running the agent + deploying apps
const droplet = new digitalocean.Droplet("orchid-agent", {
  name: "orchid-agent",
  image: "ubuntu-24-04-x64",
  region: digitalocean.Region.NYC1,
  size: "s-8vcpu-16gb", // $96/mo — 8 vCPU, 16GB RAM, 320GB SSD
  sshKeys: sshKeys.map((k) => k.fingerprint),
  userData: userData,
  monitoring: true,
  backups: false,
});

// Firewall — SSH + HTTP/HTTPS + all outbound
const firewall = new digitalocean.Firewall("orchid-agent", {
  name: "orchid-agent",
  dropletIds: [droplet.id.apply((id) => parseInt(id))],
  inboundRules: [
    {
      protocol: "tcp",
      portRange: "22",
      sourceAddresses: ["0.0.0.0/0", "::/0"],
    },
    {
      protocol: "tcp",
      portRange: "80",
      sourceAddresses: ["0.0.0.0/0", "::/0"],
    },
    {
      protocol: "tcp",
      portRange: "443",
      sourceAddresses: ["0.0.0.0/0", "::/0"],
    },
    {
      protocol: "tcp",
      portRange: "3000",
      sourceAddresses: ["0.0.0.0/0", "::/0"],
    },
    {
      protocol: "icmp",
      sourceAddresses: ["0.0.0.0/0", "::/0"],
    },
  ],
  outboundRules: [
    {
      protocol: "tcp",
      portRange: "1-65535",
      destinationAddresses: ["0.0.0.0/0", "::/0"],
    },
    {
      protocol: "udp",
      portRange: "1-65535",
      destinationAddresses: ["0.0.0.0/0", "::/0"],
    },
    {
      protocol: "icmp",
      destinationAddresses: ["0.0.0.0/0", "::/0"],
    },
  ],
});

// Outputs
export const ip = droplet.ipv4Address;
export const sshCommand = pulumi.interpolate`ssh -i ~/.ssh/orchid-agent root@${droplet.ipv4Address}`;
export const dropletId = droplet.id;
export const dropletStatus = droplet.status;
