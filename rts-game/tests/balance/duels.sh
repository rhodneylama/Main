#!/bin/bash
# duels.sh <label> <difficulty> <firstSeed> <lastSeed>  - 4 games at a time
# Winner 1 = current opponent, 2 = previous (OPP=v2: the October 18 one). Results in out/<label>.jsonl.
cd "$(dirname "$0")"; mkdir -p out; : > out/$1.jsonl
seq $3 $4 | xargs -P 4 -I{} sh -c "node duel.js {} $2 3600 >> out/$1.jsonl"
echo "$1: current $(grep -c '"winner":1' out/$1.jsonl), previous $(grep -c '"winner":2' out/$1.jsonl), unfinished $(grep -c '"winner":0' out/$1.jsonl)"
