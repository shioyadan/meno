"use strict";

const fs = require("fs");
const path = require("path");

let nextID = 1;
let emittedCount = 0;
let outputBuffer = "";
let stdoutBlocked = false;

const OUTPUT_BUFFER_LIMIT = 1024 * 1024;
function parsePositiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const DIR_CONCURRENCY = parsePositiveInteger(process.env.FILE_INFO_DIR_CONCURRENCY || 16, 16);
const LSTAT_CONCURRENCY = parsePositiveInteger(process.env.FILE_INFO_LSTAT_CONCURRENCY || 1024, 1024);

function usage() {
    console.error("Usage: node file_info.js <path_to_directory> > out.log");
}

function encode(id, parentID, key, isDirectory, fileCount, size) {
    return `${id}\t${parentID}\t${key}\t${isDirectory ? 1 : 0}\t${fileCount}\t${size}\n`;
}

// stdout may be a pipe to a slower compressor. If write() returns false,
// continuing to emit lines would queue them in V8 heap and can OOM on large trees.
function waitForStdoutDrain() {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            process.stdout.off("drain", onDrain);
            process.stdout.off("error", onError);
        };
        const onDrain = () => {
            cleanup();
            resolve();
        };
        const onError = (error) => {
            cleanup();
            reject(error);
        };

        process.stdout.once("drain", onDrain);
        process.stdout.once("error", onError);
    });
}

function flushOutput(force = false) {
    if (stdoutBlocked && !force) {
        return null;
    }
    if (outputBuffer.length === 0 || (!force && outputBuffer.length < OUTPUT_BUFFER_LIMIT)) {
        return null;
    }

    const chunk = outputBuffer;
    outputBuffer = "";
    return process.stdout.write(chunk) ? null : waitForStdoutDrain();
}

function emitNodeInfo(parentID, key, isDirectory, isSymbolicLink, size) {
    const id = nextID++;

    // Batch output to reduce write syscall overhead, but still respect backpressure
    // at a bounded buffer size.
    outputBuffer += encode(id, parentID, key, isDirectory, 1, size);
    const drain = flushOutput();

    emittedCount++;
    if (emittedCount % (1024 * 4) === 0) {
        process.stderr.write(".");
    }

    return { id, isDirectory, isSymbolicLink, drain };
}

function emitNode(parentID, key, stat, sizeOverride = null) {
    return emitNodeInfo(
        parentID,
        key,
        stat.isDirectory(),
        stat.isSymbolicLink(),
        sizeOverride ?? stat.size
    );
}

async function dumpDirectoryTree(rootPath) {
    const rootStat = fs.lstatSync(rootPath);
    const root = emitNode(0, rootPath, rootStat, 0);
    if (root.drain) {
        await root.drain;
    }

    await new Promise((resolve, reject) => {
        const directories = [{ id: root.id, fullPath: rootPath }];
        const lstats = [];
        let activeDirectories = 0;
        let activeLstats = 0;
        let settled = false;

        const fail = (error) => {
            if (!settled) {
                settled = true;
                reject(error);
            }
        };

        const pauseForDrain = (drain) => {
            stdoutBlocked = true;
            drain
                .then(() => {
                    stdoutBlocked = false;
                    schedule();
                })
                .catch(fail);
        };

        const emitChild = (parentID, name, childPath, isDirectory, isSymbolicLink, size) => {
            const child = emitNodeInfo(parentID, name, isDirectory, isSymbolicLink, size);
            if (child.drain) {
                pauseForDrain(child.drain);
            }

            if (child.isDirectory && !child.isSymbolicLink) {
                // Keep only directories still to visit. File nodes are emitted and dropped.
                directories.push({ id: child.id, fullPath: childPath });
            }
        };

        const startDirectory = (directory) => {
            activeDirectories++;
            fs.readdir(directory.fullPath, (error, names) => {
                activeDirectories--;
                if (!error) {
                    for (const name of names) {
                        lstats.push({
                            parentID: directory.id,
                            parentPath: directory.fullPath,
                            name,
                        });
                    }
                }
                schedule();
            });
        };

        const startLstat = (item) => {
            activeLstats++;
            const childPath = path.join(item.parentPath, item.name);
            fs.lstat(childPath, (error, stat) => {
                activeLstats--;
                if (!error) {
                    emitChild(
                        item.parentID,
                        item.name,
                        childPath,
                        stat.isDirectory(),
                        stat.isSymbolicLink(),
                        stat.size
                    );
                }
                schedule();
            });
        };

        const scheduleDirectories = () => {
            // Keep several directories in flight like agate, but cap open directories.
            while (!stdoutBlocked && activeDirectories < DIR_CONCURRENCY && directories.length > 0) {
                startDirectory(directories.pop());
            }
        };

        const scheduleLstats = () => {
            // lstat is the main filesystem latency source. Run a bounded number in
            // parallel, while letting Node/libuv do the low-level scheduling.
            while (!stdoutBlocked && activeLstats < LSTAT_CONCURRENCY && lstats.length > 0) {
                startLstat(lstats.pop());
            }
        };

        const schedule = () => {
            if (settled || stdoutBlocked) {
                return;
            }

            scheduleDirectories();
            scheduleLstats();

            if (
                activeDirectories === 0 &&
                activeLstats === 0 &&
                directories.length === 0 &&
                lstats.length === 0
            ) {
                const drain = flushOutput(true);
                if (drain) {
                    stdoutBlocked = true;
                    drain
                        .then(() => {
                            settled = true;
                            resolve();
                        })
                        .catch(fail);
                } else {
                    settled = true;
                    resolve();
                }
            }
        };

        schedule();
    });
}

async function main() {
    const targetPath = process.argv[2];
    if (!targetPath) {
        usage();
        process.exit(2);
    }

    const resolvedPath = path.resolve(targetPath);
    let stats;
    try {
        stats = fs.lstatSync(resolvedPath);
    } catch (error) {
        console.error(`Error: ${resolvedPath} cannot be read.`);
        process.exit(1);
    }

    if (!stats.isDirectory()) {
        console.error(`Error: ${resolvedPath} is not a valid directory.`);
        process.exit(1);
    }

    await dumpDirectoryTree(resolvedPath);
    const drain = flushOutput(true);
    if (drain) {
        await drain;
    }
    process.stderr.write(`finished(lastID:${nextID - 1})\n`);
}

main().catch((error) => {
    if (error && error.code === "EPIPE") {
        process.exit(1);
    }
    console.error(error);
    process.exit(1);
});
