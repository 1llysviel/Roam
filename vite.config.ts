import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 子路径从仓库名推导（owner/repo → /repo/）；本地为 /。
// 若仓库名为 <owner>.github.io 则部署在根路径。
function base(): string {
  if (process.env.ROAM_BASE) return process.env.ROAM_BASE;
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
  if (!repo || repo.endsWith('.github.io')) return '/';
  return `/${repo}/`;
}

export default defineConfig({
  base: base(),
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 600 },
});
