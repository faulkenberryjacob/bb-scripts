import { context } from 'esbuild';
import { BitburnerPlugin } from 'esbuild-bitburner-plugin';

const createContext = async () => await context({
  entryPoints: [
    'src/servers/**/*.js',
    'src/servers/**/*.jsx',
    'src/servers/**/*.ts',
    'src/servers/**/*.tsx',
  ],
  outbase: "./src/servers",
  outdir: "./build",
  plugins: [
    BitburnerPlugin({
      port: 12525,
      types: 'NetscriptDefinitions.d.ts',
      mirror: {
      },
      distribute: {
      },
    })
  ],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  logLevel: 'debug',
});

const ctx = await createContext();
ctx.watch();