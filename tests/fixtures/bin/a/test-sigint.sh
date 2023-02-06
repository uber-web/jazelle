#!/bin/bash

trap '' SIGINT

$JAZELLE dev &
DEV_PID=$!

wait_for_dev() {
  while [ true ]; do
    if pgrep -f "node dev-script.js" > /dev/null
    then
      break
    else
      sleep 1
    fi
  done
}

wait_for_dev

kill -INT 0

wait $DEV_PID

echo Dev process exited
