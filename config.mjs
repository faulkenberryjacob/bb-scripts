import { context } from 'esbuild';
import { BitburnerPlugin } from 'esbuild-bitburner-plugin';

import chokidar from 'chokidar';
import fs from 'fs/promises';


/** @type import('esbuild-bitburner-plugin').PluginExtension*/

const DataExtension = {
    setup() {
    }, //Run once on plugin startup
    beforeConnect() {
    }, //Run once before the game connects
    afterConnect(remoteAPI) {
        let watcher = chokidar.watch(['./data', './config']);
        watcher.on('add', path => pushFile(remoteAPI, path));
        watcher.on('change', path => pushFile(remoteAPI, path)); //Run every time after the game (re)connects

    },
    beforeBuild() {
    }, //Run before every build process
    afterBuild(remoteAPI) {
    }, //Run after build, before results are uploaded into the game
};

function normalizePath(path) {
  return path.replace(/\\/g, '/');
}


async function pushFile(remoteAPI, path) {
    path = normalizePath(path);
    await fs.stat(path, (err, stat) => {
        if (err) {
            console.log(err);
            return;
        }
    });

    console.log(`Pushing file ${path}`);

    let content = await fs.readFile(path, 'utf8', (err, data) => {
            if (err) {
                console.log(err);
                return;
            }
            console.log(data);
        }
    );

    console.log(content);
    console.log(path)

    return remoteAPI.pushFile({server: 'home', filename: path, content: content}).catch(err => {
        console.log(err);
        console.log(`${path} - ${content}`);
    });
}



const createContext = async () => await context({
  entryPoints: [
    'src/servers/**/*.ts',
  ],
  outbase: "./src/servers",
  outdir: "./build",
  plugins: [
    BitburnerPlugin({
      port: 12525,
      types: 'NetscriptDefinitions.d.ts',
      remoteDebugging: true,
      mirror: {
      },
      distribute: {
      },
      extensions: [DataExtension]
    })
  ],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  logLevel: 'debug',
});

const ctx = await createContext();
ctx.watch();