import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    server: {
        // 明示的にヘッダーを上書きして、外部からのポリシーを緩和を試みる
        headers: {
            'Content-Security-Policy': "worker-src 'self' blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval';"
        }
    },
    worker: {
        // Workerの形式を 'es' に指定（Monaco Editor用）
        format: 'es'
    },
    build: {
        outDir: 'dist',
    }
});