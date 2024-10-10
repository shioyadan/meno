# Docker コンテナ名
# ユーザーごとに違うものにしておく
DOCKER_CONTAINER_NAME = $(USER_NAME)-meno-devel-env


.DEFAULT_GOAL = docker-run


#
# --- Docker 関係
#
USER_NAME = $(shell whoami)

# Docker イメージの実行
# -v $(HOME):$(HOME) 							実行しているユーザの HOME をそのままコンテナ内にマウント
# -e ENTRY_POINT_PATH=$(PWD) 					起動時の初期パスを渡す
# -e USER_ID=$(shell id -u) -e GROUP_ID=$(shell id -g) -e USER_NAME=$(USER) 	ユーザー情報を渡す
# -e DISPLAY -v /tmp/.X11-unix:/tmp/.X11-unix 	X11 アプリを起動するための設定
# -p 127.0.0.1:8080:8080 						dev server のためにポート 8080 をホスト側に公開
DOCKER_COMMAND = \
	docker run -ti --rm \
	-v $(HOME):$(HOME) \
	-e ENTRY_POINT_PATH=$(PWD) \
	-e USER_ID=$(shell id -u) -e GROUP_ID=$(shell id -g) -e USER_NAME=$(USER) \
	-e DISPLAY -v /tmp/.X11-unix:/tmp/.X11-unix \
	-p 127.0.0.1:8080:8080 \
	$(DOCKER_CONTAINER_NAME):latest 

# Docker コンテナを初期化
docker-build:
	docker build -t $(DOCKER_CONTAINER_NAME) .

# Docker 内シェルに入る
# COMMAND 環境変数が設定されていた場合，それを実行する
docker-run:
	@$(DOCKER_COMMAND) $(COMMAND)

# 使用する際は事前に docker グループに自身を追加しておいてください
docker-add-user:
	gpasswd -a $(USER_NAME) docker
