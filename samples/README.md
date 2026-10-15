# Sample call transcripts

Put your saved discovery call transcripts here. Wingman's replay mode reads
every `.txt`, `.vtt`, `.json`, `.md` or `.srt` file in this folder.

`example-synthetic.txt` is a short made-up call for checking that replay works.
It is not a real prospect. Judge nudge quality on your real calls.

Formats Wingman reads:

- Zoom or Google Meet `.vtt` captions
- `[00:01:23] Name: text` or `00:01:23 Name: text`
- `Name  0:05` on its own line with the words underneath (Otter, Fireflies, Fathom)
- Plain `Name: text` lines with no times (times are estimated from speaking pace)
- JSON, either `[{"speaker", "text", "start"}]` or Recall.ai's transcript format

Your own name must match how it appears in the transcript. Set
`WINGMAN_REP_NAMES` in `wingman/.env` or pass `--rep "Your Name"`.
