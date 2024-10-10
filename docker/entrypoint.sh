#!/bin/bash

# ユーザー名と ID を書き換える
# echo "(UID:$USER_ID,GID:$GROUP_ID,NAME:$USER_NAME): $@"
usermod -l $USER_NAME user
usermod -u $USER_ID -o $USER_NAME
groupmod -g $GROUP_ID user

# setpriv では HOME などの環境変数が設定されないので，手動で設定する．
export HOME=/home/$USER_NAME
export USER=$USER_NAME

# cd してからコマンドを実行するシェルスクリプトを生成
# setpriv 前だと，docker 内の root では移動できない場所が指定されることがあるため
echo "#!/bin/bash" > /usr/local/bin/to_user_mode.sh
echo "cd $ENTRY_POINT_PATH" >> /usr/local/bin/to_user_mode.sh
echo "$@" >> /usr/local/bin/to_user_mode.sh
chmod +x /usr/local/bin/to_user_mode.sh

# Electron のために dbus を起動
# /etc/init.d/dbus start

# electron-packager で wine64 が必要なためシンボリックリンクを作成
# ln -s /usr/bin/wine /usr/bin/wine64

# setpriv によってユーザーモードで実行
exec setpriv --reuid=$USER_ID --regid=$GROUP_ID --init-groups /usr/local/bin/to_user_mode.sh

