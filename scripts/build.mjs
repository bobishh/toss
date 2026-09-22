import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify } from 'terser';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = join(root, 'build');
const distributionDirectory = join(root, 'dist');
const compiledPath = join(buildDirectory, 'elm.js');

mkdirSync(buildDirectory, { recursive: true });
mkdirSync(distributionDirectory, { recursive: true });

execFileSync(
  join(root, 'node_modules', '.bin', 'elm'),
  ['make', 'src/Main.elm', '--optimize', `--output=${compiledPath}`],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ELM_HOME: join(root, '.elm-home') },
  },
);

const compiled = readFileSync(compiledPath, 'utf8');
const optimized = await minify(compiled, {
  compress: true,
  mangle: true,
  format: { comments: false },
});

if (!optimized.code) throw new Error('Elm minification produced no output');

const template = readFileSync(join(root, 'src', 'index.template.html'), 'utf8');
const bundledJavaScript = optimized.code.replace(/<\/script/gi, '<\\/script');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('Invalid build commit');
const html = template.replace('/*__ELM_BUNDLE__*/', () => bundledJavaScript)
  .replaceAll('__TOSS_BUILD_COMMIT__', commit)
  .replaceAll('__TOSS_BUILD_SHORT__', commit.slice(0, 7));

const output = join(distributionDirectory, 'index.html');
writeFileSync(output, html);
console.log(`Built ${output} (${Buffer.byteLength(html)} bytes)`);
