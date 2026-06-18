const JavaScriptObfuscator = require('javascript-obfuscator');
const { minify: minifyHTML } = require('html-minifier-terser');
const fs = require('fs');
const path = require('path');

// ========== JavaScript Obfuscation ==========
const jsSourceFile = path.join(__dirname, 'public', 'dashboard.js');
const jsOutputFile = path.join(__dirname, 'public', 'dashboard.min.js');

console.log('[JS] Reading source file...');
const jsSourceCode = fs.readFileSync(jsSourceFile, 'utf8');

console.log('[JS] Obfuscating JavaScript...');
const obfuscationResult = JavaScriptObfuscator.obfuscate(jsSourceCode, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    debugProtection: false,
    debugProtectionInterval: 0,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: true,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 4,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
});

console.log('[JS] Writing obfuscated file...');
fs.writeFileSync(jsOutputFile, obfuscationResult.getObfuscatedCode());

console.log('✓ JavaScript obfuscation complete!');
console.log(`  Input:  ${jsSourceFile}`);
console.log(`  Output: ${jsOutputFile}`);
console.log(`  Original size: ${(jsSourceCode.length / 1024).toFixed(2)} KB`);
console.log(`  Obfuscated size: ${(obfuscationResult.getObfuscatedCode().length / 1024).toFixed(2)} KB`);
console.log('');

// ========== HTML Minification ==========
const htmlSourceFile = path.join(__dirname, 'public', 'dashboard.html');
const htmlOutputFile = path.join(__dirname, 'public', 'dashboard.min.html');

console.log('[HTML] Reading source file...');
const htmlSourceCode = fs.readFileSync(htmlSourceFile, 'utf8');

console.log('[HTML] Minifying HTML...');
minifyHTML(htmlSourceCode, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    minifyCSS: true,
    minifyJS: false, // Don't minify inline JS (we handle it separately)
    useShortDoctype: true
}).then(minifiedHTML => {
    console.log('[HTML] Writing minified file...');
    fs.writeFileSync(htmlOutputFile, minifiedHTML);

    console.log('✓ HTML minification complete!');
    console.log(`  Input:  ${htmlSourceFile}`);
    console.log(`  Output: ${htmlOutputFile}`);
    console.log(`  Original size: ${(htmlSourceCode.length / 1024).toFixed(2)} KB`);
    console.log(`  Minified size: ${(minifiedHTML.length / 1024).toFixed(2)} KB`);
    console.log('');
    console.log('✓ Build complete! All files processed.');
}).catch(err => {
    console.error('[HTML] Minification failed:', err);
    process.exit(1);
});
