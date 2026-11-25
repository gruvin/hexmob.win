# scripts/ui.zsh — shared console styling for deploy.sh and release.sh
#
# Sourced by both scripts. Colour is used only when stdout is a terminal, and never when
# NO_COLOR is set (https://no-color.org) or TERM is dumb, so piped output, logs and any harness
# stay plain. Override with DEPLOY_COLOR=always|never.
#
# Keep the palette small: one accent, three statuses, plus dim for secondary detail. Anything
# more turns a deploy log into a christmas tree.

[[ -n "${_UI_LOADED:-}" ]] && return 0
_UI_LOADED=1

case "${DEPLOY_COLOR:-auto}" in
    (never|no|0)  _ui=0 ;;
    (always|yes|1) _ui=1 ;;
    (*)
        if [[ -t 1 && -z "${NO_COLOR:-}" && "${TERM:-dumb}" != "dumb" ]]; then _ui=1; else _ui=0; fi
        ;;
esac

if [[ ${_ui} -eq 1 ]]; then
    C_RESET=$'\e[0m'
    C_BOLD=$'\e[1m'
    C_DIM=$'\e[2m'
    C_MUTE=$'\e[2;37m'    # secondary detail: paths, dates, hints
    C_HEAD=$'\e[1;97m'    # headings
    C_ACC=$'\e[1;36m'     # accent: stage markers, keys
    C_OK=$'\e[1;32m'
    C_WARN=$'\e[1;33m'
    C_ERR=$'\e[1;31m'
else
    C_RESET=''; C_BOLD=''; C_DIM=''; C_MUTE=''; C_HEAD=''; C_ACC=''; C_OK=''; C_WARN=''; C_ERR=''
fi

# Helper names are prefixed ui_ on purpose: a helper called `head` would shadow the head(1)
# command in this shell and silently break pipelines (it did).

# Stage banner: the one thing you scan for when reading a deploy log.
# @args: LABEL [DETAIL]
ui_stage() {
    print -r -- ""
    print -r -- "  ${C_ACC}◆${C_RESET} ${C_HEAD}${1}${C_RESET}${2:+  ${C_MUTE}${2}${C_RESET}}"
}

# Section heading inside a stage.
# @args: TEXT
ui_head() { print -r -- "${C_HEAD}${1}${C_RESET}" }

ui_ui_ok()   { print -r -- "  ${C_OK}✔${C_RESET} ${1}" }
ui_ui_warn() { print -r -- "  ${C_WARN}!${C_RESET} ${1}" }
ui_ui_err()  { print -r -- "  ${C_ERR}✖${C_RESET} ${C_BOLD}${1}${C_RESET}" }

# Secondary line: paths, settings, hints.
ui_ui_dim() { print -r -- "  ${C_MUTE}${1}${C_RESET}" }

# "key : value" pair, aligned by the caller's padding.
# @args: KEY VALUE
ui_ui_kv() { printf '  %s%-8s%s %s\n' "${C_ACC}" "${1}" "${C_RESET}" "${2}" }
