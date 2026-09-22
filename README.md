# Toss

[toss.meta-uber-engineer.dev](https://toss.meta-uber-engineer.dev)

Build grouped random selectors. Run them locally. Share complete selectors and
deterministic results through URL fragments.

New visitors receive one of four editable starters—Technology, Subscription,
Food, or Vacation—selected consistently from proxy IP plus User-Agent. Shared
links and locally saved tosses override the starter.

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

## Agent prompt

Open [toss.meta-uber-engineer.dev/agent](https://toss.meta-uber-engineer.dev/agent) for a copyable
prompt containing the complete binary codec and reference link encoder.

## Container

Build the single-file app first, then the nginx image:

```sh
npm run build
docker build -t toss .
docker run --rm -p 8080:80 toss
```

## Production deployment

From the sibling deployment repository:

```sh
cd ../hetzner_playground
bin/kamal toss deploy
```

The wrapper runs `npm run build` in Toss before deploying. This compiles Elm with
`elm make --optimize`, minifies it, and rebuilds `dist/index.html` from the HTML
template. Running `elm make` alone does not update the deployable HTML. If you
bypass the wrapper and use Kamal or Docker directly, run `npm run build` first.
