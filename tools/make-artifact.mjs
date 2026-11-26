// Turns the single-file build into an artifact page body (the artifact host adds doctype/head/body).
import fs from 'fs';
const html = fs.readFileSync('dist-artifact/index.html', 'utf8');
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
const title = (head.match(/<title>[\s\S]*?<\/title>/) || ['<title>Ping Palace</title>'])[0];
const styles = head.match(/<style[\s\S]*?<\/style>/g) || [];
const scripts = head.match(/<script[\s\S]*?<\/script>/g) || [];
const out = [title, '<meta name="description" content="Run a chaotic first-person net café.">', ...styles, body.trim(), ...scripts].join('\n');
fs.writeFileSync('dist-artifact/ping-palace.html', out);
console.log('artifact page:', (out.length / 1024 / 1024).toFixed(2), 'MB', 'scripts:', scripts.length, 'styles:', styles.length);
