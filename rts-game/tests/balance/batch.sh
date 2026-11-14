#!/bin/bash
# batch.sh <label> <codeDir> <diff> <limit> <seeds...>  (override JS from $OVER); 4 in parallel
cd "$(dirname "$0")"
label=$1; dir=$2; diff=$3; limit=$4; shift 4
mkdir -p out; : > out/$label.jsonl
printf '%s\n' "$@" | xargs -P 4 -I{} sh -c "node bench.js '$dir' {} $diff $limit \"\$OVER\" >> out/$label.jsonl 2>> out/$label.err"
echo done $label $(wc -l < out/$label.jsonl)
