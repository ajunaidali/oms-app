const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src', 'assets', 'logos', 'logoOnly.webp');
const res = path.join(root, 'android', 'app', 'src', 'main', 'res');

const legacy = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

const foreground = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
};

async function transparentLogo() {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let index = 0; index < data.length; index += 4) {
    if (data[index] < 24 && data[index + 1] < 24 && data[index + 2] < 24) data[index + 3] = 0;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
}

async function render(size, padding, background) {
  const logo = await transparentLogo();
  const inner = Math.round(size * (1 - padding * 2));
  const resized = await logo
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: resized, gravity: 'centre' }])
    .png()
    .toBuffer();
}

async function main() {
  const white = { r: 255, g: 255, b: 255, alpha: 1 };
  const teal = { r: 19, g: 78, b: 74, alpha: 1 };
  for (const [density, size] of Object.entries(legacy)) {
    const dir = path.join(res, `mipmap-${density}`);
    fs.mkdirSync(dir, { recursive: true });
    const icon = await render(size, 0.12, white);
    fs.writeFileSync(path.join(dir, 'ic_launcher.png'), icon);
    fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), icon);
  }
  for (const [density, size] of Object.entries(foreground)) {
    const dir = path.join(res, `mipmap-${density}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), await render(size, 0.18, { r: 0, g: 0, b: 0, alpha: 0 }));
  }
  const splash = await render(512, 0.18, { r: 0, g: 0, b: 0, alpha: 0 });
  fs.writeFileSync(path.join(res, 'drawable', 'splash_logo.png'), splash);
  fs.writeFileSync(path.join(root, 'src', 'assets', 'logos', 'logo-mark.png'), await render(512, 0.08, teal));
  console.log('icons written');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
