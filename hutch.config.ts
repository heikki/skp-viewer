// Hutch owns the Electrobun build toolchain from 2.x on. Its built-in resolver
// would otherwise take over dependencies and write its own hutch.lock, ignoring
// bun.lock; this keeps `bun install` and bun.lock authoritative.
export default {
  packageManager: 'bun'
};
