import { resolve } from 'path';
import { mergeConfig, defineConfig } from 'vite';
import { crx, ManifestV3Export } from '@crxjs/vite-plugin';
import baseConfig, { baseManifest, baseBuildOptions } from './vite.config.base'

const outDir = resolve(__dirname, 'dist_firefox');

// Firefox-specific manifest additions for AMO signing
const firefoxManifest = {
  ...baseManifest,
  browser_specific_settings: {
    gecko: {
      id: "vpn-check@jackyliu.personal",
      strict_min_version: "109.0"
    }
  }
} as unknown as ManifestV3Export;

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [
      crx({
        manifest: firefoxManifest,
        browser: 'firefox',
        contentScripts: {
          injectCss: true,
        }
      })
    ],
    build: {
      ...baseBuildOptions,
      outDir
    },
    publicDir: resolve(__dirname, 'public'),
  })
)
