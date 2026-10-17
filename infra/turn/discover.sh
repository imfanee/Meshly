#!/usr/bin/env bash
# Meshly TURN: read-only discovery of the Proxmox host.
# Makes NO changes. Run as root on the Proxmox host:
#   bash /root/meshly/discover.sh > /root/meshly/discovery.txt 2>&1
# The output contains infrastructure details: keep it in .secrets/, never commit it.

set -u

section() { printf '\n===== %s =====\n' "$1"; }

section "Identity"
hostname
pveversion 2>/dev/null || echo "pveversion not found (is this a Proxmox host?)"
uname -r

section "CPU and memory"
echo "cpus: $(nproc)"
free -m

section "Storage"
pvesm status 2>/dev/null || true
df -h / /var/lib/vz 2>/dev/null || df -h /

section "Interfaces"
ip -br addr

section "Bridges"
ip -br link show type bridge

section "IPv4 routes"
ip -4 route

section "Public source address (default route)"
ip -4 route get 1.1.1.1 2>/dev/null | grep -oE 'src [0-9.]+' || echo "unknown"

section "/etc/network/interfaces"
cat /etc/network/interfaces
if [ -d /etc/network/interfaces.d ] && [ -n "$(ls -A /etc/network/interfaces.d 2>/dev/null)" ]; then
    section "/etc/network/interfaces.d/*"
    for f in /etc/network/interfaces.d/*; do echo "--- $f"; cat "$f"; done
fi

section "ifupdown2 installed"
dpkg -l ifupdown2 2>/dev/null | awk '/^ii/ {print $2, $3}' || echo "no"

section "Private IPv4 subnets already in use"
ip -4 addr | grep -oE 'inet (10\.[0-9.]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9.]+|192\.168\.[0-9.]+)/[0-9]+' | sort -u || echo "none"

section "Guests"
echo "--- containers"; pct list 2>/dev/null || true
echo "--- VMs"; qm list 2>/dev/null || true

section "Next free guest ID"
pvesh get /cluster/nextid 2>/dev/null || echo "unknown"

section "Listening sockets"
ss -tulpn

section "Ports needed by Meshly TURN"
for spec in tcp:80 tcp:443 tcp:3478 udp:3478 tcp:5349; do
    proto="${spec%%:*}"; port="${spec##*:}"
    if ss -H -l -n "--$proto" 2>/dev/null | awk '{print $5}' | grep -Eq "[:.]${port}$"; then
        echo "$proto/$port IN USE on host"
    else
        echo "$proto/$port free on host"
    fi
done
used_relay=$(ss -H -uln 2>/dev/null | awk '{print $5}' | awk -F: '{print $NF}' | awk '$1>=49160 && $1<=49660' | sort -un | tr '\n' ' ')
echo "udp relay range 49160-49660 in use on host: ${used_relay:-none}"

section "IP forwarding"
sysctl net.ipv4.ip_forward

section "iptables nat"
iptables -t nat -S 2>/dev/null || echo "iptables not available"

section "iptables filter (first 120 lines)"
iptables -S 2>/dev/null | head -120

section "nftables ruleset (first 120 lines)"
nft list ruleset 2>/dev/null | head -120 || echo "nft not available"

section "Proxmox firewall"
pve-firewall status 2>/dev/null || echo "pve-firewall not available"
systemctl is-active proxmox-firewall 2>/dev/null && echo "proxmox-firewall (nftables) is active"
[ -f /etc/pve/firewall/cluster.fw ] && { echo "--- cluster.fw"; cat /etc/pve/firewall/cluster.fw; }
[ -f "/etc/pve/nodes/$(hostname)/host.fw" ] && { echo "--- host.fw"; cat "/etc/pve/nodes/$(hostname)/host.fw"; }

section "Existing Meshly artefacts"
ls -la /root/meshly 2>/dev/null || echo "none"
systemctl status meshly-turn-nat.service --no-pager 2>/dev/null | head -5 || true

section "Container templates"
echo "--- downloaded"; pveam list local 2>/dev/null || true
echo "--- available Debian system templates"; pveam available --section system 2>/dev/null | grep -E 'debian-1[2-9]' || echo "run 'pveam update' to refresh the list"

section "Time sync"
timedatectl 2>/dev/null | head -6 || date

echo
echo "Discovery complete. No changes were made."
