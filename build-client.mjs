import {readFileSync, writeFileSync} from 'node:fs';
const read = name => readFileSync(new URL(`public/${name}`, import.meta.url), 'utf8');
writeFileSync(new URL('public/app.js', import.meta.url),
  read('donation-check.js') + '\n' + read('app-main.js') + '\n' + read('centers-ui.js'));
