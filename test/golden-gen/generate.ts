import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { magickCommand } from '../../tooling/magick-path';

const MAGICK = magickCommand();
const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const SOURCE_DIR = path.join(REPO_ROOT, 'test/fixtures/source');
const GOLDEN_DIR = path.join(REPO_ROOT, 'test/fixtures/golden');
const MANIFEST_PATH = path.join(GOLDEN_DIR, 'manifest.json');

const SOURCES = [
	'source-100x100.png',
	'source-101x99.png',
	'source-alpha-100x100.png',
	'source-icc-100x100.png',
	'source.jpg'
];

const allFixtures: Record<string, string> = {};

function runMagick(args: string[]) {
	const display = args.join(' ');
	console.log(`  magick ${display}`);
	try {
		execSync(`"${MAGICK}" ${args.map((a) => `"${a}"`).join(' ')}`, {
			stdio: 'pipe',
			encoding: 'utf-8'
		});
	} catch (e: unknown) {
		const stderr =
			e instanceof Error && 'stderr' in e ? String((e as { stderr: Buffer }).stderr) : '';
		throw new Error(`magick failed: ${display}\n${stderr}`, { cause: e });
	}
}

function newGolden(operation: string, sourceFile: string, extraArgs: string[], outputName: string) {
	const opDir = path.join(GOLDEN_DIR, operation);
	fs.mkdirSync(opDir, { recursive: true });

	const inputPath = path.join(SOURCE_DIR, sourceFile);
	const outPath = path.join(opDir, outputName);
	const args = [inputPath, ...extraArgs, '-depth', '8', '-define', 'png:color-type=2', outPath];
	runMagick(args);

	const relPath = `test/fixtures/golden/${operation}/${outputName}`.replace(/\\/g, '/');
	allFixtures[relPath] = args.join(' ');
}

function genAllSources(operation: string, extraArgs: string[], outputNamePattern: string) {
	for (const src of SOURCES) {
		const base = path.parse(src).name;
		const outName = outputNamePattern.replace('{base}', base);
		newGolden(operation, src, extraArgs, outName);
	}
}

console.log('=== Regenerating golden fixtures ===');
console.log(`Magick: ${MAGICK}`);
console.log(`Source: ${SOURCE_DIR}`);
console.log(`Golden: ${GOLDEN_DIR}`);
console.log();

// -- RESIZE --
console.log('-- resize --');
genAllSources('resize', ['-resize', '50x50'], '{base}-50x50.png');

// -- ROTATE --
console.log('-- rotate --');
genAllSources('rotate', ['-rotate', '90'], '{base}-90.png');

// -- ROTATE 180 --
console.log('-- rotate 180 --');
genAllSources('rotate', ['-rotate', '180'], '{base}-180.png');

// -- ROTATE -90 --
console.log('-- rotate -90 --');
genAllSources('rotate', ['-rotate', '-90'], '{base}-m90.png');

// -- FLIP --
console.log('-- flip --');
genAllSources('flip', ['-flip'], '{base}.png');

// -- FLOP --
console.log('-- flop --');
genAllSources('flop', ['-flop'], '{base}.png');

// -- AUTO-ORIENT --
console.log('-- auto-orient --');
genAllSources('auto-orient', ['-auto-orient'], '{base}.png');

// -- CROP --
console.log('-- crop --');
genAllSources('crop', ['-gravity', 'NorthWest', '-crop', '60x60+0+0', '+repage'], '{base}.png');

// -- CROP gravity positions --
const GRAVITY_FLAGS: [string, string][] = [
	['center', 'Center'],
	['northwest', 'NorthWest'],
	['north', 'North'],
	['northeast', 'NorthEast'],
	['west', 'West'],
	['east', 'East'],
	['southwest', 'SouthWest'],
	['south', 'South'],
	['southeast', 'SouthEast']
];
for (const [label, flag] of GRAVITY_FLAGS) {
	console.log(`-- crop ${label} --`);
	genAllSources(`crop-${label}`, ['-gravity', flag, '-crop', '60x60+0+0', '+repage'], '{base}.png');
}

// -- TRIM --
console.log('-- trim --');
genAllSources('trim', ['-trim', '+repage'], '{base}.png');

// -- DESKEW --
console.log('-- deskew --');
genAllSources('deskew', ['-deskew', '20%'], '{base}.png');

// -- SHAVE --
console.log('-- shave --');
genAllSources('shave', ['-shave', '10x5'], '{base}.png');

// -- EXTENT --
console.log('-- extent --');
genAllSources(
	'extent',
	['-gravity', 'Center', '-background', '#ffffff', '-extent', '120x120'],
	'{base}-120x120-center-white.png'
);

// -- BORDER --
console.log('-- border --');
genAllSources('border', ['-bordercolor', '#e74c3c', '-border', '5x5'], '{base}-5px-red.png');

// -- MODULATE --
console.log('-- modulate --');
genAllSources('modulate', ['-modulate', '120,150,110'], '{base}.png');

// -- BRIGHTNESS-CONTRAST --
console.log('-- brightness-contrast --');
genAllSources('brightness-contrast', ['-brightness-contrast', '0,30'], '{base}.png');

// -- NORMALIZE --
console.log('-- normalize --');
genAllSources('normalize', ['-normalize'], '{base}.png');

// -- AUTO-LEVEL --
console.log('-- auto-level --');
genAllSources('auto-level', ['-auto-level'], '{base}.png');

// -- LEVELS --
console.log('-- levels --');
genAllSources('levels', ['-level', '10%,90%,1.2'], '{base}-all.png');

// -- LEVEL-COLORS --
// Same channel note as auto-gamma: wasm defaults to Composite (RGB) channels
// when no channel is passed; the CLI's `-level-colors` default channel set
// behaves differently, so force RGB for parity.
console.log('-- level-colors --');
genAllSources(
	'level-colors',
	['-channel', 'RGB', '-level-colors', '#e74c3c,#3498db', '+channel'],
	'{base}.png'
);

// -- INVERSE-LEVEL-COLORS --
// The CLI expresses the inverse level-colors operation with the `+` prefix
// (`+level-colors`), mirroring `+level`/`-level`.
console.log('-- inverse-level-colors --');
genAllSources(
	'inverse-level-colors',
	['-channel', 'RGB', '+level-colors', '#e74c3c,#3498db', '+channel'],
	'{base}.png'
);

// -- THRESHOLD --
console.log('-- threshold --');
genAllSources('threshold', ['-threshold', '60%'], '{base}.png');

// -- SIGMOIDAL-CONTRAST --
console.log('-- sigmoidal-contrast --');
genAllSources('sigmoidal-contrast', ['-sigmoidal-contrast', '5,50'], '{base}.png');

// -- COLOR-SPACE --
console.log('-- color-space --');
genAllSources('color-space', ['-colorspace', 'Gray'], '{base}-gray.png');

// -- COLOR-SPACE HSL --
console.log('-- color-space HSL --');
genAllSources('color-space', ['-colorspace', 'HSL'], '{base}-hsl.png');

// -- COLOR-SPACE HSV --
console.log('-- color-space HSV --');
genAllSources('color-space', ['-colorspace', 'HSV'], '{base}-hsv.png');

// -- COLOR-SPACE Lab --
console.log('-- color-space Lab --');
genAllSources('color-space', ['-colorspace', 'Lab'], '{base}-lab.png');

// -- GRAYSCALE --
console.log('-- grayscale --');
genAllSources('grayscale', ['-grayscale', 'Rec709Luminance'], '{base}.png');

// -- SEPIA-TONE --
console.log('-- sepia-tone --');
genAllSources('sepia-tone', ['-sepia-tone', '80%'], '{base}.png');

// -- CHARCOAL --
console.log('-- charcoal --');
genAllSources('charcoal', ['-charcoal', '2'], '{base}-radius2.png');

// -- NEGATE --
console.log('-- negate --');
genAllSources('negate', ['-channel', 'RGB', '-negate'], '{base}.png');

// -- CANNY-EDGE --
console.log('-- canny-edge --');
genAllSources('canny-edge', ['-canny', '2x0.75+10%+30%'], '{base}.png');

// -- OIL-PAINT --
console.log('-- oil-paint --');
genAllSources('oil-paint', ['-paint', '3'], '{base}.png');

// -- SOLARIZE --
console.log('-- solarize --');
genAllSources('solarize', ['-channel', 'RGB', '-solarize', '50%'], '{base}.png');

// -- BILATERAL-BLUR --
console.log('-- bilateral-blur --');
genAllSources('bilateral-blur', ['-bilateral-blur', '5x5+1.5+1.0'], '{base}.png');

// -- BLUR --
console.log('-- blur --');
genAllSources('blur', ['-blur', '3x1.5'], '{base}.png');

// -- SHARPEN --
console.log('-- sharpen --');
genAllSources('sharpen', ['-sharpen', '2x1'], '{base}.png');

// -- ADAPTIVE-SHARPEN --
console.log('-- adaptive-sharpen --');
genAllSources('adaptive-sharpen', ['-adaptive-sharpen', '2x1'], '{base}.png');

// -- ADAPTIVE-BLUR --
console.log('-- adaptive-blur --');
genAllSources('adaptive-blur', ['-adaptive-blur', '2x1'], '{base}.png');

// -- AUTO-GAMMA --
// magick-wasm autoGamma() defaults to Composite channels (RGB+alpha), which
// behaves like the CLI's `-channel RGB`. The CLI's default `-auto-gamma`
// operates on a different (no-op) channel set, so force RGB for parity.
console.log('-- auto-gamma --');
genAllSources('auto-gamma', ['-channel', 'RGB', '-auto-gamma', '+channel'], '{base}.png');

// -- AUTO-THRESHOLD --
console.log('-- auto-threshold --');
genAllSources('auto-threshold', ['-auto-threshold', 'Kapur'], '{base}.png');

// -- BLACK-THRESHOLD --
// Same channel note as auto-gamma: wasm defaults to Composite (RGB) channels.
console.log('-- black-threshold --');
genAllSources(
	'black-threshold',
	['-channel', 'RGB', '-black-threshold', '20%', '+channel'],
	'{base}.png'
);

// -- WHITE-THRESHOLD --
console.log('-- white-threshold --');
genAllSources(
	'white-threshold',
	['-channel', 'RGB', '-white-threshold', '80%', '+channel'],
	'{base}.png'
);

// -- CLAHE --
console.log('-- clahe --');
genAllSources('clahe', ['-clahe', '8x8+128+2'], '{base}.png');

// -- GAUSSIAN-BLUR --
console.log('-- gaussian-blur --');
genAllSources('gaussian-blur', ['-gaussian-blur', '3x1.5'], '{base}.png');

// -- MOTION-BLUR --
console.log('-- motion-blur --');
genAllSources('motion-blur', ['-motion-blur', '3x1.5+45'], '{base}.png');

// -- CLUT --
console.log('-- clut --');
const clutDir = path.join(GOLDEN_DIR, 'clut');
fs.mkdirSync(clutDir, { recursive: true });

// Black-to-white gradient identity (saved as TrueColor so per-channel multiply works)
const identityClutPath = path.join(clutDir, '_identity.png');
runMagick([
	'-size',
	'256x1',
	'gradient:',
	'-negate',
	'-depth',
	'8',
	'-define',
	'png:color-type=2',
	identityClutPath
]);

// Warm CLUT: R*1.1, G*1.0, B*0.8
const warmClutPath = path.join(clutDir, '_warm.png');
runMagick([
	identityClutPath,
	'-channel',
	'R',
	'-evaluate',
	'Multiply',
	'1.1',
	'-channel',
	'G',
	'-evaluate',
	'Multiply',
	'1.0',
	'-channel',
	'B',
	'-evaluate',
	'Multiply',
	'0.8',
	'-depth',
	'8',
	'-define',
	'png:color-type=2',
	warmClutPath
]);

// Vintage CLUT: (t*0.85+20) * {1.05, 0.95, 0.85}
// Use per-channel -fx from blank image (prevents grayscale collapse)
const vintageClutPath = path.join(clutDir, '_vintage.png');
runMagick([
	'-size',
	'256x1',
	'-depth',
	'8',
	'xc:',
	'-channel',
	'R',
	'-fx',
	'(i/255*0.85 + 20/255)*1.05',
	'-channel',
	'G',
	'-fx',
	'(i/255*0.85 + 20/255)*0.95',
	'-channel',
	'B',
	'-fx',
	'(i/255*0.85 + 20/255)*0.85',
	'-define',
	'png:color-type=2',
	vintageClutPath
]);

for (const src of SOURCES) {
	const base = path.parse(src).name;
	newGolden('clut', src, [warmClutPath, '-clut', '-interpolate', 'Catrom'], `${base}-warm.png`);
	newGolden(
		'clut',
		src,
		[vintageClutPath, '-clut', '-interpolate', 'Bilinear'],
		`${base}-vintage.png`
	);
}

// Cleanup temp CLUT files
for (const f of [identityClutPath, warmClutPath, vintageClutPath]) {
	try {
		fs.unlinkSync(f);
	} catch {
		/* ignore */
	}
}

// -- STRIP --
console.log('-- strip --');
genAllSources('strip', ['-strip'], '{base}.png');

// -- FORMAT CONVERSION --
console.log('-- format-conversion --');
for (const src of SOURCES) {
	const base = path.parse(src).name;
	newGolden('format-conversion', src, ['-quality', '85'], `${base}-to-webp.webp`);
	newGolden('format-conversion', src, ['-quality', '85'], `${base}-to-jpeg.jpg`);
}

// -- QUALITY --
console.log('-- quality --');
genAllSources('quality', ['-quality', '75'], '{base}-q75.jpg');

// -- COMBINED --
console.log('-- combined --');
{
	const op = 'combined';
	newGolden(
		op,
		'source-100x100.png',
		['-resize', '50x50', '-rotate', '90', '-sepia-tone', '80%'],
		'source-100x100-resize50-rotate90-sepia80.png'
	);
}

// -- ANNOTATE --
console.log('-- annotate --');
const fontPath = path.join(REPO_ROOT, 'test', 'fixtures', 'font.ttf');
genAllSources(
	'annotate',
	[
		'-font',
		fontPath,
		'-pointsize',
		'24',
		'-fill',
		'#ffffff',
		'-gravity',
		'Center',
		'-annotate',
		'0',
		'Hello'
	],
	'{base}-default.png'
);
genAllSources(
	'annotate',
	[
		'-font',
		fontPath,
		'-pointsize',
		'36',
		'-fill',
		'#e74c3c',
		'-gravity',
		'Center',
		'-annotate',
		'45',
		'Rotated'
	],
	'{base}-angle.png'
);
genAllSources(
	'annotate',
	[
		'-font',
		fontPath,
		'-pointsize',
		'48',
		'-fill',
		'#3498db',
		'-gravity',
		'Center',
		'-stroke',
		'#000000',
		'-strokewidth',
		'2',
		'-annotate',
		'0',
		'Outline'
	],
	'{base}-stroke.png'
);
genAllSources(
	'annotate',
	[
		'-font',
		fontPath,
		'-pointsize',
		'20',
		'-fill',
		'#2ecc71',
		'-gravity',
		'Northwest',
		'-annotate',
		'0',
		'Top Left'
	],
	'{base}-northwest.png'
);
genAllSources(
	'annotate',
	[
		'-font',
		fontPath,
		'-pointsize',
		'24',
		'-fill',
		'#f39c12',
		'-gravity',
		'Center',
		'-annotate',
		'+30+20',
		'Offset'
	],
	'{base}-center-offset.png'
);
genAllSources(
	'annotate',
	[
		'-font',
		fontPath,
		'-pointsize',
		'20',
		'-fill',
		'#9b59b6',
		'-gravity',
		'Northwest',
		'-annotate',
		'+10+10',
		'NW Offset'
	],
	'{base}-northwest-offset.png'
);

// -- Update manifest.json --
console.log();
console.log('=== Updating manifest.json ===');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8').replace(/^\uFEFF/, ''));
const imVersion = execSync(`"${MAGICK}" -version`, { encoding: 'utf-8' }).match(
	/ImageMagick (\d+\.\d+\.\d+-\d+)/
)?.[1];
if (!imVersion) throw new Error('Could not determine ImageMagick version from magick -version');
const packageJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8'));
manifest.tool = {
	path: 'tooling/imagemagick (auto-downloaded)',
	version: `ImageMagick ${imVersion}`,
	source: `https://github.com/ImageMagick/ImageMagick/releases/tag/${imVersion}`
};
manifest['magick-wasm'] = {
	package: '@imagemagick/magick-wasm',
	version: packageJson.dependencies['@imagemagick/magick-wasm'].replace(/^\^/, ''),
	bundledImageMagick: imVersion
};
manifest.fixtures = allFixtures;
manifest.generated = new Date().toISOString().slice(0, 10);
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 4) + '\n');
console.log(`Manifest updated with ${Object.keys(allFixtures).length} fixture entries`);
console.log('=== Done ===');
