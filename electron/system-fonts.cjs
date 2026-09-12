const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc', '.otc', '.dfont']);
const fontsByPostscriptName = new Map();

function isFontFile(filePath) {
	return FONT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function validName(value) {
	const name = String(value || '').trim();
	return name && name !== '.' && name !== '..' ? name : null;
}

function addFont({ postscriptName, family, fullName, style, filePath }) {
	const psName = validName(postscriptName);
	if (!psName || !filePath || !fs.existsSync(filePath) || !isFontFile(filePath)) return;
	if (fontsByPostscriptName.has(psName)) return;
	const familyName = validName(family) || path.basename(filePath, path.extname(filePath));
	const styleName = validName(style) || '';
	fontsByPostscriptName.set(psName, {
		postscriptName: psName,
		family: familyName,
		fullName: validName(fullName) || `${familyName}${styleName ? ` ${styleName}` : ''}`,
		style: styleName,
		fileName: path.basename(filePath),
		filePath
	});
}

async function scanMacFonts() {
	try {
		const { stdout } = await execFileAsync('system_profiler', ['SPFontsDataType', '-json'], {
			maxBuffer: 128 * 1024 * 1024
		});
		const families = JSON.parse(stdout).SPFontsDataType || [];
		for (const family of families) {
			const filePath = family.path;
			for (const face of family.typefaces || []) {
				addFont({
					postscriptName: face._name || face.postscriptName,
					family: face.family || family._name,
					fullName: face.fullname || face.fullName,
					style: face.style,
					filePath
				});
			}
		}
		return fontsByPostscriptName.size > 0;
	} catch {
		return false;
	}
}

async function scanFontconfig() {
	try {
		const { stdout } = await execFileAsync(
			'fc-list',
			['--format=%{file}\t%{family}\t%{style}\t%{fullname}\t%{postscriptname}\n'],
			{
				maxBuffer: 128 * 1024 * 1024
			}
		);
		for (const line of stdout.split(/\r?\n/)) {
			const [filePath, family, style, fullName, postscriptName] = line.split('\t');
			addFont({
				postscriptName:
					postscriptName || path.basename(filePath || '', path.extname(filePath || '')),
				family: family?.split(',')[0],
				fullName,
				style,
				filePath
			});
		}
		return fontsByPostscriptName.size > 0;
	} catch {
		return false;
	}
}

function walkFontDirectories(directories) {
	const visited = new Set();
	const visit = (directory) => {
		if (!directory || visited.has(directory)) return;
		visited.add(directory);
		let entries;
		try {
			entries = fs.readdirSync(directory, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const filePath = path.join(directory, entry.name);
			if (entry.isDirectory()) visit(filePath);
			else if (entry.isFile() && isFontFile(filePath)) {
				const baseName = path.basename(filePath, path.extname(filePath));
				addFont({
					postscriptName: baseName,
					family: baseName,
					fullName: baseName,
					filePath
				});
			}
		}
	};
	for (const directory of directories) visit(directory);
}

async function scanSystemFonts() {
	fontsByPostscriptName.clear();
	if (process.platform === 'darwin') await scanMacFonts();
	if (process.platform === 'linux') await scanFontconfig();

	if (fontsByPostscriptName.size === 0) {
		const home = os.homedir();
		const directories =
			process.platform === 'win32'
				? [
						path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts'),
						path.join(
							process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'),
							'Microsoft',
							'Windows',
							'Fonts'
						)
					]
				: process.platform === 'darwin'
					? ['/System/Library/Fonts', '/Library/Fonts', path.join(home, 'Library', 'Fonts')]
					: [
							'/usr/share/fonts',
							'/usr/local/share/fonts',
							path.join(home, '.local', 'share', 'fonts'),
							path.join(home, '.fonts')
						];
		walkFontDirectories(directories);
	}
}

async function listSystemFonts() {
	await scanSystemFonts();
	return Array.from(fontsByPostscriptName.values())
		.map(({ filePath, ...font }) => font)
		.sort((a, b) => a.family.localeCompare(b.family) || a.fullName.localeCompare(b.fullName));
}

async function readSystemFont(postscriptName) {
	if (!fontsByPostscriptName.has(postscriptName)) await scanSystemFonts();
	const font = fontsByPostscriptName.get(postscriptName);
	if (!font) return null;
	try {
		return {
			fileName: font.fileName,
			data: new Uint8Array(await fs.promises.readFile(font.filePath))
		};
	} catch {
		return null;
	}
}

module.exports = { listSystemFonts, readSystemFont };
