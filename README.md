![](/assets/monocart.jpg)  

[![npm](https://img.shields.io/npm/v/monocart)](https://www.npmjs.com/package/monocart)
[![npm](https://img.shields.io/npm/dw/monocart)](https://www.npmjs.com/package/monocart)

# monocart
> Web UI automation test tool based on [playwright](https://github.com/microsoft/playwright) with [playwright-report-grid](https://github.com/cenfun/playwright-report-grid)

## Example Project
[https://github.com/cenfun/monocart-test](https://github.com/cenfun/monocart-test)

## Install
```sh
npm i monocart
```

## Usage
```sh
npx monocart test [config.default.js] -s <spec> -d
```

## Features

- playwright and @playwright/test
- lint test codes (eslint + check naming)
- building client library helper
- customize test config
- customize test reports (playwright-report-grid)
- code coverage/request capturer (TODO)