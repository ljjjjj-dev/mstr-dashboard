#!/bin/sh
# 在当前文件夹生成“启动看盘.app”，双击即可启动服务并打开页面。
set -e
cd "$(dirname "$0")"
script=$(mktemp)
cat > "$script" <<'EOF'
set appPath to POSIX path of (path to me)
set cmd to "export PATH=/Library/Frameworks/Python.framework/Versions/Current/bin:/opt/homebrew/bin:/usr/local/bin:/usr/sbin:/usr/bin:/bin; cd " & quoted form of appPath & "/.. || exit 1; if ! lsof -nP -iTCP:8765 -sTCP:LISTEN >/dev/null 2>&1; then nohup python3 server.py >/dev/null 2>&1 & sleep 1; fi; open http://127.0.0.1:8765"
do shell script cmd
EOF
osacompile -o "启动看盘.app" "$script"
rm -f "$script"
echo "已生成：启动看盘.app"
