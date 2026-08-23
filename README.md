# Toss

[toss.quitter.live](https://toss.quitter.live)

Build grouped random selectors. Run them locally. Share complete selectors and
deterministic results through URL fragments.

## Development

```sh
npm install
npm run build
npm run serve
```

Open `http://127.0.0.1:4243`.

## Verification

```sh
npm run test:e2e
```

The production artifact is `dist/index.html`. It contains the optimized Elm
application, styles, local persistence bridge, and positional Base64URL codec.

## Container

Build the single-file app first, then the nginx image:

```sh
npm run build
docker build -t toss .
docker run --rm -p 8080:80 toss
```
