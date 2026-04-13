# Devcontainer

This devcontainer is intended for building and iterating on the Safenet Beta Wallet Extension inside VS Code.

## What it does

- uses a Node-based development container
- installs npm dependencies on container creation
- gives you a ready environment for `npm install`, `npx tsc -b`, and `npx vite build`

## Typical workflow

```bash
npm install
npx tsc -b
npx vite build
node scripts/postbuild.mjs
```

Or simply:

```bash
npm run build
```

## Notes

This environment is mainly for local extension development and build verification.
