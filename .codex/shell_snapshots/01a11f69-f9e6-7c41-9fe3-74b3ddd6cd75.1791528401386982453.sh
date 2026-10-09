# Snapshot file
# Unset all aliases to avoid conflicts with functions
unalias -a 2>/dev/null || true
shopt -u autocd
shopt -u assoc_expand_once
shopt -u cdable_vars
shopt -u cdspell
shopt -u checkhash
shopt -u checkjobs
shopt -s checkwinsize
shopt -s cmdhist
shopt -u compat31
shopt -u compat32
shopt -u compat40
shopt -u compat41
shopt -u compat42
shopt -u compat43
shopt -u compat44
shopt -s complete_fullquote
shopt -u direxpand
shopt -u dirspell
shopt -u dotglob
shopt -u execfail
shopt -u expand_aliases
shopt -u extdebug
shopt -u extglob
shopt -s extquote
shopt -u failglob
shopt -s force_fignore
shopt -s globasciiranges
shopt -s globskipdots
shopt -u globstar
shopt -u gnu_errfmt
shopt -u histappend
shopt -u histreedit
shopt -u histverify
shopt -s hostcomplete
shopt -u huponexit
shopt -u inherit_errexit
shopt -s interactive_comments
shopt -u lastpipe
shopt -u lithist
shopt -u localvar_inherit
shopt -u localvar_unset
shopt -s login_shell
shopt -u mailwarn
shopt -u no_empty_cmd_completion
shopt -u nocaseglob
shopt -u nocasematch
shopt -u noexpand_translation
shopt -u nullglob
shopt -s patsub_replacement
shopt -s progcomp
shopt -u progcomp_alias
shopt -s promptvars
shopt -u restricted_shell
shopt -u shift_verbose
shopt -s sourcepath
shopt -u varredir_close
shopt -u xpg_echo
# Functions
autobase_im () 
{ 
    for IM_CONFIG_SCRIPT_PATH in $IM_CONFIG_DATA/[1234567]*.rc;
    do
        IM_CONFIG_SCRIPT=$(name_im $IM_CONFIG_SCRIPT_PATH);
        if avail_auto $IM_CONFIG_SCRIPT; then
            echo -n "$IM_CONFIG_SCRIPT";
            break;
        fi;
    done
}
automatic_im () 
{ 
    if find_match "$IM_CONFIG_CURRENT_DESKTOP" "$DESKTOP_SETUP_IBUS"; then
        autobase_im;
    else
        if [ "$IM_CONFIG_PREFERRED" != "" ] && avail_auto "$IM_CONFIG_PREFERRED"; then
            echo -n "$IM_CONFIG_PREFERRED";
        else
            autobase_im;
        fi;
    fi
}
avail_auto () 
{ 
    if [ -r $IM_CONFIG_DATA/??_$1.conf ]; then
        . $IM_CONFIG_DATA/??_$1.conf;
        package_auto;
    else
        IM_CONFIG_CODE="avail_auto";
        IM_CONFIG_NAME=$1;
        eval_gettext "E: Configuration for \$IM_CONFIG_NAME not found at \$IM_CONFIG_CODE." 1>&2;
        echo 1>&2;
        return 1;
    fi
}
eval_gettext () 
{ 
    gettext "$1" | ( export PATH `envsubst --variables "$1"`;
    envsubst "$1" )
}
eval_ngettext () 
{ 
    ngettext "$1" "$2" "$3" | ( export PATH `envsubst --variables "$1 $2"`;
    envsubst "$1 $2" )
}
eval_npgettext () 
{ 
    ngettext --context="$1" "$2" "$3" "$4" | ( export PATH `envsubst --variables "$2 $3"`;
    envsubst "$2 $3" )
}
eval_pgettext () 
{ 
    gettext --context="$1" "$2" | ( export PATH `envsubst --variables "$2"`;
    envsubst "$2" )
}
find_match () 
{ 
    local OLDIFS="$IFS" R=1 X Y;
    IFS=':';
    if [ -n "$1" ] && [ -n "$2" ]; then
        for X in $1;
        do
            for Y in $2;
            do
                if [ "*" = "$Y" ]; then
                    R=0;
                    break 2;
                else
                    if [ "$X" = "$Y" ]; then
                        R=0;
                        break 2;
                    fi;
                fi;
            done;
        done;
    fi;
    IFS="$OLDIFS";
    return "$R"
}
mode_cjkv () 
{ 
    if find_match "$IM_CONFIG_CURRENT_DESKTOP" "$CJKV_DEFAULT_DESKTOP"; then
        if find_match "$IM_CONFIG_LC_CTYPE" "$CJKV_LOCALES"; then
            echo -n "auto";
        else
            echo -n "none";
        fi;
    else
        echo -n "auto";
    fi
}
name_im () 
{ 
    local x;
    x=${1#$IM_CONFIG_DATA/??_};
    x=${x%.rc};
    x=${x%.conf};
    echo -n $x
}
package_status () 
{ 
    PACKAGE_NAME="$1";
    if [ "$(LC_ALL=C dpkg-query -l "$PACKAGE_NAME" 2> /dev/null | sed -n '6s/\([^ ]*\) .*$/\1/p')" = "ii" ]; then
        return 0;
    else
        return 1;
    fi
}
run_im () 
{ 
    IM_CONFIG_CODE="run_im";
    if [ -r $IM_CONFIG_DATA/[012345678]?_$1.rc ]; then
        . $IM_CONFIG_DATA/[012345678]?_$1.rc;
        IM_CONFIG_NAME=$1;
        if $IM_CONFIG_VERBOSE; then
            eval_gettext "I: Script for \$IM_CONFIG_NAME started at \$IM_CONFIG_CODE." 1>&2;
            echo 1>&2;
        fi;
    else
        IM_CONFIG_NAME=$1;
        eval_gettext "E: Script for \$IM_CONFIG_NAME not found at \$IM_CONFIG_CODE." 1>&2;
        echo 1>&2;
    fi
}

# setopts 3
set -o braceexpand
set -o hashall
set -o interactive-comments

# aliases 0

# exports (native declarations)
declare -x CLUTTER_IM_MODULE="ibus"
declare -x COLORTERM="truecolor"
declare -x DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/50078048/bus,guid=b26507b432aa29b4b8519cdd6ac8618f"
declare -x DBUS_STARTER_ADDRESS="unix:path=/run/user/50078048/bus,guid=b26507b432aa29b4b8519cdd6ac8618f"
declare -x DBUS_STARTER_BUS_TYPE="session"
declare -x DEBUGINFOD_URLS="https://debuginfod.ubuntu.com "
declare -x DESKTOP_SESSION="plasmawayland"
declare -x DISPLAY=":0"
declare -x DOTNET_BUNDLE_EXTRACT_BASE_DIR="/home/cipmiron/.cache/dotnet_bundle_extract"
declare -x GDMSESSION="plasmawayland"
declare -x GSM_SKIP_SSH_AGENT_WORKAROUND="true"
declare -x GTK2_RC_FILES="/etc/gtk-2.0/gtkrc:/home/cipmiron/.gtkrc-2.0:/home/cipmiron/.config/gtkrc-2.0"
declare -x GTK_IM_MODULE="ibus"
declare -x GTK_MODULES="gail:atk-bridge"
declare -x GTK_RC_FILES="/etc/gtk/gtkrc:/home/cipmiron/.gtkrc:/home/cipmiron/.config/gtkrc"
declare -x HOME="/home/cipmiron"
declare -x ICEAUTHORITY="/run/user/50078048/iceauth_HkUbnd"
declare -x IM_CONFIG_PHASE="1"
declare -x KDE_APPLICATIONS_AS_SCOPE="1"
declare -x KDE_FULL_SESSION="true"
declare -x KDE_SESSION_UID="50078048"
declare -x KDE_SESSION_VERSION="5"
declare -x KRB5CCNAME="FILE:/tmp/krb5cc_50078048_Xl1h8z"
declare -x LANG="en_US.UTF-8"
declare -x LOGNAME="cipmiron"
declare -x LS_COLORS="rs=0:di=01;34:ln=01;36:mh=00:pi=40;33:so=01;35:do=01;35:bd=40;33;01:cd=40;33;01:or=40;31;01:mi=00:su=37;41:sg=30;43:ca=00:tw=30;42:ow=34;42:st=37;44:ex=01;32:*.tar=01;31:*.tgz=01;31:*.arc=01;31:*.arj=01;31:*.taz=01;31:*.lha=01;31:*.lz4=01;31:*.lzh=01;31:*.lzma=01;31:*.tlz=01;31:*.txz=01;31:*.tzo=01;31:*.t7z=01;31:*.zip=01;31:*.z=01;31:*.dz=01;31:*.gz=01;31:*.lrz=01;31:*.lz=01;31:*.lzo=01;31:*.xz=01;31:*.zst=01;31:*.tzst=01;31:*.bz2=01;31:*.bz=01;31:*.tbz=01;31:*.tbz2=01;31:*.tz=01;31:*.deb=01;31:*.rpm=01;31:*.jar=01;31:*.war=01;31:*.ear=01;31:*.sar=01;31:*.rar=01;31:*.alz=01;31:*.ace=01;31:*.zoo=01;31:*.cpio=01;31:*.7z=01;31:*.rz=01;31:*.cab=01;31:*.wim=01;31:*.swm=01;31:*.dwm=01;31:*.esd=01;31:*.avif=01;35:*.jpg=01;35:*.jpeg=01;35:*.mjpg=01;35:*.mjpeg=01;35:*.gif=01;35:*.bmp=01;35:*.pbm=01;35:*.pgm=01;35:*.ppm=01;35:*.tga=01;35:*.xbm=01;35:*.xpm=01;35:*.tif=01;35:*.tiff=01;35:*.png=01;35:*.svg=01;35:*.svgz=01;35:*.mng=01;35:*.pcx=01;35:*.mov=01;35:*.mpg=01;35:*.mpeg=01;35:*.m2v=01;35:*.mkv=01;35:*.webm=01;35:*.webp=01;35:*.ogm=01;35:*.mp4=01;35:*.m4v=01;35:*.mp4v=01;35:*.vob=01;35:*.qt=01;35:*.nuv=01;35:*.wmv=01;35:*.asf=01;35:*.rm=01;35:*.rmvb=01;35:*.flc=01;35:*.avi=01;35:*.fli=01;35:*.flv=01;35:*.gl=01;35:*.dl=01;35:*.xcf=01;35:*.xwd=01;35:*.yuv=01;35:*.cgm=01;35:*.emf=01;35:*.ogv=01;35:*.ogx=01;35:*.aac=00;36:*.au=00;36:*.flac=00;36:*.m4a=00;36:*.mid=00;36:*.midi=00;36:*.mka=00;36:*.mp3=00;36:*.mpc=00;36:*.ogg=00;36:*.ra=00;36:*.wav=00;36:*.oga=00;36:*.opus=00;36:*.spx=00;36:*.xspf=00;36:*~=00;90:*#=00;90:*.bak=00;90:*.crdownload=00;90:*.dpkg-dist=00;90:*.dpkg-new=00;90:*.dpkg-old=00;90:*.dpkg-tmp=00;90:*.old=00;90:*.orig=00;90:*.part=00;90:*.rej=00;90:*.rpmnew=00;90:*.rpmorig=00;90:*.rpmsave=00;90:*.swp=00;90:*.tmp=00;90:*.ucf-dist=00;90:*.ucf-new=00;90:*.ucf-old=00;90:"
declare -x MANAGERPID="4597"
declare -x MANPATH=":/opt/puppetlabs/puppet/share/man"
declare -x MEMORY_PRESSURE_WATCH="/sys/fs/cgroup/user.slice/user-50078048.slice/user@50078048.service/session.slice/dbus.service/memory.pressure"
declare -x MEMORY_PRESSURE_WRITE="c29tZSAyMDAwMDAgMjAwMDAwMAA="
declare -x NODE_EXTRA_CA_CERTS="/etc/ssl/certs/ca-certificates.crt"
declare -x P9K_SSH="0"
declare -x P9K_TTY="old"
declare -x PATH="/home/cipmiron/.local/bin:/home/cipmiron/work/hahadina/sculaLuMiron/.codex/tmp/arg0/codex-arg0ZxNFMO:/home/cipmiron/apps/slai.codex/1.19.2/codex-path:/home/cipmiron/apps/slai.codex/1.19.2/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin:/snap/bin:/home/cipmiron/.local/bin:/home/cipmiron/.dotnet/tools:/opt/puppetlabs/bin:/home/cipmiron/.local/share/JetBrains/Toolbox/scripts"
declare -x PLASMA_USE_QT_SCALING="1"
declare -x QTWEBENGINE_DICTIONARIES_PATH="/usr/share/hunspell-bdic/"
declare -x QT_ACCESSIBILITY="1"
declare -x QT_AUTO_SCREEN_SCALE_FACTOR="0"
declare -x QT_IM_MODULE="ibus"
declare -x QT_WAYLAND_FORCE_DPI="96"
declare -x SESSION_MANAGER="local/roucipmiron-lx01:@/tmp/.ICE-unix/4977,unix/roucipmiron-lx01:/tmp/.ICE-unix/4977"
declare -x SHELL="/bin/bash"
declare -x SHLVL="2"
declare -x SSH_AUTH_SOCK="/run/user/50078048/gnupg/S.gpg-agent.ssh"
declare -x SYSTEMD_EXEC_PID="4633"
declare -x TERM="xterm-256color"
declare -x TILIX_ID="4d479f30-a2eb-4393-a7fa-27a1c46cd8ca"
declare -x USER="cipmiron"
declare -x USERNAME="cipmiron"
declare -x VTE_VERSION="7600"
declare -x WAYLAND_DISPLAY="wayland-0"
declare -x XAUTHORITY="/run/user/50078048/xauth_ZovmJi"
declare -x XCURSOR_SIZE="24"
declare -x XCURSOR_THEME="breeze_cursors"
declare -x XDG_CONFIG_DIRS="/etc/xdg/xdg-plasmawayland:/home/cipmiron/.config/kdedefaults:/etc/xdg"
declare -x XDG_CURRENT_DESKTOP="KDE"
declare -x XDG_DATA_DIRS="/usr/share/plasmawayland:/usr/local/share/:/usr/share/:/var/lib/snapd/desktop"
declare -x XDG_RUNTIME_DIR="/run/user/50078048"
declare -x XDG_SEAT="seat0"
declare -x XDG_SESSION_CLASS="user"
declare -x XDG_SESSION_DESKTOP="plasmawayland"
declare -x XDG_SESSION_ID="4"
declare -x XDG_SESSION_TYPE="wayland"
declare -x XDG_VTNR="2"
declare -x XKB_DEFAULT_LAYOUT="us"
declare -x XKB_DEFAULT_MODEL="pc105"
declare -x XMODIFIERS="@im=ibus"
declare -x _P9K_SSH_TTY="/dev/pts/2"
declare -x _P9K_TTY="/dev/pts/2"
declare -x etxuh="cipmiron@atletx8-reg030.amd.com"
declare -x etxunh="cipmiron@atletx7-reg08.amd.com"
declare -x hacron="atlvdfcronapp1.amd.com"
declare -x hacrond="atlvdfcronapd1.amd.com"
declare -x hdapp="atlvrouappd01.amd.com"
declare -x hetx="atletx8-reg030.amd.com"
declare -x hgcron="usegccron0.amd.com"
declare -x hpapp="atlvrouappp01.amd.com"
declare -x hwapp="atlvwebapp01.amd.com"
declare -x nhetx="atletx7-reg08.amd.com"
declare -x pz1="!NfraW0rk2026\$"
declare -x ssh_opt="-i ~/.ssh/id_rsa -o ServerAliveInterval=300"
declare -x ucip="cipmiron"
declare -x unbr="unbregr"
declare -x unbrp="amd"
declare -x uz1="z1_dfumc_infra"
