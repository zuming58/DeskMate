#!/usr/bin/env bash
tool="${1:-claude}"
input="$(cat)"

continue_safe() {
  printf '%s\n' '{"continue":true}'
  exit 0
}

codex_supports_continuation() {
  local version rest major minor patch
  version="$(codex --version 2>/dev/null | awk '{print $NF}')" || return 1
  case "$version" in *.*.*) ;; *) return 1 ;; esac
  major="${version%%.*}"
  rest="${version#*.}"
  minor="${rest%%.*}"
  patch="${rest#*.}"
  case "${major}:${minor}:${patch}" in *[!0-9:]* | :* | *: | *::* ) return 1 ;; esac
  [ "$major" -gt 0 ] || { [ "$major" -eq 0 ] && [ "$minor" -ge 145 ]; }
}

case "$tool" in
  claude) docname="CLAUDE.md"; scope_field="prompt_id" ;;
  codex) docname="AGENTS.md"; scope_field="turn_id"; codex_supports_continuation || continue_safe ;;
  *) continue_safe ;;
esac

command -v jq >/dev/null 2>&1 || continue_safe
sid="$(printf '%s' "$input" | jq -r 'if type == "object" and (.session_id | type) == "string" then .session_id else empty end' 2>/dev/null || true)"
scope="$(printf '%s' "$input" | jq -r --arg field "$scope_field" 'if type == "object" and (.[$field] | type) == "string" and (.[$field] | length > 0) then .[$field] else empty end' 2>/dev/null || true)"
active="$(printf '%s' "$input" | jq -r 'if type == "object" and .stop_hook_active == true then "true" else "false" end' 2>/dev/null || echo false)"
[ -n "$sid" ] && [ -n "$scope" ] || continue_safe

case "${sid}:${scope}" in *[!A-Za-z0-9._:-]*) continue_safe ;; esac
case "${UID:-}" in '' | *[!0-9]*) continue_safe ;; esac
key="${#sid}-${sid}-${#scope}-${scope}"
marker_root="/tmp/project-flow-stopcheck-${UID}"
mkdir -p "$marker_root" 2>/dev/null || continue_safe
marker="$marker_root/${tool}-${key}"

if [ "$active" = "true" ]; then
  mkdir "$marker" 2>/dev/null || true
  continue_safe
fi

if ! mkdir "$marker" 2>/dev/null; then
  continue_safe
fi

reason="【收工自检】先读取当前路径生效的 ${docname}；若其中有业务专项收工检查，先执行且不扩大本轮授权。① 文档：结构、方案、心智模型、外部资料或设计变化时更新 ${docname}、DESIGN.md 或 docs。② 交接：在本项目根 flow/progress.md 最上面追加一条进展（做了什么/为什么/怎么理解/产出路径/问题与解决/下一步）并把同一条贴给用户；决策落 flow/decisions.md，坑落 flow/lessons.md。都没有就回复无需更新。"
jq -n --arg r "$reason" '{decision:"block", reason:$r}'
