import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await cp('site', 'dist', { recursive: true });
await mkdir('dist/vendor');
await cp('node_modules/fflate/umd/index.js', 'dist/vendor/fflate.js');
await cp('node_modules/fflate/LICENSE', 'dist/vendor/fflate-LICENSE.txt');
