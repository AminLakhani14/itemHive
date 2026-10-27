const { readdirSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
function tests(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? tests(file) : entry.name.endsWith('.test.ts') ? [file] : [];
    });
}

// tsc leaves old output behind when a source test is renamed or removed.
// Only run compiled tests that still have a source file in this checkout.
const files = tests(path.join(root, 'src')).sort().map(file =>
    path.join(root, 'dist', path.relative(path.join(root, 'src'), file).replace(/\.ts$/, '.js')));
if (!files.length) throw new Error('No backend source tests found');
const result = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
