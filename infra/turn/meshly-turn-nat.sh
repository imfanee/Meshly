#!/usr/bin/env bash
# Meshly TURN: host NAT and isolation rules for the coturn container.
# Installed to /usr/local/sbin/meshly-turn-nat.sh, driven by meshly-turn-nat.service.
# Reads /etc/meshly/turn-nat.env (copy of host.env).
#
#   meshly-turn-nat.sh apply    (idempotent: rebuilds the MESHLY_* chains)
#   meshly-turn-nat.sh remove   (removes jumps and chains)
#   meshly-turn-nat.sh show
#
# All rules live in dedicated chains, so other host and guest rules are untouched.

set -euo pipefail

ENV_FILE=/etc/meshly/turn-nat.env
# shellcheck source=/dev/null
. "$ENV_FILE"

IPT=iptables

ensure_chain() { # table chain
    $IPT -t "$1" -N "$2" 2>/dev/null || true
    $IPT -t "$1" -F "$2"
}

ensure_jump() { # table parent chain
    $IPT -t "$1" -C "$2" -j "$3" 2>/dev/null || $IPT -t "$1" -I "$2" 1 -j "$3"
}

drop_jump() { # table parent chain
    while $IPT -t "$1" -C "$2" -j "$3" 2>/dev/null; do $IPT -t "$1" -D "$2" -j "$3"; done
}

apply() {
    ensure_chain nat MESHLY_PRE
    ensure_chain nat MESHLY_POST
    ensure_chain filter MESHLY_FWD
    ensure_chain filter MESHLY_IN

    ensure_jump nat PREROUTING MESHLY_PRE
    ensure_jump nat POSTROUTING MESHLY_POST
    ensure_jump filter FORWARD MESHLY_FWD
    ensure_jump filter INPUT MESHLY_IN

    # ---- Inbound: internet -> container -------------------------------------
    $IPT -t nat -A MESHLY_PRE -i "$PUBLIC_IF" -d "$PUBLIC_IP" -p udp --dport 3478 -j DNAT --to-destination "$CT_IP:3478"
    $IPT -t nat -A MESHLY_PRE -i "$PUBLIC_IF" -d "$PUBLIC_IP" -p tcp --dport 3478 -j DNAT --to-destination "$CT_IP:3478"
    $IPT -t nat -A MESHLY_PRE -i "$PUBLIC_IF" -d "$PUBLIC_IP" -p tcp --dport "$TLS_PUBLIC_PORT" -j DNAT --to-destination "$CT_IP:5349"
    $IPT -t nat -A MESHLY_PRE -i "$PUBLIC_IF" -d "$PUBLIC_IP" -p udp --dport "$RELAY_MIN:$RELAY_MAX" -j DNAT --to-destination "$CT_IP"
    if [ "$FORWARD_HTTP_80" = "yes" ]; then
        $IPT -t nat -A MESHLY_PRE -i "$PUBLIC_IF" -d "$PUBLIC_IP" -p tcp --dport 80 -j DNAT --to-destination "$CT_IP:80"
    fi

    # ---- Hairpin: both peers relayed through this same server ----------------
    # coturn sends to PUBLIC_IP:<relay port>; loop that back to the container.
    $IPT -t nat -A MESHLY_PRE -s "$SUBNET" -d "$PUBLIC_IP" -p udp --dport "$RELAY_MIN:$RELAY_MAX" -j DNAT --to-destination "$CT_IP"
    $IPT -t nat -A MESHLY_POST -s "$SUBNET" -d "$CT_IP" -j MASQUERADE

    # ---- Outbound: container -> internet ---------------------------------------
    $IPT -t nat -A MESHLY_POST -s "$SUBNET" -o "$PUBLIC_IF" -j MASQUERADE

    # ---- Forwarding ----------------------------------------------------------------
    $IPT -A MESHLY_FWD -d "$CT_IP" -m conntrack --ctstate DNAT -j ACCEPT
    $IPT -A MESHLY_FWD -s "$SUBNET" -o "$PUBLIC_IF" -j ACCEPT
    $IPT -A MESHLY_FWD -d "$SUBNET" -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT

    # ---- Protect the host from the container -----------------------------------------
    # The container never needs to talk to the host itself (DNS uses public resolvers).
    $IPT -A MESHLY_IN -s "$SUBNET" -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
    $IPT -A MESHLY_IN -s "$SUBNET" -j DROP

    echo "meshly-turn-nat: rules applied"
}

remove() {
    drop_jump nat PREROUTING MESHLY_PRE
    drop_jump nat POSTROUTING MESHLY_POST
    drop_jump filter FORWARD MESHLY_FWD
    drop_jump filter INPUT MESHLY_IN
    for spec in nat:MESHLY_PRE nat:MESHLY_POST filter:MESHLY_FWD filter:MESHLY_IN; do
        t="${spec%%:*}"; c="${spec##*:}"
        $IPT -t "$t" -F "$c" 2>/dev/null || true
        $IPT -t "$t" -X "$c" 2>/dev/null || true
    done
    echo "meshly-turn-nat: rules removed"
}

show() {
    $IPT -t nat -S MESHLY_PRE 2>/dev/null || echo "MESHLY_PRE missing"
    $IPT -t nat -S MESHLY_POST 2>/dev/null || echo "MESHLY_POST missing"
    $IPT -S MESHLY_FWD 2>/dev/null || echo "MESHLY_FWD missing"
    $IPT -S MESHLY_IN 2>/dev/null || echo "MESHLY_IN missing"
}

case "${1:-}" in
    apply) apply ;;
    remove) remove ;;
    show) show ;;
    *) echo "usage: $0 apply|remove|show"; exit 1 ;;
esac
