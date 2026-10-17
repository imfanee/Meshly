#!/usr/bin/env bash
# Meshly TURN: install and configure coturn inside the LXC container.
#
# Run inside the container (from the Proxmox host):
#   pct push <CTID> container-setup.sh /root/container-setup.sh
#   pct push <CTID> turnserver.conf.template /root/turnserver.conf.template
#   pct push <CTID> turn.env /root/turn.env --perms 600
#   pct exec <CTID> -- bash /root/container-setup.sh
#
# Idempotent: safe to re-run (re-renders config, keeps an existing certificate).
# /root/turn.env is shredded at the end.

set -euo pipefail

ENV_FILE=/root/turn.env
TEMPLATE=/root/turnserver.conf.template

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "==> $*"; }

[ "$(id -u)" -eq 0 ] || die "run as root"
[ -f "$ENV_FILE" ] || die "missing $ENV_FILE"
[ -f "$TEMPLATE" ] || die "missing $TEMPLATE"
# shellcheck source=/dev/null
. "$ENV_FILE"

for v in TURN_DOMAIN PUBLIC_IP CT_IP ACME_EMAIL TURN_SECRET RELAY_MIN RELAY_MAX BPS_CAPACITY MAX_BPS; do
    [ -n "${!v:-}" ] || die "$v is not set in $ENV_FILE"
done
[[ "$TURN_SECRET" =~ ^[0-9a-f]{64}$ ]] || die "TURN_SECRET must be 64 lowercase hex characters"

export DEBIAN_FRONTEND=noninteractive

info "Installing packages"
apt-get update -q
apt-get -y -q upgrade
apt-get install -y -q coturn certbot gettext-base unattended-upgrades vnstat ca-certificates curl dnsutils

info "Enabling unattended security upgrades"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

info "Checking DNS: $TURN_DOMAIN must resolve to $PUBLIC_IP"
resolved="$(dig +short A "$TURN_DOMAIN" @1.1.1.1 | tail -n1)"
[ "$resolved" = "$PUBLIC_IP" ] || die "$TURN_DOMAIN resolves to '${resolved:-nothing}', expected $PUBLIC_IP. Fix the DNS A record and retry."

systemctl stop coturn 2>/dev/null || true
[ -f /etc/default/coturn ] && sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn

info "Rendering /etc/turnserver.conf"
export TURN_DOMAIN PUBLIC_IP CT_IP TURN_SECRET RELAY_MIN RELAY_MAX BPS_CAPACITY MAX_BPS
envsubst '${TURN_DOMAIN} ${PUBLIC_IP} ${CT_IP} ${TURN_SECRET} ${RELAY_MIN} ${RELAY_MAX} ${BPS_CAPACITY} ${MAX_BPS}' \
    < "$TEMPLATE" > /etc/turnserver.conf
chown root:turnserver /etc/turnserver.conf
chmod 640 /etc/turnserver.conf

info "Installing certbot deploy hook"
mkdir -p /etc/letsencrypt/renewal-hooks/deploy /etc/coturn/certs
cat > /etc/letsencrypt/renewal-hooks/deploy/meshly-coturn.sh <<'EOF'
#!/bin/sh
# Copy renewed certificate where the turnserver user can read it, then restart coturn.
set -e
install -o turnserver -g turnserver -m 600 "$RENEWED_LINEAGE/fullchain.pem" /etc/coturn/certs/fullchain.pem
install -o turnserver -g turnserver -m 600 "$RENEWED_LINEAGE/privkey.pem" /etc/coturn/certs/privkey.pem
systemctl restart coturn
EOF
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/meshly-coturn.sh

if [ ! -f "/etc/letsencrypt/live/$TURN_DOMAIN/fullchain.pem" ]; then
    info "Requesting Let's Encrypt certificate (HTTP-01 on port 80, forwarded by the host)"
    certbot certonly --standalone --non-interactive --agree-tos \
        -m "$ACME_EMAIL" -d "$TURN_DOMAIN" --preferred-challenges http
else
    info "Certificate already present"
fi
RENEWED_LINEAGE="/etc/letsencrypt/live/$TURN_DOMAIN" sh /etc/letsencrypt/renewal-hooks/deploy/meshly-coturn.sh || true

info "Starting services"
systemctl enable --now vnstat
systemctl enable coturn
systemctl restart coturn
sleep 2
systemctl is-active --quiet coturn || { journalctl -u coturn --no-pager -n 50; die "coturn failed to start"; }

info "Listening sockets"
ss -tulpn | grep -E 'turnserver' || true

info "Renewal dry run"
certbot renew --dry-run --quiet && echo "certificate renewal OK" || echo "WARNING: renewal dry run failed; check port 80 forwarding"

shred -u "$ENV_FILE" 2>/dev/null || rm -f "$ENV_FILE"
info "Done. coturn is running for $TURN_DOMAIN. $ENV_FILE has been removed."
