#!/usr/bin/env bash

echo http://localhost:30080/
exec python3 -m http.server 30080
