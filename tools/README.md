# Tools

Small helper scripts for generating input files for Meno. The generated
`.log.zst` files can be opened directly in the Meno app.

## `file_info.js`

Dumps a directory tree as tab-separated records that can be loaded by
`src/driver/file_info.ts`. It streams records to stdout and respects stdout
backpressure so large trees do not build an unbounded output queue in memory.
File names use JSON-style escaping without surrounding quotes, so tabs and
newlines in real file names do not appear as raw delimiters in the dump.

## `file_info.sh`

Wrapper for `file_info.js`. It resolves the target directory, chooses an output
file name, and writes a Zstandard-compressed `.log.zst` dump. Keep the file
compressed; Meno can load the Zstandard file as-is.
