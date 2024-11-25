FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV GIT_SSL_NO_VERIFY=1

RUN apt-get update && \
    apt-get install tzdata -y && \
    apt-get install --no-install-recommends -y \
        less make bash-completion zip \
        nodejs npm && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set root password
RUN echo "root:root" | chpasswd

# Create an user
ARG USERNAME=user
ARG USER_UID=2000
ARG USER_GID=2000
RUN groupadd --gid $USER_GID $USERNAME && \
    useradd --uid $USER_UID --gid $USER_GID -m $USERNAME

RUN echo "user:user" | chpasswd

# Set the entry point
# "entrypoint.sh" changes a user ID dynamically.
# If no additional commands are not passed, /bin/bash is launched.
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/bin/bash"]
