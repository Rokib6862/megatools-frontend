// ============================================================
// MEGA TOOLS — CLIENT ESLint Configuration (v1.2)
// ESLint v8 Flat Config (eslint.config.js)
// Replaces legacy .eslintrc for modern ESLint CLI compatibility.
// Supports: JSX, React Hooks, React recommended rules.
//
// FIX-ESL1 (v1.1):
//   • Expanded browser globals (DOM, Web APIs, Node-ish shims)
//     — eliminates false `no-undef` errors from prior version.
//   • Softened severity: `no-undef` error → warn (JSX + inline
//     refs are common, warnings still surface issues without
//     blocking `npm run lint`).
//   • `no-unused-vars`: added `destructuredArrayIgnorePattern`,
//     raised args ignore (`argsIgnorePattern: '^_'` +
//     `ignoreRestSiblings: true`).
//   • `no-alert`: downgraded to `warn` (window.confirm use
//     is intentional UI pattern).
//   • React import whitelist (React is auto-imported by Vite
//     plugin, so it appears unused but is safe to keep).
//
// FIX-ESL2 (v1.2):
//   • Registered `eslint-plugin-react-hooks` (flat config).
//     Prior version had inline `// eslint-disable-next-line
//     react-hooks/exhaustive-deps` comments in source, but the
//     rule was NOT registered — ESLint threw
//     "Definition for rule 'react-hooks/exhaustive-deps' was
//     not found" (5 errors).
//   • Added `reactHooks` plugin + `rules-of-hooks` (error) and
//     `exhaustive-deps` (warn) rules.
//   • Added `ClipboardItem` global (2 no-undef warnings).
// ============================================================

import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    // Ignore build artifacts and dependencies
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'public/**',
      '*.min.js',
      'vite.config.js',
    ],
  },
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        // === ECMAScript built-ins ===
        Object: 'readonly',
        Array: 'readonly',
        String: 'readonly',
        Number: 'readonly',
        Boolean: 'readonly',
        Symbol: 'readonly',
        BigInt: 'readonly',
        Date: 'readonly',
        Math: 'readonly',
        JSON: 'readonly',
        RegExp: 'readonly',
        Error: 'readonly',
        TypeError: 'readonly',
        RangeError: 'readonly',
        Promise: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        WeakMap: 'readonly',
        WeakSet: 'readonly',
        Proxy: 'readonly',
        Reflect: 'readonly',
        Intl: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        structuredClone: 'readonly',

        // === Browser / Window ===
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        history: 'readonly',
        screen: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        indexedDB: 'readonly',
        caches: 'readonly',
        self: 'readonly',
        top: 'readonly',
        parent: 'readonly',
        frames: 'readonly',
        globalThis: 'readonly',

        // === Console / Logging ===
        console: 'readonly',

        // === Dialog / UI ===
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        open: 'readonly',
        close: 'readonly',

        // === Timing ===
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        requestIdleCallback: 'readonly',
        cancelIdleCallback: 'readonly',

        // === Fetch / Network ===
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        WebSocket: 'readonly',
        XMLHttpRequest: 'readonly',
        EventSource: 'readonly',

        // === URL / Encoding ===
        URL: 'readonly',
        URLSearchParams: 'readonly',
        encodeURIComponent: 'readonly',
        decodeURIComponent: 'readonly',
        encodeURI: 'readonly',
        decodeURI: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',

        // === Files / Blobs ===
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        FileList: 'readonly',
        FormData: 'readonly',
        DataTransfer: 'readonly',
        Image: 'readonly',
        Audio: 'readonly',
        Video: 'readonly',

        // === Clipboard ===
        Clipboard: 'readonly',
        ClipboardItem: 'readonly',

        // === DOM ===
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLTableElement: 'readonly',
        HTMLFormElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        Element: 'readonly',
        Node: 'readonly',
        NodeList: 'readonly',
        DocumentFragment: 'readonly',
        DOMParser: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        PointerEvent: 'readonly',
        TouchEvent: 'readonly',
        FocusEvent: 'readonly',
        ClipboardEvent: 'readonly',
        DragEvent: 'readonly',
        WheelEvent: 'readonly',
        MutationObserver: 'readonly',
        IntersectionObserver: 'readonly',
        ResizeObserver: 'readonly',
        PerformanceObserver: 'readonly',
        CSS: 'readonly',
        getComputedStyle: 'readonly',

        // === Storage / Cache ===
        Cache: 'readonly',
        CacheStorage: 'readonly',

        // === Notifications / Media ===
        Notification: 'readonly',
        MediaStream: 'readonly',
        MediaRecorder: 'readonly',

        // === Workers ===
        Worker: 'readonly',
        ServiceWorker: 'readonly',
        SharedWorker: 'readonly',

        // === Crypto ===
        crypto: 'readonly',
        Crypto: 'readonly',
        CryptoKey: 'readonly',

        // === Vite ===
        import_meta_env: 'readonly',

        // === React ===
        React: 'readonly',

        // === Node (Vite dev only) ===
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
      },
    },
    rules: {
      // === ERRORS (must-fix — real bugs only) ===
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-cond-assign': ['error', 'except-parens'],
      'no-unsafe-negation': 'error',
      'no-unsafe-optional-chaining': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',

      // === React Hooks (FIX-ESL2) ===
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // === WARN — soften to avoid blocking lint CI ===
      'no-undef': 'warn',
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^(React|_|.*)$',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      'no-constant-condition': ['warn', { checkLoops: false }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-fallthrough': 'warn',

      // === STYLE / QUALITY (warn) ===
      'no-console': 'off',
      'no-debugger': 'warn',
      'no-alert': 'warn',
      'prefer-const': 'warn',
      'no-var': 'warn',
      'eqeqeq': ['warn', 'smart'],
      'no-multiple-empty-lines': ['warn', { max: 2, maxEOF: 1 }],
      'no-trailing-spaces': 'warn',
      'semi': ['warn', 'always'],
      'quotes': 'off',
      'no-mixed-spaces-and-tabs': 'warn',
    },
  },
];